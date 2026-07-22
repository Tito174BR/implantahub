import { and, eq, gt } from 'drizzle-orm';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { db } from '../db/client.js';
import { memberships, sessions, tenants, users } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async function authenticate(request: FastifyRequest) {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Sessão inválida ou expirada.', 401);
    }

    const [session] = await db.select({ id: sessions.id, tenantId: sessions.tenantId })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(
        eq(sessions.id, request.user.sid),
        eq(sessions.userId, request.user.sub),
        eq(sessions.status, 'ACTIVE'),
        eq(users.status, 'ACTIVE'),
        gt(sessions.expiresAt, new Date()),
      ))
      .limit(1);

    if (!session) {
      throw new AppError('AUTH_SESSION_REVOKED', 'A sessão foi encerrada. Entre novamente.', 401);
    }

    if ((session.tenantId ?? null) !== (request.user.tenantId ?? null)) {
      throw new AppError('AUTH_TENANT_CHANGED', 'O workspace ativo foi alterado. Renove a sessão.', 401);
    }

    if (request.user.tenantId) {
      const [membership] = await db.select({ role: memberships.role })
        .from(memberships)
        .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
        .where(and(
          eq(memberships.tenantId, request.user.tenantId),
          eq(memberships.userId, request.user.sub),
          eq(memberships.status, 'ACTIVE'),
          eq(tenants.status, 'ACTIVE'),
        ))
        .limit(1);

      if (!membership) {
        throw new AppError('AUTH_TENANT_ACCESS_DENIED', 'Seu acesso a este workspace foi removido.', 403);
      }
      if (membership.role !== request.user.role) {
        throw new AppError('AUTH_ROLE_CHANGED', 'Suas permissões foram alteradas. Renove a sessão.', 401);
      }
    }
  });

  app.decorate('requireTenant', async function requireTenant(request: FastifyRequest) {
    await app.authenticate(request);
    if (!request.user.tenantId) {
      throw new AppError('AUTH_TENANT_REQUIRED', 'Selecione uma empresa para continuar.', 401);
    }
  });

  app.decorate('requireRole', function requireRole(...roles: string[]) {
    return async function roleGuard(request: FastifyRequest, _reply: FastifyReply) {
      await app.requireTenant(request);
      if (!request.user.role || !roles.includes(request.user.role)) {
        throw new AppError('PERMISSION_DENIED', 'Você não possui permissão para esta ação.', 403);
      }
    };
  });
});
