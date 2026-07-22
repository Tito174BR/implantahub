import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { withTenantClient } from '../../db/client.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';

const paramsSchema = z.object({ notificationId: z.string().uuid() });

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/notifications/:notificationId/read', {
    preHandler: app.requireTenant,
    schema: { tags: ['Notifications'], summary: 'Marcar notificação como lida' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { notificationId } = paramsSchema.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(`
      UPDATE app.notification_notifications
      SET status = 'READ', read_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND user_id = $3
      RETURNING id, status, read_at
    `, [tenantId, notificationId, request.user.sub]));
    if (!result.rows[0]) throw new AppError('NOTIFICATION_NOT_FOUND', 'Notificação não encontrada.', 404);
    return envelope(request, {
      id: result.rows[0].id,
      status: result.rows[0].status,
      readAt: result.rows[0].read_at,
    });
  });

  app.post('/api/v1/notifications/read-all', {
    preHandler: app.requireTenant,
    schema: { tags: ['Notifications'], summary: 'Marcar todas como lidas' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const result = await withTenantClient(tenantId, (client) => client.query(`
      UPDATE app.notification_notifications
      SET status = 'READ', read_at = COALESCE(read_at, now()), updated_at = now()
      WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL
    `, [tenantId, request.user.sub]));
    return envelope(request, { updated: result.rowCount ?? 0 });
  });
}
