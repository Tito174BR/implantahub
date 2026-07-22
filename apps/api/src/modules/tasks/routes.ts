import { randomUUID } from 'node:crypto';

import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTaskSchema } from '@implantahub/contracts';

import { withTenant } from '../../db/client.js';
import { memberships, projects, tasks } from '../../db/schema.js';
import { recordAudit } from '../../lib/audit.js';
import { envelope, listEnvelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { addOutboxEvent } from '../../lib/outbox.js';

const idParams = z.object({ taskId: z.string().uuid() });
const statusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']),
  reason: z.string().max(5000).nullable().optional(),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/tasks', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Tasks'], summary: 'Listar tarefas' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const query = z.object({
      projectId: z.string().uuid().optional(),
      search: z.string().trim().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(request.query);

    const rows = await withTenant(tenantId, (tenantDb) => {
      const conditions = [
        eq(tasks.tenantId, tenantId),
        isNull(tasks.deletedAt),
      ];
      if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));
      if (query.search) {
        const pattern = `%${query.search}%`;
        conditions.push(or(
          ilike(tasks.title, pattern),
          ilike(tasks.description, pattern),
          ilike(projects.name, pattern),
        )!);
      }

      return tenantDb.select({
        id: tasks.id,
        tenantId: tasks.tenantId,
        projectId: tasks.projectId,
        projectName: projects.name,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        assigneeUserId: tasks.assigneeUserId,
        completedAt: tasks.completedAt,
        lockVersion: tasks.lockVersion,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      }).from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(asc(tasks.dueAt), asc(tasks.title))
        .limit(query.limit);
    });

    return listEnvelope(request, rows, query.limit);
  });

  app.post('/api/v1/tasks', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Tasks'], summary: 'Criar tarefa' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = createTaskSchema.parse(request.body);
    const id = randomUUID();

    const created = await withTenant(tenantId, async (tenantDb) => {
      const [project] = await tenantDb.select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.tenantId, tenantId),
          eq(projects.id, body.projectId),
          isNull(projects.deletedAt),
        )).limit(1);

      if (!project) throw new AppError('PROJECT_NOT_FOUND', 'Projeto não encontrado.', 404);

      if (body.assigneeUserId) {
        const [assignee] = await tenantDb.select({ userId: memberships.userId })
          .from(memberships)
          .where(and(
            eq(memberships.tenantId, tenantId),
            eq(memberships.userId, body.assigneeUserId),
            eq(memberships.status, 'ACTIVE'),
          ))
          .limit(1);
        if (!assignee) {
          throw new AppError('TASK_ASSIGNEE_INVALID', 'O responsável selecionado não pertence ao workspace ativo.', 400);
        }
      }

      const [row] = await tenantDb.insert(tasks).values({
        id,
        tenantId,
        projectId: body.projectId,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        assigneeUserId: body.assigneeUserId ?? null,
      }).returning();

      await recordAudit(tenantDb, {
        tenantId,
        actorId: request.user.sub,
        action: 'task.created',
        entityType: 'TASK',
        entityId: id,
        correlationId: request.apiMeta.correlationId,
        metadata: { projectId: body.projectId },
      });

      return row;
    });

    return reply.status(201).send(envelope(request, created));
  });

  app.patch('/api/v1/tasks/:taskId/status', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Tasks'], summary: 'Alterar status da tarefa' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { taskId } = idParams.parse(request.params);
    const body = statusSchema.parse(request.body);

    const updated = await withTenant(tenantId, async (tenantDb) => {
      const [current] = await tenantDb.select().from(tasks).where(and(
        eq(tasks.tenantId, tenantId),
        eq(tasks.id, taskId),
        isNull(tasks.deletedAt),
      )).limit(1);

      if (!current) throw new AppError('TASK_NOT_FOUND', 'Tarefa não encontrada.', 404);

      const [row] = await tenantDb.update(tasks).set({
        status: body.status,
        completedAt: body.status === 'COMPLETED' ? new Date() : null,
        updatedAt: new Date(),
        lockVersion: sql`${tasks.lockVersion} + 1`,
      }).where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, taskId))).returning();

      await recordAudit(tenantDb, {
        tenantId,
        actorId: request.user.sub,
        action: 'task.status-changed',
        entityType: 'TASK',
        entityId: taskId,
        correlationId: request.apiMeta.correlationId,
        metadata: {
          previousStatus: current.status,
          newStatus: body.status,
          reason: body.reason ?? null,
        },
      });

      if (body.status === 'COMPLETED') {
        await addOutboxEvent(tenantDb, {
          tenantId,
          aggregateType: 'TASK',
          aggregateId: taskId,
          eventType: 'implantahub.task.completed.v1',
          correlationId: request.apiMeta.correlationId,
          payload: {
            taskId,
            projectId: current.projectId,
            completedByUserId: request.user.sub,
          },
        });
      }

      return row!;
    });

    return envelope(request, updated);
  });
}
