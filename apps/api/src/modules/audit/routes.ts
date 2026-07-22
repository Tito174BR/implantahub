import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { withTenant } from '../../db/client.js';
import { auditEvents } from '../../db/schema.js';
import { listEnvelope } from '../../lib/envelope.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/audit-events', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Audit'], summary: 'Listar eventos de auditoria' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const rows = await withTenant(tenantId, (tenantDb) =>
      tenantDb.select().from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(100),
    );
    return listEnvelope(request, rows, 100);
  });
}
