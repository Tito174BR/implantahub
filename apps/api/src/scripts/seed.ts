import { randomUUID } from 'node:crypto';

import argon2 from 'argon2';
import pg from 'pg';

import { env } from '../config/env.js';
import { encryptSecret } from '../lib/secrets.js';

const { Client } = pg;
const client = new Client({
  connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
});

const ids = {
  tenant: '0198f320-4f16-7f11-a160-23c70aac6701',
  admin: '0198f320-4f16-7f11-a160-23c70aac6702',
  manager: '0198f320-4f16-7f11-a160-23c70aac6703',
  analyst: '0198f320-4f16-7f11-a160-23c70aac6704',
  customer: '0198f320-4f16-7f11-a160-23c70aac6705',
  project: '0198f320-4f16-7f11-a160-23c70aac6706',
  task1: '0198f320-4f16-7f11-a160-23c70aac6707',
  task2: '0198f320-4f16-7f11-a160-23c70aac6708',
  customerUser: '0198f320-4f16-7f11-a160-23c70aac6709',
  contact: '0198f320-4f16-7f11-a160-23c70aac6710',
  unit: '0198f320-4f16-7f11-a160-23c70aac6711',
  phase1: '0198f320-4f16-7f11-a160-23c70aac6712',
  phase2: '0198f320-4f16-7f11-a160-23c70aac6713',
  milestone: '0198f320-4f16-7f11-a160-23c70aac6714',
  checklist: '0198f320-4f16-7f11-a160-23c70aac6715',
  checklistItem1: '0198f320-4f16-7f11-a160-23c70aac6716',
  checklistItem2: '0198f320-4f16-7f11-a160-23c70aac6717',
  environmentHom: '0198f320-4f16-7f11-a160-23c70aac6718',
  environmentProd: '0198f320-4f16-7f11-a160-23c70aac6719',
  component: '0198f320-4f16-7f11-a160-23c70aac6720',
  version: '0198f320-4f16-7f11-a160-23c70aac6721',
  deployment: '0198f320-4f16-7f11-a160-23c70aac6722',
  testPlan: '0198f320-4f16-7f11-a160-23c70aac6723',
  testCase: '0198f320-4f16-7f11-a160-23c70aac6724',
  testRun: '0198f320-4f16-7f11-a160-23c70aac6725',
  defect: '0198f320-4f16-7f11-a160-23c70aac6726',
  pilot: '0198f320-4f16-7f11-a160-23c70aac6727',
  pilotMetric: '0198f320-4f16-7f11-a160-23c70aac6728',
  risk: '0198f320-4f16-7f11-a160-23c70aac6729',
  blocker: '0198f320-4f16-7f11-a160-23c70aac6730',
  changeRequest: '0198f320-4f16-7f11-a160-23c70aac6731',
  approval: '0198f320-4f16-7f11-a160-23c70aac6732',
  document: '0198f320-4f16-7f11-a160-23c70aac6733',
  connection: '0198f320-4f16-7f11-a160-23c70aac6734',
  notification: '0198f320-4f16-7f11-a160-23c70aac6735',
};

await client.connect();

try {
  const passwordHash = await argon2.hash('Admin@123456', { type: argon2.argon2id });

  await client.query('BEGIN');

  await client.query(`
    INSERT INTO app.tenancy_tenants(id, slug, legal_name, trade_name)
    VALUES ($1, 'mvtech', 'MVTech Solutions', 'MVTech')
    ON CONFLICT (id) DO UPDATE SET trade_name = EXCLUDED.trade_name
  `, [ids.tenant]);

  const users = [
    [ids.admin, 'admin@implantahub.local', 'Administrador da Plataforma', 'ADMIN'],
    [ids.manager, 'gestor@implantahub.local', 'Gestor de Implantação', 'MANAGER'],
    [ids.analyst, 'analista@implantahub.local', 'Analista de Implantação', 'ANALYST'],
    [ids.customerUser, 'cliente@implantahub.local', 'Responsável do Cliente', 'CUSTOMER'],
  ] as const;

  for (const [id, email, name, role] of users) {
    await client.query(`
      INSERT INTO app.identity_users(id, email, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, status = 'ACTIVE'
    `, [id, email, name]);

    await client.query(`
      INSERT INTO app.identity_password_credentials(user_id, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [id, passwordHash]);

    await client.query(`
      INSERT INTO app.tenancy_memberships(id, tenant_id, user_id, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
    `, [randomUUID(), ids.tenant, id, role]);
  }

  await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ids.tenant]);

  await client.query(`
    INSERT INTO app.customer_customers(id, tenant_id, code, legal_name, trade_name, tax_identifier)
    VALUES ($1, $2, 'CLI-001', 'Mobilidade Urbana S.A.', 'Mobilidade Urbana', '00.000.000/0001-00')
    ON CONFLICT (id) DO UPDATE SET trade_name = EXCLUDED.trade_name
  `, [ids.customer, ids.tenant]);

  await client.query(`
    INSERT INTO app.customer_contacts(id, tenant_id, customer_id, name, email, phone, role)
    VALUES ($1, $2, $3, 'Mariana Oliveira', 'mariana@cliente.local', '(11) 99999-0000', 'Gerente do projeto')
    ON CONFLICT (id) DO NOTHING
  `, [ids.contact, ids.tenant, ids.customer]);

  await client.query(`
    INSERT INTO app.customer_units(id, tenant_id, customer_id, code, name, city, state, address)
    VALUES ($1, $2, $3, 'GAR-001', 'Garagem Central', 'Barretos', 'SP', 'Av. Central, 1000')
    ON CONFLICT (id) DO NOTHING
  `, [ids.unit, ids.tenant, ids.customer]);

  await client.query(`
    INSERT INTO app.project_projects(
      id, tenant_id, customer_id, code, name, description, status,
      priority, criticality, manager_user_id, planned_start_at, planned_end_at
    ) VALUES (
      $1, $2, $3, 'IMP-2026-001', 'Implantação do Portal de Bilhetagem',
      'Implantação completa envolvendo integrações, homologação, piloto e produção.',
      'EXECUTING', 'HIGH', 'HIGH', $4, now() - interval '10 days', now() + interval '35 days'
    ) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
  `, [ids.project, ids.tenant, ids.customer, ids.manager]);

  await client.query(`
    INSERT INTO app.project_members(id, tenant_id, project_id, user_id, role, allocation_percent)
    VALUES
      (gen_random_uuid(), $1, $2, $3, 'PROJECT_MANAGER', 60),
      (gen_random_uuid(), $1, $2, $4, 'IMPLEMENTATION_ANALYST', 100)
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `, [ids.tenant, ids.project, ids.manager, ids.analyst]);

  await client.query(`
    INSERT INTO app.execution_tasks(id, tenant_id, project_id, title, description, status, priority, due_at, assignee_user_id)
    VALUES
      ($1, $3, $4, 'Validar conexão com Oracle', 'Executar teste de conectividade e consulta controlada.', 'IN_PROGRESS', 'HIGH', now() + interval '2 days', $5),
      ($2, $3, $4, 'Preparar checklist de produção', 'Consolidar validações obrigatórias para o go-live.', 'PENDING', 'CRITICAL', now() + interval '5 days', $6)
    ON CONFLICT (id) DO NOTHING
  `, [ids.task1, ids.task2, ids.tenant, ids.project, ids.analyst, ids.manager]);

  await client.query(`
    INSERT INTO app.project_phases(id, tenant_id, project_id, name, description, status, position, progress, planned_start_at, planned_end_at, owner_user_id)
    VALUES
      ($1, $3, $4, 'Integrações e configuração', 'Preparação técnica dos ambientes e integrações.', 'IN_PROGRESS', 1, 65, now() - interval '10 days', now() + interval '10 days', $5),
      ($2, $3, $4, 'Homologação e piloto', 'Validação funcional e operação controlada.', 'PENDING', 2, 10, now() + interval '11 days', now() + interval '30 days', $6)
    ON CONFLICT (id) DO NOTHING
  `, [ids.phase1, ids.phase2, ids.tenant, ids.project, ids.analyst, ids.manager]);

  await client.query(`
    INSERT INTO app.project_milestones(id, tenant_id, project_id, phase_id, title, description, status, due_at, owner_user_id)
    VALUES ($1, $2, $3, $4, 'Ambiente de homologação liberado', 'Gate para iniciar os testes integrados.', 'IN_PROGRESS', now() + interval '7 days', $5)
    ON CONFLICT (id) DO NOTHING
  `, [ids.milestone, ids.tenant, ids.project, ids.phase1, ids.manager]);

  await client.query(`
    INSERT INTO app.execution_checklists(id, tenant_id, project_id, phase_id, name, description, status, progress, created_by)
    VALUES ($1, $2, $3, $4, 'Checklist de prontidão para produção', 'Itens obrigatórios antes do go-live.', 'OPEN', 50, $5)
    ON CONFLICT (id) DO NOTHING
  `, [ids.checklist, ids.tenant, ids.project, ids.phase2, ids.manager]);

  await client.query(`
    INSERT INTO app.execution_checklist_items(id, tenant_id, checklist_id, title, description, required, status, position, assignee_user_id, due_at, response, completed_at)
    VALUES
      ($1, $3, $4, 'Validar backup e rollback', 'Confirmar backup restaurável e procedimento de retorno.', true, 'COMPLETED', 1, $5, now() + interval '3 days', '{"evidence":"Procedimento validado"}'::jsonb, now()),
      ($2, $3, $4, 'Aprovação formal do cliente', 'Registrar aceite do responsável do cliente.', true, 'PENDING', 2, $6, now() + interval '8 days', '{}'::jsonb, NULL)
    ON CONFLICT (id) DO NOTHING
  `, [ids.checklistItem1, ids.checklistItem2, ids.tenant, ids.checklist, ids.analyst, ids.manager]);

  await client.query(`
    INSERT INTO app.delivery_environments(id, tenant_id, project_id, name, type, status, base_url, owner_user_id)
    VALUES
      ($1, $3, $4, 'Homologação', 'HOMOLOGATION', 'ACTIVE', 'https://homolog.local', $5),
      ($2, $3, $4, 'Produção', 'PRODUCTION', 'PLANNED', 'https://portal.local', $6)
    ON CONFLICT (id) DO NOTHING
  `, [ids.environmentHom, ids.environmentProd, ids.tenant, ids.project, ids.analyst, ids.manager]);

  await client.query(`
    INSERT INTO app.delivery_components(id, tenant_id, project_id, name, type, repository_url, current_version, status)
    VALUES ($1, $2, $3, 'Portal de Bilhetagem', 'WEB', 'https://git.local/portal', '2.4.20', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `, [ids.component, ids.tenant, ids.project]);

  await client.query(`
    INSERT INTO app.delivery_versions(id, tenant_id, component_id, version, changelog, status, artifact_url, created_by, released_at)
    VALUES ($1, $2, $3, '2.4.20', 'Wi-Fi passageiro e correções de integração.', 'READY', 'registry.local/portal:2.4.20', $4, now())
    ON CONFLICT (id) DO NOTHING
  `, [ids.version, ids.tenant, ids.component, ids.manager]);

  await client.query(`
    INSERT INTO app.delivery_deployments(id, tenant_id, project_id, environment_id, version_id, name, status, strategy, requested_by, approved_by, started_at, finished_at)
    VALUES ($1, $2, $3, $4, $5, 'Deploy 2.4.20 em homologação', 'SUCCEEDED', 'BLUE_GREEN', $6, $7, now() - interval '2 hours', now() - interval '90 minutes')
    ON CONFLICT (id) DO NOTHING
  `, [ids.deployment, ids.tenant, ids.project, ids.environmentHom, ids.version, ids.analyst, ids.manager]);

  await client.query(`
    INSERT INTO app.quality_test_plans(id, tenant_id, project_id, environment_id, name, description, status, owner_user_id, planned_start_at, planned_end_at)
    VALUES ($1, $2, $3, $4, 'Homologação integrada 2.4.20', 'Validação dos fluxos críticos.', 'IN_PROGRESS', $5, now() - interval '1 day', now() + interval '5 days')
    ON CONFLICT (id) DO NOTHING
  `, [ids.testPlan, ids.tenant, ids.project, ids.environmentHom, ids.analyst]);

  await client.query(`
    INSERT INTO app.quality_test_cases(id, tenant_id, test_plan_id, code, title, preconditions, steps, expected_result, priority, status)
    VALUES ($1, $2, $3, 'CT-001', 'Realizar recarga com cartão', 'Usuário e mídia válidos.', '["Acessar portal","Selecionar recarga","Confirmar pagamento"]'::jsonb, 'Recarga registrada e saldo atualizado.', 'CRITICAL', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `, [ids.testCase, ids.tenant, ids.testPlan]);

  await client.query(`
    INSERT INTO app.quality_test_runs(id, tenant_id, test_case_id, deployment_id, executor_user_id, status, evidence, notes, started_at, finished_at)
    VALUES ($1, $2, $3, $4, $5, 'FAILED', '[{"type":"screenshot","name":"erro-recarga.png"}]'::jsonb, 'Timeout na confirmação.', now() - interval '1 hour', now() - interval '50 minutes')
    ON CONFLICT (id) DO NOTHING
  `, [ids.testRun, ids.tenant, ids.testCase, ids.deployment, ids.analyst]);

  await client.query(`
    INSERT INTO app.quality_defects(id, tenant_id, project_id, test_run_id, title, description, severity, priority, status, assignee_user_id)
    VALUES ($1, $2, $3, $4, 'Timeout ao confirmar recarga', 'A confirmação ultrapassa o tempo limite em homologação.', 'HIGH', 'HIGH', 'IN_PROGRESS', $5)
    ON CONFLICT (id) DO NOTHING
  `, [ids.defect, ids.tenant, ids.project, ids.testRun, ids.analyst]);

  await client.query(`
    INSERT INTO app.pilot_runs(id, tenant_id, project_id, name, description, status, planned_start_at, planned_end_at, owner_user_id)
    VALUES ($1, $2, $3, 'Piloto controlado — Garagem Central', 'Operação com grupo reduzido de veículos.', 'PLANNED', now() + interval '15 days', now() + interval '22 days', $4)
    ON CONFLICT (id) DO NOTHING
  `, [ids.pilot, ids.tenant, ids.project, ids.manager]);

  await client.query(`
    INSERT INTO app.pilot_metrics(id, tenant_id, pilot_id, name, unit, target_value, actual_value, status)
    VALUES ($1, $2, $3, 'Disponibilidade do serviço', '%', 99.5, NULL, 'PENDING')
    ON CONFLICT (id) DO NOTHING
  `, [ids.pilotMetric, ids.tenant, ids.pilot]);

  await client.query(`
    INSERT INTO app.governance_risks(id, tenant_id, project_id, title, description, probability, impact, status, owner_user_id, mitigation, due_at)
    VALUES ($1, $2, $3, 'Atraso na liberação da VPN', 'A rota para o banco Oracle ainda depende do cliente.', 4, 5, 'OPEN', $4, 'Escalonar diariamente e preparar túnel alternativo.', now() + interval '3 days')
    ON CONFLICT (id) DO NOTHING
  `, [ids.risk, ids.tenant, ids.project, ids.manager]);

  await client.query(`
    INSERT INTO app.governance_blockers(id, tenant_id, project_id, title, description, severity, status, owner_user_id)
    VALUES ($1, $2, $3, 'Credencial de homologação pendente', 'Usuário técnico ainda não foi liberado.', 'HIGH', 'OPEN', $4)
    ON CONFLICT (id) DO NOTHING
  `, [ids.blocker, ids.tenant, ids.project, ids.manager]);

  await client.query(`
    INSERT INTO app.governance_change_requests(id, tenant_id, project_id, code, title, description, reason, impact_scope, status, requester_user_id, approver_user_id, requested_at)
    VALUES ($1, $2, $3, 'CR-001', 'Incluir Wi-Fi passageiro', 'Adicionar configuração e monitoramento do Wi-Fi.', 'Demanda comercial aprovada.', '{"scheduleDays":3,"costImpact":"LOW"}'::jsonb, 'SUBMITTED', $4, $5, now())
    ON CONFLICT (id) DO NOTHING
  `, [ids.changeRequest, ids.tenant, ids.project, ids.manager, ids.admin]);

  await client.query(`
    INSERT INTO app.governance_approvals(id, tenant_id, project_id, entity_type, entity_id, version_ref, status, requested_by, comments)
    VALUES ($1, $2, $3, 'DEPLOYMENT', $4, '2.4.20', 'PENDING', $5, 'Aguardando aceite do cliente.')
    ON CONFLICT (id) DO NOTHING
  `, [ids.approval, ids.tenant, ids.project, ids.deployment, ids.manager]);

  await client.query(`
    INSERT INTO app.content_documents(id, tenant_id, project_id, customer_id, title, category, status, current_version, created_by)
    VALUES ($1, $2, $3, $4, 'Plano de implantação', 'PROJECT_PLAN', 'ACTIVE', 0, $5)
    ON CONFLICT (id) DO NOTHING
  `, [ids.document, ids.tenant, ids.project, ids.customer, ids.manager]);

  await client.query(`
    INSERT INTO app.integration_connections(id, tenant_id, name, type, status, config_encrypted, created_by)
    VALUES ($1, $2, 'Oracle Homologação', 'ORACLE', 'INACTIVE', $3, $4)
    ON CONFLICT (id) DO NOTHING
  `, [ids.connection, ids.tenant, encryptSecret({ host: 'oracle.internal', port: 1521, serviceName: 'HML' }), ids.admin]);

  await client.query(`
    INSERT INTO app.portal_access(id, tenant_id, customer_id, user_id, status)
    VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')
    ON CONFLICT (tenant_id, customer_id, user_id) DO UPDATE SET status = 'ACTIVE'
  `, [ids.tenant, ids.customer, ids.customerUser]);

  await client.query(`
    INSERT INTO app.notification_notifications(id, tenant_id, user_id, type, title, body, status, link, sent_at)
    VALUES ($3, $1, $2, 'RISK_ALERT', 'Risco crítico em aberto', 'A liberação da VPN precisa de acompanhamento.', 'SENT', '/governance?resource=risks', now())
    ON CONFLICT DO NOTHING
  `, [ids.tenant, ids.manager, ids.notification]);

  await client.query('COMMIT');

  console.log('Seed completed');
  console.log('Login: admin@implantahub.local');
  console.log('Password: Admin@123456');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
