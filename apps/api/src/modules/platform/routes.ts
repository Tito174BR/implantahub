import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { withTenantClient } from '../../db/client.js';
import { hashToken } from '../../lib/crypto.js';
import { envelope } from '../../lib/envelope.js';
import { AppError } from '../../lib/errors.js';
import { encryptSecret } from '../../lib/secrets.js';
import { platformResources, type ResourceDefinition, type ResourceField } from './catalog.js';

const idParams = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).catchall(z.string().max(200).optional());
const bodySchema = z.record(z.string(), z.unknown());

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [snakeToCamel(key), camelize(item)]),
    );
  }
  return value;
}

function quote(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function normalizeValue(field: ResourceField, value: unknown): unknown {
  if (value === '' || value === undefined) return null;
  if (value === null) return null;
  if (field.type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new AppError('VALIDATION_ERROR', `${field.api} deve ser numérico.`, 400);
    return parsed;
  }
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  }
  if (field.type === 'json') {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { throw new AppError('VALIDATION_ERROR', `${field.api} deve conter JSON válido.`, 400); }
    }
    return value;
  }
  if (field.type === 'date') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new AppError('VALIDATION_ERROR', `${field.api} deve conter uma data válida.`, 400);
    return date;
  }
  return String(value);
}


function transformWriteValue(field: ResourceField, value: unknown): unknown {
  const normalized = normalizeValue(field, value);
  if (normalized === null) return null;
  if (field.sensitive === 'hash') return hashToken(String(normalized));
  if (field.sensitive === 'encrypt') return encryptSecret(normalized);
  return normalized;
}

function sanitizeRow(definition: ResourceDefinition, row: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...row };
  for (const field of definition.fields) {
    if (field.sensitive) delete clone[field.column];
  }
  return clone;
}

function fieldFor(definition: ResourceDefinition, apiName: string): ResourceField | undefined {
  return definition.fields.find((field) => field.api === apiName);
}

async function auditMutation(
  client: PoolClient,
  request: FastifyRequest,
  definition: ResourceDefinition,
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(`
    INSERT INTO app.audit_events(
      id, tenant_id, actor_id, action, entity_type, entity_id, correlation_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
  `, [
    randomUUID(), request.user.tenantId, request.user.sub, action,
    definition.key.toUpperCase().replaceAll('-', '_'), entityId,
    request.apiMeta.correlationId, JSON.stringify(metadata),
  ]);

  await client.query(`
    INSERT INTO app.integration_outbox_events(
      id, tenant_id, aggregate_type, aggregate_id, event_type, payload, correlation_id
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  `, [
    randomUUID(), request.user.tenantId,
    definition.key.toUpperCase().replaceAll('-', '_'), entityId,
    `implantahub.${definition.key}.${action}.v1`,
    JSON.stringify({ resource: definition.key, entityId, ...metadata }),
    request.apiMeta.correlationId,
  ]);
}

function registerResource(app: FastifyInstance, definition: ResourceDefinition): void {
  const basePath = `/api/v1/${definition.path}`;
  const table = `app.${quote(definition.table)}`;
  const readRoles = definition.readRoles ?? ['ADMIN', 'MANAGER', 'ANALYST'];
  const writeRoles = definition.writeRoles ?? ['ADMIN', 'MANAGER', 'ANALYST'];

  app.get(basePath, {
    preHandler: app.requireRole(...readRoles),
    schema: { tags: [definition.group], summary: `Listar ${definition.label.toLowerCase()}` },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const query = querySchema.parse(request.query);
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    if (definition.userScopedField) {
      values.push(request.user.sub);
      conditions.push(`${quote(definition.userScopedField)} = $${values.length}`);
    }

    for (const filterName of definition.filters) {
      const raw = query[filterName];
      if (raw === undefined || raw === '') continue;
      const field = fieldFor(definition, filterName);
      if (!field) continue;
      values.push(transformWriteValue(field, raw));
      conditions.push(`${quote(field.column)} = $${values.length}`);
    }

    if (query.search && definition.searchColumns.length > 0) {
      values.push(`%${query.search}%`);
      const parameter = `$${values.length}`;
      conditions.push(`(${definition.searchColumns.map((column) => `${quote(column)}::text ILIKE ${parameter}`).join(' OR ')})`);
    }

    values.push(query.limit);
    const limitParameter = `$${values.length}`;
    values.push(query.offset);
    const offsetParameter = `$${values.length}`;

    const result = await withTenantClient(tenantId, (client) => client.query(
      `SELECT * FROM ${table} WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      values,
    ));

    return {
      data: camelize(result.rows.map((row) => sanitizeRow(definition, row))),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        count: result.rowCount ?? result.rows.length,
        hasNextPage: result.rows.length === query.limit,
      },
      meta: request.apiMeta,
    };
  });

  app.get(`${basePath}/:id`, {
    preHandler: app.requireRole(...readRoles),
    schema: { tags: [definition.group], summary: `Consultar ${definition.label.toLowerCase()}` },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = idParams.parse(request.params);
    const result = await withTenantClient(tenantId, (client) => client.query(
      `SELECT * FROM ${table} WHERE tenant_id = $1 AND id = $2${definition.userScopedField ? ` AND ${quote(definition.userScopedField)} = $3` : ''} LIMIT 1`,
      definition.userScopedField ? [tenantId, id, request.user.sub] : [tenantId, id],
    ));
    if (!result.rows[0]) throw new AppError('RESOURCE_NOT_FOUND', 'Registro não encontrado.', 404);
    return envelope(request, camelize(sanitizeRow(definition, result.rows[0])));
  });

  if (definition.allowCreate !== false) {
    app.post(basePath, {
    preHandler: app.requireRole(...writeRoles),
    schema: { tags: [definition.group], summary: `Criar ${definition.label.toLowerCase()}` },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const body = bodySchema.parse(request.body);
    const id = randomUUID();
    const columns = ['id', 'tenant_id'];
    const values: unknown[] = [id, tenantId];

    for (const field of definition.fields) {
      if (field.readOnly && !field.fromUser) continue;
      const raw = field.fromUser ? request.user.sub : body[field.api];
      if (field.required && (raw === undefined || raw === null || raw === '')) {
        throw new AppError('VALIDATION_ERROR', `${field.api} é obrigatório.`, 400);
      }
      if (raw === undefined) continue;
      columns.push(field.column);
      values.push(transformWriteValue(field, raw));
    }

    const placeholders = values.map((_, index) => `$${index + 1}`);
    const row = await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values,
      );
      await auditMutation(client, request, definition, id, 'created', { fields: Object.keys(body) });
      return result.rows[0];
    });

    return reply.status(201).send(envelope(request, camelize(sanitizeRow(definition, row))));
    });
  }

  if (definition.allowUpdate !== false) {
    app.patch(`${basePath}/:id`, {
    preHandler: app.requireRole(...writeRoles),
    schema: { tags: [definition.group], summary: `Atualizar ${definition.label.toLowerCase()}` },
  }, async (request) => {
    const tenantId = request.user.tenantId!;
    const { id } = idParams.parse(request.params);
    const body = bodySchema.parse(request.body);
    const assignments: string[] = [];
    const values: unknown[] = [tenantId, id];

    for (const field of definition.fields) {
      if (field.readOnly || field.fromUser || body[field.api] === undefined) continue;
      values.push(transformWriteValue(field, body[field.api]));
      assignments.push(`${quote(field.column)} = $${values.length}`);
    }

    if (assignments.length === 0) throw new AppError('VALIDATION_ERROR', 'Nenhum campo válido para atualização.', 400);
    assignments.push('updated_at = now()');

    const row = await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `UPDATE ${table} SET ${assignments.join(', ')} WHERE tenant_id = $1 AND id = $2${definition.userScopedField ? ` AND ${quote(definition.userScopedField)} = $${values.length + 1}` : ''} RETURNING *`,
        definition.userScopedField ? [...values, request.user.sub] : values,
      );
      if (!result.rows[0]) throw new AppError('RESOURCE_NOT_FOUND', 'Registro não encontrado.', 404);
      await auditMutation(client, request, definition, id, 'updated', { fields: Object.keys(body) });
      return result.rows[0];
    });

    return envelope(request, camelize(sanitizeRow(definition, row)));
    });
  }

  if (definition.allowDelete !== false) {
    app.delete(`${basePath}/:id`, {
    preHandler: app.requireRole(...writeRoles),
    schema: { tags: [definition.group], summary: `Excluir ${definition.label.toLowerCase()}` },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId!;
    const { id } = idParams.parse(request.params);

    await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2${definition.userScopedField ? ` AND ${quote(definition.userScopedField)} = $3` : ''} RETURNING id`,
        definition.userScopedField ? [tenantId, id, request.user.sub] : [tenantId, id],
      );
      if (!result.rows[0]) throw new AppError('RESOURCE_NOT_FOUND', 'Registro não encontrado.', 404);
      await auditMutation(client, request, definition, id, 'deleted', {});
    });

    return reply.status(204).send();
    });
  }
}

export async function platformRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/platform/catalog', {
    preHandler: app.requireRole('ADMIN', 'MANAGER', 'ANALYST'),
    schema: { tags: ['Platform'], summary: 'Catálogo de módulos operacionais' },
  }, async (request) => envelope(request, platformResources.map((resource) => ({
    key: resource.key,
    path: resource.path,
    label: resource.label,
    group: resource.group,
    description: resource.description,
    titleField: resource.titleField,
    filters: resource.filters,
    allowCreate: resource.allowCreate !== false,
    allowUpdate: resource.allowUpdate !== false,
    allowDelete: resource.allowDelete !== false,
    fields: resource.fields.filter((field) => !field.fromUser),
  }))));

  for (const definition of platformResources) registerResource(app, definition);
}
