import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('app');

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = appSchema.table('identity_users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  ...timestamps,
}, (table) => ({
  emailUnique: uniqueIndex('uq_identity_users__email').on(table.email),
}));

export const passwordCredentials = appSchema.table('identity_password_credentials', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = appSchema.table('tenancy_tenants', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }).notNull(),
  tradeName: varchar('trade_name', { length: 200 }),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  timezone: varchar('timezone', { length: 80 }).notNull().default('America/Sao_Paulo'),
  locale: varchar('locale', { length: 20 }).notNull().default('pt-BR'),
  ...timestamps,
}, (table) => ({
  slugUnique: uniqueIndex('uq_tenancy_tenants__slug').on(table.slug),
}));

export const memberships = appSchema.table('tenancy_memberships', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  role: varchar('role', { length: 60 }).notNull().default('ANALYST'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantUserUnique: uniqueIndex('uq_tenancy_memberships__tenant_user').on(table.tenantId, table.userId),
}));

export const sessions = appSchema.table('identity_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  ipAddress: varchar('ip_address', { length: 80 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const refreshTokens = appSchema.table('identity_refresh_tokens', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  tokenFamilyId: uuid('token_family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
  tokenHashUnique: uniqueIndex('uq_identity_refresh_tokens__hash').on(table.tokenHash),
}));

export const customers = appSchema.table('customer_customers', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: varchar('code', { length: 50 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }).notNull(),
  tradeName: varchar('trade_name', { length: 200 }),
  taxIdentifier: varchar('tax_identifier', { length: 40 }),
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  lockVersion: integer('lock_version').notNull().default(1),
  ...timestamps,
}, (table) => ({
  tenantCodeUnique: uniqueIndex('uq_customer_customers__tenant_code').on(table.tenantId, table.code),
}));

export const projects = appSchema.table('project_projects', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  code: varchar('code', { length: 60 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 40 }).notNull().default('DRAFT'),
  priority: varchar('priority', { length: 30 }).notNull().default('MEDIUM'),
  criticality: varchar('criticality', { length: 30 }).notNull().default('MEDIUM'),
  managerUserId: uuid('manager_user_id').notNull().references(() => users.id),
  plannedStartAt: timestamp('planned_start_at', { withTimezone: true }),
  plannedEndAt: timestamp('planned_end_at', { withTimezone: true }),
  actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
  actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  lockVersion: integer('lock_version').notNull().default(1),
  ...timestamps,
}, (table) => ({
  tenantCodeUnique: uniqueIndex('uq_project_projects__tenant_code').on(table.tenantId, table.code),
}));

export const tasks = appSchema.table('execution_tasks', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: varchar('title', { length: 220 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 30 }).notNull().default('PENDING'),
  priority: varchar('priority', { length: 30 }).notNull().default('MEDIUM'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  lockVersion: integer('lock_version').notNull().default(1),
  ...timestamps,
});

export const auditEvents = appSchema.table('audit_events', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  correlationId: uuid('correlation_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const outboxEvents = appSchema.table('integration_outbox_events', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  aggregateType: varchar('aggregate_type', { length: 80 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: varchar('event_type', { length: 160 }).notNull(),
  eventVersion: integer('event_version').notNull().default(1),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 30 }).notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastError: text('last_error'),
  correlationId: uuid('correlation_id').notNull(),
});
