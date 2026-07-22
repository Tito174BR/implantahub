-- Etapa 10: módulos completos da plataforma

CREATE TABLE IF NOT EXISTS app.tenancy_invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  email citext NOT NULL,
  display_name varchar(160) NOT NULL,
  role varchar(60) NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  invited_by uuid NOT NULL REFERENCES app.identity_users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.customer_contacts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  customer_id uuid NOT NULL REFERENCES app.customer_customers(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  email citext,
  phone varchar(40),
  role varchar(120),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.customer_units (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  customer_id uuid NOT NULL REFERENCES app.customer_customers(id) ON DELETE CASCADE,
  code varchar(60) NOT NULL,
  name varchar(180) NOT NULL,
  city varchar(120),
  state varchar(40),
  address text,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_unit_code UNIQUE (tenant_id, customer_id, code)
);

CREATE TABLE IF NOT EXISTS app.project_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  code varchar(60) NOT NULL,
  name varchar(180) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'DRAFT',
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_template_code UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS app.project_template_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  template_id uuid NOT NULL REFERENCES app.project_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_template_version UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS app.project_members (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.identity_users(id),
  role varchar(80) NOT NULL DEFAULT 'MEMBER',
  allocation_percent integer NOT NULL DEFAULT 100 CHECK (allocation_percent BETWEEN 0 AND 100),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_member UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS app.project_phases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  position integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  owner_user_id uuid REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.project_milestones (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES app.project_phases(id),
  title varchar(200) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  due_at timestamptz,
  completed_at timestamptz,
  owner_user_id uuid REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.execution_checklists (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES app.project_phases(id),
  name varchar(200) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.execution_checklist_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  checklist_id uuid NOT NULL REFERENCES app.execution_checklists(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT true,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  position integer NOT NULL DEFAULT 0,
  assignee_user_id uuid REFERENCES app.identity_users(id),
  due_at timestamptz,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.collaboration_comments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  author_user_id uuid NOT NULL REFERENCES app.identity_users(id),
  body text NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.delivery_environments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  type varchar(40) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  base_url text,
  owner_user_id uuid REFERENCES app.identity_users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_environment_name UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS app.delivery_components (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  type varchar(60) NOT NULL,
  repository_url text,
  current_version varchar(100),
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_component_name UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS app.delivery_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  component_id uuid NOT NULL REFERENCES app.delivery_components(id) ON DELETE CASCADE,
  version varchar(100) NOT NULL,
  changelog text,
  status varchar(30) NOT NULL DEFAULT 'READY',
  artifact_url text,
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_component_version UNIQUE (component_id, version)
);

CREATE TABLE IF NOT EXISTS app.delivery_deployments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES app.delivery_environments(id),
  version_id uuid REFERENCES app.delivery_versions(id),
  name varchar(180) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PLANNED',
  strategy varchar(60) NOT NULL DEFAULT 'STANDARD',
  requested_by uuid NOT NULL REFERENCES app.identity_users(id),
  approved_by uuid REFERENCES app.identity_users(id),
  started_at timestamptz,
  finished_at timestamptz,
  rollback_of uuid REFERENCES app.delivery_deployments(id),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.quality_test_plans (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  environment_id uuid REFERENCES app.delivery_environments(id),
  name varchar(180) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'DRAFT',
  owner_user_id uuid REFERENCES app.identity_users(id),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.quality_test_cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  test_plan_id uuid NOT NULL REFERENCES app.quality_test_plans(id) ON DELETE CASCADE,
  code varchar(60) NOT NULL,
  title varchar(220) NOT NULL,
  preconditions text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_result text,
  priority varchar(30) NOT NULL DEFAULT 'MEDIUM',
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_test_case_code UNIQUE (test_plan_id, code)
);

CREATE TABLE IF NOT EXISTS app.quality_test_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  test_case_id uuid NOT NULL REFERENCES app.quality_test_cases(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES app.delivery_deployments(id),
  executor_user_id uuid REFERENCES app.identity_users(id),
  status varchar(30) NOT NULL DEFAULT 'NOT_RUN',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.quality_defects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  test_run_id uuid REFERENCES app.quality_test_runs(id),
  title varchar(220) NOT NULL,
  description text,
  severity varchar(30) NOT NULL DEFAULT 'MEDIUM',
  priority varchar(30) NOT NULL DEFAULT 'MEDIUM',
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  assignee_user_id uuid REFERENCES app.identity_users(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.pilot_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'PLANNED',
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  owner_user_id uuid REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.pilot_metrics (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  pilot_id uuid NOT NULL REFERENCES app.pilot_runs(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  unit varchar(40),
  target_value numeric(18,4),
  actual_value numeric(18,4),
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  measured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.pilot_incidents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  pilot_id uuid NOT NULL REFERENCES app.pilot_runs(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  description text,
  severity varchar(30) NOT NULL DEFAULT 'MEDIUM',
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  owner_user_id uuid REFERENCES app.identity_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.governance_risks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  description text,
  probability integer NOT NULL DEFAULT 1 CHECK (probability BETWEEN 1 AND 5),
  impact integer NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 5),
  score integer GENERATED ALWAYS AS (probability * impact) STORED,
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  owner_user_id uuid REFERENCES app.identity_users(id),
  mitigation text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.governance_blockers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  description text,
  severity varchar(30) NOT NULL DEFAULT 'HIGH',
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  owner_user_id uuid REFERENCES app.identity_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.governance_change_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  code varchar(60) NOT NULL,
  title varchar(220) NOT NULL,
  description text,
  reason text,
  impact_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'DRAFT',
  requester_user_id uuid NOT NULL REFERENCES app.identity_users(id),
  approver_user_id uuid REFERENCES app.identity_users(id),
  requested_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_change_request_code UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS app.governance_approvals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid NOT NULL REFERENCES app.project_projects(id) ON DELETE CASCADE,
  entity_type varchar(80) NOT NULL,
  entity_id uuid NOT NULL,
  version_ref varchar(120) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  requested_by uuid NOT NULL REFERENCES app.identity_users(id),
  decided_by uuid REFERENCES app.identity_users(id),
  comments text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.content_documents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  project_id uuid REFERENCES app.project_projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES app.customer_customers(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  category varchar(80) NOT NULL DEFAULT 'GENERAL',
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  current_version integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.content_document_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  document_id uuid NOT NULL REFERENCES app.content_documents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_name varchar(255) NOT NULL,
  object_key text NOT NULL,
  mime_type varchar(160),
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum varchar(128),
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  uploaded_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_version UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS app.notification_notifications (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  user_id uuid NOT NULL REFERENCES app.identity_users(id),
  type varchar(80) NOT NULL,
  title varchar(200) NOT NULL,
  body text NOT NULL,
  channel varchar(30) NOT NULL DEFAULT 'IN_APP',
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  link text,
  read_at timestamptz,
  sent_at timestamptz,
  dedupe_key varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_webhook_endpoints (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  name varchar(160) NOT NULL,
  url text NOT NULL,
  secret_encrypted text NOT NULL,
  event_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_webhook_deliveries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  endpoint_id uuid NOT NULL REFERENCES app.integration_webhook_endpoints(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  response_status integer,
  response_body text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.reporting_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  requested_by uuid NOT NULL REFERENCES app.identity_users(id),
  type varchar(80) NOT NULL,
  format varchar(20) NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  object_key text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  name varchar(160) NOT NULL,
  type varchar(60) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'INACTIVE',
  config_encrypted text NOT NULL DEFAULT '{}',
  last_tested_at timestamptz,
  last_error text,
  created_by uuid NOT NULL REFERENCES app.identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  connection_id uuid NOT NULL REFERENCES app.integration_connections(id) ON DELETE CASCADE,
  project_id uuid REFERENCES app.project_projects(id) ON DELETE CASCADE,
  job_type varchar(80) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.integration_inbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  source varchar(100) NOT NULL,
  event_key varchar(200) NOT NULL,
  event_type varchar(160) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'RECEIVED',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  CONSTRAINT uq_inbox_event UNIQUE (tenant_id, source, event_key)
);

CREATE TABLE IF NOT EXISTS app.integration_dead_letters (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  source varchar(100) NOT NULL,
  reference_id varchar(200),
  event_type varchar(160) NOT NULL,
  payload jsonb NOT NULL,
  error text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.portal_access (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenancy_tenants(id),
  customer_id uuid NOT NULL REFERENCES app.customer_customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.identity_users(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  permissions jsonb NOT NULL DEFAULT '["READ_PROJECTS","READ_DOCUMENTS"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_portal_access UNIQUE (tenant_id, customer_id, user_id)
);

ALTER TABLE app.integration_outbox_events
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

-- Defesa adicional contra referências cruzadas entre tenants.
ALTER TABLE app.integration_outbox_events
  ADD CONSTRAINT uq_outbox_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.project_templates
  ADD CONSTRAINT uq_project_templates_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.project_phases
  ADD CONSTRAINT uq_project_phases_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.execution_checklists
  ADD CONSTRAINT uq_execution_checklists_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.delivery_environments
  ADD CONSTRAINT uq_delivery_environments_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.delivery_components
  ADD CONSTRAINT uq_delivery_components_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.delivery_versions
  ADD CONSTRAINT uq_delivery_versions_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.delivery_deployments
  ADD CONSTRAINT uq_delivery_deployments_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.quality_test_plans
  ADD CONSTRAINT uq_quality_test_plans_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.quality_test_cases
  ADD CONSTRAINT uq_quality_test_cases_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.quality_test_runs
  ADD CONSTRAINT uq_quality_test_runs_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.pilot_runs
  ADD CONSTRAINT uq_pilot_runs_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.content_documents
  ADD CONSTRAINT uq_content_documents_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.integration_webhook_endpoints
  ADD CONSTRAINT uq_webhook_endpoints_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE app.integration_connections
  ADD CONSTRAINT uq_integration_connections_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE app.customer_contacts
  ADD CONSTRAINT fk_contacts_customer_tenant FOREIGN KEY (tenant_id, customer_id)
  REFERENCES app.customer_customers(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.customer_units
  ADD CONSTRAINT fk_units_customer_tenant FOREIGN KEY (tenant_id, customer_id)
  REFERENCES app.customer_customers(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.project_template_versions
  ADD CONSTRAINT fk_template_versions_tenant FOREIGN KEY (tenant_id, template_id)
  REFERENCES app.project_templates(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.project_members
  ADD CONSTRAINT fk_project_members_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.project_phases
  ADD CONSTRAINT fk_project_phases_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.project_milestones
  ADD CONSTRAINT fk_milestones_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_milestones_phase_tenant FOREIGN KEY (tenant_id, phase_id)
  REFERENCES app.project_phases(tenant_id, id);
ALTER TABLE app.execution_checklists
  ADD CONSTRAINT fk_checklists_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_checklists_phase_tenant FOREIGN KEY (tenant_id, phase_id)
  REFERENCES app.project_phases(tenant_id, id);
ALTER TABLE app.execution_checklist_items
  ADD CONSTRAINT fk_checklist_items_tenant FOREIGN KEY (tenant_id, checklist_id)
  REFERENCES app.execution_checklists(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.collaboration_comments
  ADD CONSTRAINT fk_comments_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.delivery_environments
  ADD CONSTRAINT fk_environments_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.delivery_components
  ADD CONSTRAINT fk_components_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.delivery_versions
  ADD CONSTRAINT fk_versions_component_tenant FOREIGN KEY (tenant_id, component_id)
  REFERENCES app.delivery_components(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.delivery_deployments
  ADD CONSTRAINT fk_deployments_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_deployments_environment_tenant FOREIGN KEY (tenant_id, environment_id)
  REFERENCES app.delivery_environments(tenant_id, id),
  ADD CONSTRAINT fk_deployments_version_tenant FOREIGN KEY (tenant_id, version_id)
  REFERENCES app.delivery_versions(tenant_id, id),
  ADD CONSTRAINT fk_deployments_rollback_tenant FOREIGN KEY (tenant_id, rollback_of)
  REFERENCES app.delivery_deployments(tenant_id, id);
ALTER TABLE app.quality_test_plans
  ADD CONSTRAINT fk_test_plans_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_test_plans_environment_tenant FOREIGN KEY (tenant_id, environment_id)
  REFERENCES app.delivery_environments(tenant_id, id);
ALTER TABLE app.quality_test_cases
  ADD CONSTRAINT fk_test_cases_plan_tenant FOREIGN KEY (tenant_id, test_plan_id)
  REFERENCES app.quality_test_plans(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.quality_test_runs
  ADD CONSTRAINT fk_test_runs_case_tenant FOREIGN KEY (tenant_id, test_case_id)
  REFERENCES app.quality_test_cases(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_test_runs_deployment_tenant FOREIGN KEY (tenant_id, deployment_id)
  REFERENCES app.delivery_deployments(tenant_id, id);
ALTER TABLE app.quality_defects
  ADD CONSTRAINT fk_defects_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_defects_test_run_tenant FOREIGN KEY (tenant_id, test_run_id)
  REFERENCES app.quality_test_runs(tenant_id, id);
ALTER TABLE app.pilot_runs
  ADD CONSTRAINT fk_pilots_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.pilot_metrics
  ADD CONSTRAINT fk_pilot_metrics_tenant FOREIGN KEY (tenant_id, pilot_id)
  REFERENCES app.pilot_runs(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.pilot_incidents
  ADD CONSTRAINT fk_pilot_incidents_tenant FOREIGN KEY (tenant_id, pilot_id)
  REFERENCES app.pilot_runs(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.governance_risks
  ADD CONSTRAINT fk_risks_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.governance_blockers
  ADD CONSTRAINT fk_blockers_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.governance_change_requests
  ADD CONSTRAINT fk_changes_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.governance_approvals
  ADD CONSTRAINT fk_approvals_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.content_documents
  ADD CONSTRAINT fk_documents_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_documents_customer_tenant FOREIGN KEY (tenant_id, customer_id)
  REFERENCES app.customer_customers(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.content_document_versions
  ADD CONSTRAINT fk_document_versions_tenant FOREIGN KEY (tenant_id, document_id)
  REFERENCES app.content_documents(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.integration_webhook_deliveries
  ADD CONSTRAINT fk_webhook_delivery_endpoint_tenant FOREIGN KEY (tenant_id, endpoint_id)
  REFERENCES app.integration_webhook_endpoints(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_webhook_delivery_event_tenant FOREIGN KEY (tenant_id, event_id)
  REFERENCES app.integration_outbox_events(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.integration_jobs
  ADD CONSTRAINT fk_integration_jobs_connection_tenant FOREIGN KEY (tenant_id, connection_id)
  REFERENCES app.integration_connections(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_integration_jobs_project_tenant FOREIGN KEY (tenant_id, project_id)
  REFERENCES app.project_projects(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE app.portal_access
  ADD CONSTRAINT fk_portal_access_customer_tenant FOREIGN KEY (tenant_id, customer_id)
  REFERENCES app.customer_customers(tenant_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitation_pending
  ON app.tenancy_invitations(tenant_id, email) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_contacts_customer ON app.customer_contacts(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_units_customer ON app.customer_units(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_phases_project ON app.project_phases(tenant_id, project_id, position);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON app.project_milestones(tenant_id, project_id, due_at);
CREATE INDEX IF NOT EXISTS idx_checklists_project ON app.execution_checklists(tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON app.collaboration_comments(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON app.delivery_deployments(tenant_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_defects_project ON app.quality_defects(tenant_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_risks_project ON app.governance_risks(tenant_id, project_id, status, score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedupe
  ON app.notification_notifications(tenant_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON app.notification_notifications(tenant_id, user_id, read_at, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_delivery_event
  ON app.integration_webhook_deliveries(endpoint_id, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_retry
  ON app.integration_webhook_deliveries(tenant_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON app.reporting_jobs(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON app.integration_jobs(tenant_id, status, scheduled_at);

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'tenancy_invitations',
    'customer_contacts', 'customer_units',
    'project_templates', 'project_template_versions', 'project_members', 'project_phases', 'project_milestones',
    'execution_checklists', 'execution_checklist_items', 'collaboration_comments',
    'delivery_environments', 'delivery_components', 'delivery_versions', 'delivery_deployments',
    'quality_test_plans', 'quality_test_cases', 'quality_test_runs', 'quality_defects',
    'pilot_runs', 'pilot_metrics', 'pilot_incidents',
    'governance_risks', 'governance_blockers', 'governance_change_requests', 'governance_approvals',
    'content_documents', 'content_document_versions',
    'notification_notifications',
    'integration_webhook_endpoints', 'integration_webhook_deliveries',
    'reporting_jobs', 'integration_connections', 'integration_jobs', 'integration_inbox_events', 'integration_dead_letters',
    'portal_access'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON app.%I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO implantahub_api;
ALTER DEFAULT PRIVILEGES FOR ROLE implantahub_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO implantahub_api;
