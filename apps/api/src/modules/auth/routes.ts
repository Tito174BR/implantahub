import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '../../db/client.js';
import {
  memberships,
  passwordCredentials,
  refreshTokens,
  sessions,
  tenants,
  users,
} from '../../db/schema.js';
import { env } from '../../config/env.js';
import { createOpaqueToken, hashToken } from '../../lib/crypto.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'A nova senha precisa ser diferente da senha atual.',
  path: ['newPassword'],
});

const refreshCookieName = 'implantahub_refresh';

function accessToken(
  app: FastifyInstance,
  input: { userId: string; sessionId: string; tenantId?: string | null; role?: string | null },
): string {
  return app.jwt.sign(
    {
      sub: input.userId,
      sid: input.sessionId,
      tenantId: input.tenantId ?? null,
      role: input.role ?? null,
    },
    { expiresIn: '15m' },
  );
}

async function issueRefreshToken(
  sessionId: string,
  tokenFamilyId = randomUUID(),
): Promise<string> {
  const token = createOpaqueToken();
  await db.insert(refreshTokens).values({
    id: randomUUID(),
    sessionId,
    tokenFamilyId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
  });
  return token;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: env.NODE_ENV === 'production' ? 5 : 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Authentication'],
      summary: 'Autenticar usuário',
      security: [],
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    }

    const [credentials] = await db
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, user.id))
      .limit(1);

    if (!credentials || !(await argon2.verify(credentials.passwordHash, body.password))) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
    }

    const sessionId = randomUUID();
    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      status: 'ACTIVE',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
    });

    const refreshToken = await issueRefreshToken(sessionId);
    reply.setCookie(refreshCookieName, refreshToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: false,
      maxAge: 30 * 24 * 60 * 60,
    });

    return envelope(request, {
      accessToken: accessToken(app, { userId: user.id, sessionId }),
      expiresIn: 900,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      },
      requiresTenantSelection: true,
    });
  });

  app.get('/api/v1/auth/tenants', {
    preHandler: app.authenticate,
    schema: { tags: ['Authentication'], summary: 'Listar tenants disponíveis' },
  }, async (request) => {
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.tradeName,
        legalName: tenants.legalName,
        slug: tenants.slug,
        status: tenants.status,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(and(
        eq(memberships.userId, request.user.sub),
        eq(memberships.status, 'ACTIVE'),
        eq(tenants.status, 'ACTIVE'),
      ));

    return envelope(request, rows.map((row) => ({
      id: row.id,
      name: row.name ?? row.legalName,
      slug: row.slug,
      status: row.status,
      role: row.role,
    })));
  });

  app.post('/api/v1/auth/select-tenant', {
    preHandler: app.authenticate,
    schema: { tags: ['Authentication'], summary: 'Selecionar tenant ativo' },
  }, async (request) => {
    const body = selectTenantSchema.parse(request.body);
    const [membership] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(and(
        eq(memberships.userId, request.user.sub),
        eq(memberships.tenantId, body.tenantId),
        eq(memberships.status, 'ACTIVE'),
        eq(tenants.status, 'ACTIVE'),
      ))
      .limit(1);

    if (!membership) {
      throw new AppError('AUTH_TENANT_ACCESS_DENIED', 'Você não possui acesso a esta empresa.', 403);
    }

    await db
      .update(sessions)
      .set({ tenantId: body.tenantId, lastSeenAt: new Date() })
      .where(and(eq(sessions.id, request.user.sid), eq(sessions.userId, request.user.sub)));

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, body.tenantId)).limit(1);
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 'Empresa não encontrada.', 404);

    return envelope(request, {
      accessToken: accessToken(app, {
        userId: request.user.sub,
        sessionId: request.user.sid,
        tenantId: tenant.id,
        role: membership.role,
      }),
      expiresIn: 900,
      tenant: {
        id: tenant.id,
        name: tenant.tradeName ?? tenant.legalName,
        slug: tenant.slug,
        status: tenant.status,
        role: membership.role,
      },
    });
  });

  app.post('/api/v1/auth/refresh', {
    schema: { tags: ['Authentication'], summary: 'Renovar sessão', security: [] },
  }, async (request, reply) => {
    const token = request.cookies[refreshCookieName];
    if (!token) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Refresh token ausente.', 401);
    }

    const tokenHash = hashToken(token);
    const [stored] = await db
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        isNull(refreshTokens.usedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ))
      .returning();

    if (!stored) {
      const [suspect] = await db.select().from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
      if (suspect) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.tokenFamilyId, suspect.tokenFamilyId));
        await db.update(sessions).set({ status: 'REVOKED', revokedAt: new Date() })
          .where(eq(sessions.id, suspect.sessionId));
      }
      throw new AppError('AUTH_REFRESH_TOKEN_REUSED', 'Sessão inválida. Entre novamente.', 401);
    }

    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        tenantId: sessions.tenantId,
        displayName: users.displayName,
        email: users.email,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(
        eq(sessions.id, stored.sessionId),
        eq(sessions.status, 'ACTIVE'),
        eq(users.status, 'ACTIVE'),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ))
      .limit(1);

    if (!session) {
      throw new AppError('AUTH_SESSION_REVOKED', 'A sessão foi encerrada.', 401);
    }

    let role: string | null = null;
    let tenantContext: { id: string; name: string; slug: string; role: string } | null = null;
    if (session.tenantId) {
      const [membership] = await db
        .select({
          role: memberships.role,
          tenantId: tenants.id,
          tradeName: tenants.tradeName,
          legalName: tenants.legalName,
          slug: tenants.slug,
        })
        .from(memberships)
        .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
        .where(and(
          eq(memberships.tenantId, session.tenantId),
          eq(memberships.userId, session.userId),
          eq(memberships.status, 'ACTIVE'),
          eq(tenants.status, 'ACTIVE'),
        ))
        .limit(1);
      if (!membership) {
        await db.update(sessions).set({ status: 'REVOKED', revokedAt: new Date() }).where(eq(sessions.id, session.id));
        throw new AppError('AUTH_TENANT_ACCESS_DENIED', 'Seu acesso ao workspace ativo foi removido.', 403);
      }
      role = membership.role;
      tenantContext = {
        id: membership.tenantId,
        name: membership.tradeName ?? membership.legalName,
        slug: membership.slug,
        role: membership.role,
      };
    }

    const nextToken = await issueRefreshToken(session.id, stored.tokenFamilyId);

    reply.setCookie(refreshCookieName, nextToken, {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: false,
      maxAge: 30 * 24 * 60 * 60,
    });

    return envelope(request, {
      accessToken: accessToken(app, {
        userId: session.userId,
        sessionId: session.id,
        tenantId: session.tenantId,
        role,
      }),
      expiresIn: 900,
      user: {
        id: session.userId,
        displayName: session.displayName,
        email: session.email,
      },
      tenant: tenantContext,
    });
  });

  app.get('/api/v1/auth/me', {
    preHandler: app.authenticate,
    schema: { tags: ['Authentication'], summary: 'Consultar perfil autenticado' },
  }, async (request) => {
    const [user] = await db.select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, request.user.sub)).limit(1);
    if (!user) throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado.', 404);
    return envelope(request, user);
  });

  app.patch('/api/v1/auth/me', {
    preHandler: app.authenticate,
    schema: { tags: ['Authentication'], summary: 'Atualizar perfil autenticado' },
  }, async (request) => {
    const body = updateProfileSchema.parse(request.body);
    const [updated] = await db.update(users).set({
      displayName: body.displayName,
      updatedAt: new Date(),
    }).where(eq(users.id, request.user.sub)).returning({
      id: users.id, displayName: users.displayName, email: users.email,
    });
    if (!updated) throw new AppError('USER_NOT_FOUND', 'Usuário não encontrado.', 404);
    return envelope(request, updated);
  });

  app.post('/api/v1/auth/change-password', {
    preHandler: app.authenticate,
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: { tags: ['Authentication'], summary: 'Alterar senha autenticada' },
  }, async (request) => {
    const body = changePasswordSchema.parse(request.body);
    const [credential] = await db.select().from(passwordCredentials)
      .where(eq(passwordCredentials.userId, request.user.sub)).limit(1);
    if (!credential || !(await argon2.verify(credential.passwordHash, body.currentPassword))) {
      throw new AppError('AUTH_CURRENT_PASSWORD_INVALID', 'A senha atual não confere.', 400);
    }

    const passwordHash = await argon2.hash(body.newPassword, { type: argon2.argon2id });
    await db.update(passwordCredentials).set({
      passwordHash,
      passwordChangedAt: new Date(),
      failedAttempts: 0,
      blockedUntil: null,
    }).where(eq(passwordCredentials.userId, request.user.sub));

    await db.update(sessions).set({ status: 'REVOKED', revokedAt: new Date() }).where(and(
      eq(sessions.userId, request.user.sub),
      ne(sessions.id, request.user.sid),
      eq(sessions.status, 'ACTIVE'),
    ));

    return envelope(request, { changed: true, otherSessionsRevoked: true });
  });

  app.post('/api/v1/auth/logout', {
    preHandler: app.authenticate,
    schema: { tags: ['Authentication'], summary: 'Encerrar sessão' },
  }, async (request, reply) => {
    await db
      .update(sessions)
      .set({ status: 'REVOKED', revokedAt: new Date() })
      .where(eq(sessions.id, request.user.sid));
    reply.clearCookie(refreshCookieName, { path: '/api/v1/auth' });
    return reply.status(204).send();
  });
}
