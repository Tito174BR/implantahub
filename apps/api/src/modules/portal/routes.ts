import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function portalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/portal/projects', {
    preHandler: app.requireRole('CUSTOMER'),
    schema: { tags: ['Customer Portal'], summary: 'Listar projetos visíveis ao cliente' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT p.id, p.code, p.name, p.description, p.status, p.priority,
             p.planned_start_at, p.planned_end_at, c.trade_name, c.legal_name
      FROM app.portal_access pa
      JOIN app.project_projects p ON p.customer_id = pa.customer_id AND p.tenant_id = pa.tenant_id
      JOIN app.customer_customers c ON c.id = p.customer_id
      WHERE pa.tenant_id = $1
        AND pa.user_id = $2
        AND pa.status = 'ACTIVE'
        AND pa.permissions ? 'READ_PROJECTS'
        AND p.deleted_at IS NULL
      ORDER BY p.updated_at DESC
    `, [tenantId, request.user.sub]));
    return envelope(request, result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      priority: row.priority,
      plannedStartAt: row.planned_start_at,
      plannedEndAt: row.planned_end_at,
      customerName: row.trade_name ?? row.legal_name,
    })));
  });

  app.get('/api/v1/portal/projects/:projectId', {
    preHandler: app.requireRole('CUSTOMER'),
    schema: { tags: ['Customer Portal'], summary: 'Consultar visão resumida do projeto' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { projectId } = paramsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT p.*
      FROM app.portal_access pa
      JOIN app.project_projects p ON p.customer_id = pa.customer_id AND p.tenant_id = pa.tenant_id
      WHERE pa.tenant_id = $1 AND pa.user_id = $2 AND p.id = $3
        AND pa.status = 'ACTIVE' AND pa.permissions ? 'READ_PROJECTS'
      LIMIT 1
    `, [tenantId, request.user.sub, projectId]));
    const project = result.rows[0];
    if (!project) throw new AppError('PORTAL_PROJECT_NOT_FOUND', 'Projeto não encontrado.', 404);

    const [phases, milestones, documents] = await withTenantClient(tenantId, async (client) => Promise.all([
      client.query(`SELECT id, name, status, progress, planned_end_at FROM app.project_phases WHERE tenant_id = $1 AND project_id = $2 ORDER BY position`, [tenantId, projectId]),
      client.query(`SELECT id, title, status, due_at FROM app.project_milestones WHERE tenant_id = $1 AND project_id = $2 ORDER BY due_at NULLS LAST`, [tenantId, projectId]),
      client.query(`
        SELECT d.id, d.title, d.category, d.current_version, d.updated_at,
               version.id AS version_id, version.file_name
        FROM app.content_documents d
        LEFT JOIN LATERAL (
          SELECT v.id, v.file_name
          FROM app.content_document_versions v
          WHERE v.document_id = d.id AND v.tenant_id = d.tenant_id AND v.status = 'AVAILABLE'
          ORDER BY v.version DESC
          LIMIT 1
        ) version ON true
        WHERE d.tenant_id = $1 AND d.project_id = $2 AND d.status = 'ACTIVE'
          AND EXISTS (
            SELECT 1
            FROM app.portal_access pa
            WHERE pa.tenant_id = d.tenant_id
              AND pa.user_id = $3
              AND pa.customer_id = d.customer_id
              AND pa.status = 'ACTIVE'
              AND pa.permissions ? 'READ_DOCUMENTS'
          )
        ORDER BY d.updated_at DESC
      `, [tenantId, projectId, request.user.sub]),
    ]));

    return envelope(request, {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        status: project.status,
        plannedStartAt: project.planned_start_at,
        plannedEndAt: project.planned_end_at,
      },
      phases: phases.rows,
      milestones: milestones.rows,
      documents: documents.rows,
    });
  });
}
