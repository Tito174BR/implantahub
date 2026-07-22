import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { reportsQueue } from '../../lib/queues.js';

const requestReportSchema = z.object({
  type: z.enum(['EXECUTIVE', 'PORTFOLIO', 'TASKS', 'RISKS', 'DEPLOYMENTS', 'DEFECTS']),
  format: z.enum(['CSV', 'XLSX', 'PDF']),
  filters: z.record(z.string(), z.unknown()).default({}),
});
const paramsSchema = z.object({ reportId: z.string().uuid() });
const reportsRoot = process.env.REPORTS_DIR ?? '/app/storage/reports';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/reports', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Reports'], summary: 'Solicitar relatório assíncrono' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = requestReportSchema.parse(request.body);
    const id = randomUUID();

    await withTenantClient(tenantId, (client) => client.query(`
      INSERT INTO app.reporting_jobs(id, tenant_id, requested_by, type, format, filters)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [id, tenantId, request.user.sub, body.type, body.format, JSON.stringify(body.filters)]));

    try {
      await reportsQueue.add('generate-report', {
        reportId: id,
        tenantId,
        requestedBy: request.user.sub,
        type: body.type,
        format: body.format,
        filters: body.filters,
      }, { jobId: `report-${id}` });
    } catch (error) {
      await withTenantClient(tenantId, (client) => client.query(`
        UPDATE app.reporting_jobs
        SET status = 'FAILED', error_message = $2, finished_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND id = $3
      `, [tenantId, error instanceof Error ? error.message : String(error), id]));
      throw new AppError('REPORT_QUEUE_UNAVAILABLE', 'Não foi possível enfileirar o relatório. Tente novamente em instantes.', 503);
    }

    return reply.status(202).send(envelope(request, { id, status: 'PENDING' }));
  });

  app.get('/api/v1/reports/:reportId/download', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Reports'], summary: 'Baixar relatório concluído' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { reportId } = paramsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT object_key, format, status
      FROM app.reporting_jobs
      WHERE tenant_id = $1 AND id = $2 AND requested_by = $3
      LIMIT 1
    `, [tenantId, reportId, request.user.sub]));
    const report = result.rows[0];
    if (!report) throw new AppError('REPORT_NOT_FOUND', 'Relatório não encontrado.', 404);
    if (report.status !== 'COMPLETED' || !report.object_key) {
      throw new AppError('REPORT_NOT_READY', 'O relatório ainda não está disponível.', 409);
    }

    const filePath = resolve(reportsRoot, basename(report.object_key));
    try { await access(filePath); } catch { throw new AppError('REPORT_FILE_MISSING', 'Arquivo do relatório não encontrado.', 404); }

    const contentTypes: Record<string, string> = {
      CSV: 'text/csv; charset=utf-8',
      XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      PDF: 'application/pdf',
    };
    reply.header('content-type', contentTypes[report.format] ?? 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="${basename(filePath)}"`);
    return reply.send(createReadStream(filePath));
  });
}
