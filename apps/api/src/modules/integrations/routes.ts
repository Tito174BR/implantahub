import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { integrationsQueue } from '../../lib/queues.js';

const connectionParams = z.object({ connectionId: z.string().uuid() });
const jobParams = z.object({ jobId: z.string().uuid() });
const deliveryParams = z.object({ deliveryId: z.string().uuid() });
const inboxSchema = z.object({
  source: z.string().min(2).max(100),
  eventKey: z.string().min(1).max(200),
  eventType: z.string().min(2).max(160),
  payload: z.record(z.string(), z.unknown()),
});

async function enqueueIntegration(jobId: string, tenantId: string): Promise<void> {
  await integrationsQueue.add('run-integration', { integrationJobId: jobId, tenantId }, {
    jobId: `integration-${jobId}-${Date.now()}`,
  });
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/integration-connections/:connectionId/test', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Integrations'], summary: 'Testar conexão externa' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { connectionId } = connectionParams.parse(request.params);
    const jobId = randomUUID();

    await withTenantClient(tenantId, async (client) => {
      const connection = await client.query(
        `SELECT id FROM app.integration_connections WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, connectionId],
      );
      if (!connection.rows[0]) throw new AppError('INTEGRATION_NOT_FOUND', 'Conexão não encontrada.', 404);
      await client.query(`
        INSERT INTO app.integration_jobs(id, tenant_id, connection_id, job_type, status, payload)
        VALUES ($1, $2, $3, 'CONNECTION_TEST', 'PENDING', '{}'::jsonb)
      `, [jobId, tenantId, connectionId]);
    });

    try {
      await enqueueIntegration(jobId, tenantId);
    } catch (error) {
      await withTenantClient(tenantId, (client) => client.query(`
        UPDATE app.integration_jobs
        SET status = 'FAILED', last_error = $3, finished_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, jobId, error instanceof Error ? error.message : String(error)]));
      throw new AppError('INTEGRATION_QUEUE_UNAVAILABLE', 'Não foi possível enfileirar o teste de integração.', 503);
    }
    return reply.status(202).send(envelope(request, { jobId, status: 'PENDING' }));
  });

  app.post('/api/v1/integration-jobs/:jobId/run', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Integrations'], summary: 'Executar ou reprocessar job de integração' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { jobId } = jobParams.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      UPDATE app.integration_jobs
      SET status = 'PENDING', scheduled_at = now(), started_at = NULL,
          finished_at = NULL, last_error = NULL, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id
    `, [tenantId, jobId]));
    if (!result.rows[0]) throw new AppError('INTEGRATION_JOB_NOT_FOUND', 'Job não encontrado.', 404);
    try {
      await enqueueIntegration(jobId, tenantId);
    } catch (error) {
      await withTenantClient(tenantId, (client) => client.query(`
        UPDATE app.integration_jobs
        SET status = 'FAILED', last_error = $3, finished_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND id = $2
      `, [tenantId, jobId, error instanceof Error ? error.message : String(error)]));
      throw new AppError('INTEGRATION_QUEUE_UNAVAILABLE', 'Não foi possível enfileirar o teste de integração.', 503);
    }
    return reply.status(202).send(envelope(request, { jobId, status: 'PENDING' }));
  });

  app.post('/api/v1/webhook-deliveries/:deliveryId/retry', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Integrations'], summary: 'Reprocessar entrega de webhook' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { deliveryId } = deliveryParams.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      UPDATE app.integration_webhook_deliveries
      SET status = 'PENDING', attempt_count = 0, response_status = NULL,
          response_body = NULL, next_attempt_at = now(), delivered_at = NULL, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id
    `, [tenantId, deliveryId]));
    if (!result.rows[0]) throw new AppError('WEBHOOK_DELIVERY_NOT_FOUND', 'Entrega não encontrada.', 404);
    return reply.status(202).send(envelope(request, { deliveryId, status: 'PENDING' }));
  });

  app.post('/api/v1/integration-inbox', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Integrations'], summary: 'Registrar evento idempotente na Inbox' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = inboxSchema.parse(request.body);
    const id = randomUUID();
    const result = await withTenantClient(tenantId, async (client) => {
      const inserted = await client.query(`
        INSERT INTO app.integration_inbox_events(
          id, tenant_id, source, event_key, event_type, payload
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (tenant_id, source, event_key) DO NOTHING
        RETURNING id, status, received_at
      `, [id, tenantId, body.source, body.eventKey, body.eventType, JSON.stringify(body.payload)]);
      if (inserted.rows[0]) return { ...inserted.rows[0], duplicate: false };
      const existing = await client.query(`
        SELECT id, status, received_at
        FROM app.integration_inbox_events
        WHERE tenant_id = $1 AND source = $2 AND event_key = $3
        LIMIT 1
      `, [tenantId, body.source, body.eventKey]);
      return { ...existing.rows[0], duplicate: true };
    });
    return reply.status(result.duplicate ? 200 : 201).send(envelope(request, result));
  });
}
