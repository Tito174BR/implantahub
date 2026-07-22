CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION implantahub_migrator;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

CREATE TABLE IF NOT EXISTS app.identity_users (
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  display_name varchar(160) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.identity_password_credentials (
  user_id uuid PRIMARY KEY REFERENCES app.identity_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  blocked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.tenancy_tenants (
  id uuid PRIMARY KEY,
  slug varchar(100) NOT NULL UNIQUE,
  legal_name varchar(200) NOT NULL,
  trade_name varchar(200),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  timezone varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  locale varchar(20) NOT NULL DEFAULT 'pt-BR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.tenancy_memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  user_id uuid NOT NULL REFERENCES app.identity_users(id),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  role varchar(60) NOT NULL DEFAULT 'ANALYST',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_membership_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS app.identity_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.identity_users(id),
  tenant_id uuid REFERENCES app.tenancy_tenants(id),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  ip_address varchar(80),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.identity_refresh_tokens (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES app.identity_sessions(id) ON DELETE CASCADE,
  token_family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.customer_customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  code varchar(50) NOT NULL,
  legal_name varchar(200) NOT NULL,
  trade_name varchar(200),
  tax_identifier varchar(40),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_customers_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT uq_customers_tenant_id UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS app.project_projects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  customer_id uuid NOT NULL,
  code varchar(60) NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  status varchar(40) NOT NULL DEFAULT 'DRAFT',
  priority varchar(30) NOT NULL DEFAULT 'MEDIUM',
  criticality varchar(30) NOT NULL DEFAULT 'MEDIUM',
  manager_user_id uuid NOT NULL REFERENCES app.identity_users(id),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  deleted_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_projects_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT uq_projects_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_projects_customer_tenant FOREIGN KEY (tenant_id, customer_id)
    REFERENCES app.customer_customers(tenant_id, id),
  CONSTRAINT ck_projects_planned_dates CHECK (
    planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at
  )
);

CREATE TABLE IF NOT EXISTS app.execution_tasks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL,
  title varchar(220) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  priority varchar(30) NOT NULL DEFAULT 'MEDIUM',
  due_at timestamptz,
  assignee_user_id uuid REFERENCES app.identity_users(id),
  completed_at timestamptz,
  deleted_at timestamptz,
  lock_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tasks_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_tasks_project_tenant FOREIGN KEY (tenant_id, project_id)
    REFERENCES app.project_projects(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS app.audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  actor_id uuid REFERENCES app.identity_users(id),
  action varchar(120) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  aggregate_type varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(160) NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  correlation_id uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name
  ON app.customer_customers (tenant_id, legal_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status
  ON app.project_projects (tenant_id, status, planned_end_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project_status
  ON app.execution_tasks (tenant_id, project_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_overdue
  ON app.execution_tasks (tenant_id, due_at)
  WHERE deleted_at IS NULL AND status NOT IN ('COMPLETED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
  ON app.audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON app.integration_outbox_events (tenant_id, available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

ALTER TABLE app.customer_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE app.project_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.project_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.execution_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.execution_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.integration_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_outbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_customers ON app.customer_customers;
CREATE POLICY tenant_isolation_customers ON app.customer_customers
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_projects ON app.project_projects;
CREATE POLICY tenant_isolation_projects ON app.project_projects
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_tasks ON app.execution_tasks;
CREATE POLICY tenant_isolation_tasks ON app.execution_tasks
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_audit ON app.audit_events;
CREATE POLICY tenant_isolation_audit ON app.audit_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_outbox ON app.integration_outbox_events;
CREATE POLICY tenant_isolation_outbox ON app.integration_outbox_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT USAGE ON SCHEMA app TO implantahub_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO implantahub_api;
ALTER DEFAULT PRIVILEGES FOR ROLE implantahub_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO implantahub_api;
