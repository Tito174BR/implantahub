import { randomUUID } from 'node:crypto';

import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createCustomerSchema } from '@implantahub/contracts';

import { withTenant } from '../../db/client.js';
import { customers } from '../../db/schema.js';
import { recordAudit } from '../../lib/audit.js';
import { envelope, listEnvelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';

const idParams = z.object({ customerId: z.string().uuid() });
const updateSchema = createCustomerSchema.partial();
const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/customers', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Customers'], summary: 'Listar clientes' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const query = listSchema.parse(request.query);
    const conditions = [eq(customers.tenantId, tenantId), isNull(customers.deletedAt)];
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(or(
        ilike(customers.code, pattern),
        ilike(customers.legalName, pattern),
        ilike(customers.tradeName, pattern),
        ilike(customers.taxIdentifier, pattern),
      )!);
    }
    const rows = await withTenant(tenantId, (tenantDb) =>
      tenantDb.select().from(customers)
        .where(and(...conditions))
        .orderBy(asc(customers.legalName))
        .limit(query.limit),
    );
    return listEnvelope(request, rows, query.limit);
  });

  app.post('/api/v1/customers', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Customers'], summary: 'Criar cliente' },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = createCustomerSchema.parse(request.body);
    const id = randomUUID();

    const created = await withTenant(tenantId, async (tenantDb) => {
      const [row] = await tenantDb.insert(customers).values({
        id,
        tenantId,
        code: body.code,
        legalName: body.legalName,
        tradeName: body.tradeName ?? null,
        taxIdentifier: body.taxIdentifier ?? null,
      }).returning();

      await recordAudit(tenantDb, {
        tenantId,
        actorId: request.user.sub,
        action: 'customer.created',
        entityType: 'CUSTOMER',
        entityId: id,
        correlationId: request.apiMeta.correlationId,
        metadata: { code: body.code },
      });

      return row;
    });

    return reply.status(201).send(envelope(request, created));
  });

  app.get('/api/v1/customers/:customerId', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Customers'], summary: 'Consultar cliente' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { customerId } = idParams.parse(request.params);
    const [row] = await withTenant(tenantId, (tenantDb) =>
      tenantDb.select().from(customers).where(and(
        eq(customers.tenantId, tenantId),
        eq(customers.id, customerId),
        isNull(customers.deletedAt),
      )).limit(1),
    );
    if (!row) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    return envelope(request, row);
  });

  app.patch('/api/v1/customers/:customerId', {
    preHandler: app.requireRole('ADMIN', 'MANAGER'),
    schema: { tags: ['Customers'], summary: 'Atualizar cliente' },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { customerId } = idParams.parse(request.params);
    const body = updateSchema.parse(request.body);

    const [updated] = await withTenant(tenantId, async (tenantDb) => {
      const [current] = await tenantDb.select().from(customers).where(and(
        eq(customers.tenantId, tenantId),
        eq(customers.id, customerId),
        isNull(customers.deletedAt),
      )).limit(1);

      if (!current) return [];

      const rows = await tenantDb.update(customers).set({
        code: body.code ?? current.code,
        legalName: body.legalName ?? current.legalName,
        tradeName: body.tradeName === undefined ? current.tradeName : body.tradeName,
        taxIdentifier: body.taxIdentifier === undefined
          ? current.taxIdentifier
          : body.taxIdentifier,
        updatedAt: new Date(),
        lockVersion: sql`${customers.lockVersion} + 1`,
      }).where(and(
        eq(customers.tenantId, tenantId),
        eq(customers.id, customerId),
        isNull(customers.deletedAt),
      )).returning();

      if (rows[0]) {
        await recordAudit(tenantDb, {
          tenantId,
          actorId: request.user.sub,
          action: 'customer.updated',
          entityType: 'CUSTOMER',
          entityId: customerId,
          correlationId: request.apiMeta.correlationId,
          metadata: { fields: Object.keys(body) },
        });
      }
      return rows;
    });

    if (!updated) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
    return envelope(request, updated);
  });
}
