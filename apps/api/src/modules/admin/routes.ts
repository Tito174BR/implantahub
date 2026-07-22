import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { withTenantClient } from '../../db/client.js';
import { createOpaqueToken, hashToken } from '../../lib/crypto.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { notificationsQueue } from '../../lib/queues.js';

const createInvitationSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(160),
  role: z.enum(['ADMIN', 'MANAGER', 'ANALYST', 'CUSTOMER']),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(72),
});

const acceptInvitationSchema = z.object({
  tenantId: z.string().uuid(),
  token: z.string().min(32),
  password: z.string().min(10).max(200),
});

const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'ANALYST', 'CUSTOMER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).refine((value) => value.role || value.status, { message: 'Informe role ou status.' });

const idSchema = z.object({ id: z.string().uuid() });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/directory/users', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Administration'], summary: 'Listar usuários ativos do tenant para seleção' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT u.id, u.display_name, u.email, m.role
      FROM app.tenancy_memberships m
      JOIN app.identity_users u ON u.id = m.user_id
      WHERE m.tenant_id = $1 AND m.status = 'ACTIVE' AND u.status = 'ACTIVE'
      ORDER BY u.display_name
    `, [tenantId]));
    return envelope(request, result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
    })));
  });

  app.get('/api/v1/admin/members', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Administration'], summary: 'Listar membros do tenant' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT m.id, m.user_id, u.display_name, u.email, u.status AS user_status,
             m.role, m.status, m.created_at
      FROM app.tenancy_memberships m
      JOIN app.identity_users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      ORDER BY u.display_name
    `, [tenantId]));
    return envelope(request, result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      userStatus: row.user_status,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    })));
  });

  app.patch('/api/v1/admin/members/:id', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Administration'], summary: 'Alterar papel ou status de membro' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = idSchema.parse(request.params);
    const body = updateMemberSchema.parse(request.body);

    const updated = await withTenantClient(tenantId, async (client) => {
      const currentResult = await client.query(`
        SELECT id, user_id, role, status
        FROM app.tenancy_memberships
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
        FOR UPDATE
      `, [tenantId, id]);
      const current = currentResult.rows[0];
      if (!current) throw new AppError('MEMBER_NOT_FOUND', 'Membro não encontrado.', 404);

      const removesActiveAdmin = current.role === 'ADMIN'
        && current.status === 'ACTIVE'
        && ((body.role && body.role !== 'ADMIN') || body.status === 'INACTIVE');
      if (removesActiveAdmin) {
        const count = await client.query(`
          SELECT count(*)::int AS total
          FROM app.tenancy_memberships
          WHERE tenant_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'
        `, [tenantId]);
        if ((count.rows[0]?.total ?? 0) <= 1) {
          throw new AppError('LAST_ADMIN_REQUIRED', 'O workspace precisa manter ao menos um administrador ativo.', 409);
        }
      }

      const result = await client.query(`
        UPDATE app.tenancy_memberships
        SET role = COALESCE($3, role),
            status = COALESCE($4, status)
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, user_id, role, status
      `, [tenantId, id, body.role ?? null, body.status ?? null]);

      if (body.status === 'INACTIVE') {
        await client.query(`
          UPDATE app.identity_sessions
          SET status = 'REVOKED', revoked_at = now()
          WHERE user_id = $1 AND tenant_id = $2 AND status = 'ACTIVE'
        `, [current.user_id, tenantId]);
      }

      await client.query(`
        INSERT INTO app.audit_events(id, tenant_id, actor_id, action, entity_type, entity_id, correlation_id, metadata)
        VALUES ($1, $2, $3, 'membership.updated', 'MEMBERSHIP', $4, $5, $6::jsonb)
      `, [randomUUID(), tenantId, request.user.sub, id, request.apiMeta.correlationId, JSON.stringify({ before: current, after: result.rows[0] })]);
      return result.rows[0];
    });

    return envelope(request, {
      id: updated.id,
      userId: updated.user_id,
      role: updated.role,
      status: updated.status,
    });
  });

  app.get('/api/v1/admin/invitations', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Administration'], summary: 'Listar convites' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const result = await withTenantClient(tenantId, (client) => client.query(`
      SELECT id, email, display_name, role, status, invited_by, expires_at, accepted_at, created_at
      FROM app.tenancy_invitations
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `, [tenantId]));
    return envelope(request, result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    })));
  });

  app.post('/api/v1/admin/invitations', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Administration'], summary: 'Convidar usuário' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = createInvitationSchema.parse(request.body);
    const id = randomUUID();
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);

    await withTenantClient(tenantId, async (client) => {
      await client.query(`
        UPDATE app.tenancy_invitations
        SET status = 'REVOKED'
        WHERE tenant_id = $1 AND email = $2 AND status = 'PENDING'
      `, [tenantId, body.email.toLowerCase()]);

      await client.query(`
        INSERT INTO app.tenancy_invitations(
          id, tenant_id, email, display_name, role, token_hash, invited_by, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [id, tenantId, body.email.toLowerCase(), body.displayName, body.role, hashToken(token), request.user.sub, expiresAt]);

      await client.query(`
        INSERT INTO app.audit_events(id, tenant_id, actor_id, action, entity_type, entity_id, correlation_id, metadata)
        VALUES ($1, $2, $3, 'invitation.created', 'INVITATION', $4, $5, $6::jsonb)
      `, [randomUUID(), tenantId, request.user.sub, id, request.apiMeta.correlationId, JSON.stringify({ email: body.email, role: body.role })]);
    });

    const webOrigin = env.WEB_ORIGIN.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const activationUrl = `${webOrigin}/accept-invitation?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;
    let emailQueued = true;
    try {
      await notificationsQueue.add('invitation-created', {
        tenantId,
        recipientEmail: body.email.toLowerCase(),
        title: 'Seu convite para o ImplantaHub',
        body: `${body.displayName}, você foi convidado para acessar o workspace com o papel ${body.role}. O convite expira em ${body.expiresInHours} horas.`,
        link: activationUrl,
      }, { jobId: `invitation-${id}` });
    } catch (error) {
      emailQueued = false;
      request.log.error({ error, invitationId: id }, 'failed to enqueue invitation email');
    }

    return reply.status(201).send(envelope(request, {
      id,
      email: body.email.toLowerCase(),
      displayName: body.displayName,
      role: body.role,
      expiresAt,
      emailQueued,
      activation: {
        tenantId,
        token,
      },
    }));
  });

  app.post('/api/v1/admin/invitations/:id/revoke', {
    preHandler: app.requireRole('ADMIN'),
    schema: { tags: ['Administration'], summary: 'Revogar convite pendente' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = idSchema.parse(request.params);
    const result = await withTenantClient(tenantId, async (client) => {
      const updated = await client.query(`
        UPDATE app.tenancy_invitations
        SET status = 'REVOKED'
        WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING'
        RETURNING id
      `, [tenantId, id]);
      if (!updated.rows[0]) throw new AppError('INVITATION_NOT_PENDING', 'Convite pendente não encontrado.', 404);
      await client.query(`
        INSERT INTO app.audit_events(id, tenant_id, actor_id, action, entity_type, entity_id, correlation_id)
        VALUES ($1, $2, $3, 'invitation.revoked', 'INVITATION', $4, $5)
      `, [randomUUID(), tenantId, request.user.sub, id, request.apiMeta.correlationId]);
      return updated.rows[0];
    });
    return envelope(request, result);
  });

  app.post('/api/v1/auth/accept-invitation', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { tags: ['Authentication'], summary: 'Aceitar convite', security: [] },
  }, async (request) => {
    const body = acceptInvitationSchema.parse(request.body);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });

    const result = await withTenantClient(body.tenantId, async (client) => {
      const invitationResult = await client.query(`
        SELECT * FROM app.tenancy_invitations
        WHERE tenant_id = $1
          AND token_hash = $2
          AND status = 'PENDING'
          AND expires_at > now()
        LIMIT 1
        FOR UPDATE
      `, [body.tenantId, hashToken(body.token)]);
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new AppError('INVITATION_INVALID', 'Convite inválido ou expirado.', 400);

      const existingResult = await client.query(
        `SELECT id, status FROM app.identity_users WHERE email = $1 LIMIT 1`,
        [invitation.email],
      );
      const existingUser = existingResult.rows[0];
      if (existingUser && existingUser.status !== 'ACTIVE') {
        throw new AppError('INVITATION_USER_INACTIVE', 'A conta vinculada a este e-mail está inativa. Procure um administrador da plataforma.', 403);
      }
      const userId = existingUser?.id ?? randomUUID();

      if (!existingUser) {
        await client.query(`
          INSERT INTO app.identity_users(id, email, display_name)
          VALUES ($1, $2, $3)
        `, [userId, invitation.email, invitation.display_name]);
        await client.query(`
          INSERT INTO app.identity_password_credentials(user_id, password_hash)
          VALUES ($1, $2)
        `, [userId, passwordHash]);
      } else {
        const credentialResult = await client.query(`
          SELECT password_hash FROM app.identity_password_credentials WHERE user_id = $1 LIMIT 1
        `, [userId]);
        const credential = credentialResult.rows[0];
        if (!credential || !(await argon2.verify(credential.password_hash, body.password))) {
          throw new AppError('INVITATION_EXISTING_PASSWORD_INVALID', 'Esta conta já existe. Informe a senha atual para vincular o novo workspace.', 400);
        }
      }

      await client.query(`
        INSERT INTO app.tenancy_memberships(id, tenant_id, user_id, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, user_id) DO UPDATE
          SET role = EXCLUDED.role, status = 'ACTIVE'
      `, [randomUUID(), body.tenantId, userId, invitation.role]);

      await client.query(`
        UPDATE app.tenancy_invitations
        SET status = 'ACCEPTED', accepted_at = now()
        WHERE id = $1
      `, [invitation.id]);

      await client.query(`
        INSERT INTO app.audit_events(id, tenant_id, actor_id, action, entity_type, entity_id, correlation_id, metadata)
        VALUES ($1, $2, $3, 'invitation.accepted', 'INVITATION', $4, $5, $6::jsonb)
      `, [
        randomUUID(),
        body.tenantId,
        userId,
        invitation.id,
        request.apiMeta.correlationId,
        JSON.stringify({ email: invitation.email, role: invitation.role }),
      ]);

      return { userId, email: invitation.email, displayName: invitation.display_name, role: invitation.role };
    });

    return envelope(request, result);
  });
}
