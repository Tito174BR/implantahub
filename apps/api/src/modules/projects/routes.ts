import { randomUUID } from 'node:crypto';

import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createProjectSchema,
  projectStatusSchema,
  type ProjectStatus,
} from '@implantahub/contracts';

import { withTenant } from '../../db/client.js';
import { customers, memberships, projects } from '../../db/schema.js';
import { assertProjectTransition } from '../../domain/project-status.js';
import { recordAudit } from '../../lib/audit.js';
import { envelope, listEnvelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { addOutboxEvent } from '../../lib/outbox.js';
import { notificationsQueue } from '../../lib/queues.js';

const idParams = z.object({ projectId: z.string().uuid() });
const updateSchema = createProjectSchema.omit({
  customerId: true,
  code: true,
}).partial();
const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
const transitionSchema = z.object({
  targetStatus: projectStatusSchema,
  reason: z.string().max(5000).nullable().optional(),
  force: z.boolean().default(false),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/projects', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Projects'], summary: 'Listar projetos' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const query = listSchema.parse(request.query);
    const conditions = [eq(projects.tenantId, tenantId), isNull(projects.deletedAt)];
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(or(
        ilike(projects.code, pattern),
        ilike(projects.name, pattern),
        ilike(projects.description, pattern),
        ilike(customers.tradeName, pattern),
        ilike(customers.legalName, pattern),
      )!);
    }
    const rows = await withTenant(tenantId, (tenantDb) =>
      tenantDb.select({
        id: projects.id,
        tenantId: projects.tenantId,
        customerId: projects.customerId,
        customerName: customers.tradeName,
        customerLegalName: customers.legalName,
        code: projects.code,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        priority: projects.priority,
        criticality: projects.criticality,
        managerUserId: projects.managerUserId,
        plannedStartAt: projects.plannedStartAt,
        plannedEndAt: projects.plannedEndAt,
        actualStartAt: projects.actualStartAt,
        actualEndAt: projects.actualEndAt,
        lockVersion: projects.lockVersion,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      }).from(projects)
        .innerJoin(customers, eq(projects.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(asc(projects.name))
        .limit(query.limit),
    );
    return listEnvelope(request, rows.map((row) => ({
      ...row,
      customerName: row.customerName ?? row.customerLegalName,
    })), query.limit);
  });

  app.post('/api/v1/projects', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Projects'], summary: 'Criar projeto' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = createProjectSchema.parse(request.body);
    const id = randomUUID();

    const created = await withTenant(tenantId, async (tenantDb) => {
      const [customer] = await tenantDb.select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.tenantId, tenantId),
          eq(customers.id, body.customerId),
          isNull(customers.deletedAt),
        )).limit(1);

      if (!customer) {
        throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
      }

      const [manager] = await tenantDb.select({ userId: memberships.userId })
        .from(memberships)
        .where(and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.userId, body.managerUserId),
          eq(memberships.status, 'ACTIVE'),
        ))
        .limit(1);
      if (!manager) {
        throw new AppError('PROJECT_MANAGER_INVALID', 'O gerente selecionado não pertence ao workspace ativo.', 400);
      }

      const [row] = await tenantDb.insert(projects).values({
        id,
        tenantId,
        customerId: body.customerId,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        managerUserId: body.managerUserId,
        priority: body.priority,
        criticality: body.criticality,
        plannedStartAt: body.plannedStartAt ? new Date(body.plannedStartAt) : null,
        plannedEndAt: body.plannedEndAt ? new Date(body.plannedEndAt) : null,
      }).returning();

      await recordAudit(tenantDb, {
        tenantId,
        actorId: request.user.sub,
        action: 'project.created',
        entityType: 'PROJECT',
        entityId: id,
        correlationId: request.apiMeta.correlationId,
        metadata: { code: body.code },
      });

      await addOutboxEvent(tenantDb, {
        tenantId,
        aggregateType: 'PROJECT',
        aggregateId: id,
        eventType: 'implantahub.project.created.v1',
        correlationId: request.apiMeta.correlationId,
        payload: {
          projectId: id,
          customerId: body.customerId,
          code: body.code,
          name: body.name,
          status: 'DRAFT',
        },
      });

      return row;
    });

    try {
      await notificationsQueue.add('project-created', {
        tenantId,
        projectId: id,
        userId: request.user.sub,
        correlationId: request.apiMeta.correlationId,
        title: 'Projeto criado',
        body: `O projeto ${body.code} — ${body.name} foi criado com sucesso.`,
        link: `/projects/${id}`,
      }, { jobId: `project-created-${id}` });
    } catch (error) {
      request.log.error({ error, projectId: id }, 'failed to enqueue project-created notification');
    }

    return reply.status(201).send(envelope(request, created));
  });

  app.get('/api/v1/projects/:projectId', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Projects'], summary: 'Consultar projeto' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { projectId } = idParams.parse(request.params);
    const [row] = await withTenant(tenantId, (tenantDb) =>
      tenantDb.select().from(projects).where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      )).limit(1),
    );
    if (!row) throw new AppError('PROJECT_NOT_FOUND', 'Projeto não encontrado.', 404);
    return envelope(request, row);
  });

  app.patch('/api/v1/projects/:projectId', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Projects'], summary: 'Atualizar projeto' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { projectId } = idParams.parse(request.params);
    const body = updateSchema.parse(request.body);

    const [updated] = await withTenant(tenantId, async (tenantDb) => {
      const [current] = await tenantDb.select().from(projects).where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      )).limit(1);

      if (!current) return [];

      if (body.managerUserId) {
        const [manager] = await tenantDb.select({ userId: memberships.userId })
          .from(memberships)
          .where(and(
            eq(memberships.tenantId, tenantId),
            eq(memberships.userId, body.managerUserId),
            eq(memberships.status, 'ACTIVE'),
          ))
          .limit(1);
        if (!manager) {
          throw new AppError('PROJECT_MANAGER_INVALID', 'O gerente selecionado não pertence ao workspace ativo.', 400);
        }
      }

      const rows = await tenantDb.update(projects).set({
        name: body.name ?? current.name,
        description: body.description === undefined ? current.description : body.description,
        managerUserId: body.managerUserId ?? current.managerUserId,
        priority: body.priority ?? current.priority,
        criticality: body.criticality ?? current.criticality,
        plannedStartAt: body.plannedStartAt === undefined
          ? current.plannedStartAt
          : body.plannedStartAt
            ? new Date(body.plannedStartAt)
            : null,
        plannedEndAt: body.plannedEndAt === undefined
          ? current.plannedEndAt
          : body.plannedEndAt
            ? new Date(body.plannedEndAt)
            : null,
        updatedAt: new Date(),
        lockVersion: sql`${projects.lockVersion} + 1`,
      }).where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      )).returning();

      if (rows[0]) {
        await recordAudit(tenantDb, {
          tenantId,
          actorId: request.user.sub,
          action: 'project.updated',
          entityType: 'PROJECT',
          entityId: projectId,
          correlationId: request.apiMeta.correlationId,
          metadata: { fields: Object.keys(body) },
        });
      }
      return rows;
    });

    if (!updated) throw new AppError('PROJECT_NOT_FOUND', 'Projeto não encontrado.', 404);
    return envelope(request, updated);
  });

  app.post('/api/v1/projects/:projectId/transitions', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Projects'], summary: 'Alterar status do projeto' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { projectId } = idParams.parse(request.params);
    const body = transitionSchema.parse(request.body);

    const updated = await withTenant(tenantId, async (tenantDb) => {
      const [current] = await tenantDb.select().from(projects).where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      )).limit(1);

      if (!current) throw new AppError('PROJECT_NOT_FOUND', 'Projeto não encontrado.', 404);

      assertProjectTransition(
        current.status as ProjectStatus,
        body.targetStatus,
        body.force && request.user.role === 'ADMIN',
      );

      const [row] = await tenantDb.update(projects).set({
        status: body.targetStatus,
        updatedAt: new Date(),
        actualStartAt:
          body.targetStatus === 'EXECUTING' && !current.actualStartAt
            ? new Date()
            : current.actualStartAt,
        actualEndAt:
          body.targetStatus === 'COMPLETED'
            ? new Date()
            : current.actualEndAt,
        lockVersion: sql`${projects.lockVersion} + 1`,
      }).where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))).returning();

      await recordAudit(tenantDb, {
        tenantId,
        actorId: request.user.sub,
        action: 'project.status-changed',
        entityType: 'PROJECT',
        entityId: projectId,
        correlationId: request.apiMeta.correlationId,
        metadata: {
          previousStatus: current.status,
          newStatus: body.targetStatus,
          reason: body.reason ?? null,
          forced: body.force,
        },
      });

      await addOutboxEvent(tenantDb, {
        tenantId,
        aggregateType: 'PROJECT',
        aggregateId: projectId,
        eventType: 'implantahub.project.status-changed.v1',
        correlationId: request.apiMeta.correlationId,
        payload: {
          projectId,
          previousStatus: current.status,
          newStatus: body.targetStatus,
          changedByUserId: request.user.sub,
          reason: body.reason ?? null,
        },
      });

      return row!;
    });

    return envelope(request, updated);
  });
}
