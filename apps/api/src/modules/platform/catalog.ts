export type FieldType = 'string' | 'text' | 'uuid' | 'number' | 'boolean' | 'date' | 'json';

export interface ResourceField {
  api: string;
  column: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  fromUser?: boolean;
  sensitive?: 'hash' | 'encrypt' | 'redact';
  relation?: { path: string; labelFields: string[] };
  defaultValue?: unknown;
}

export interface ResourceDefinition {
  key: string;
  path: string;
  table: string;
  label: string;
  group: string;
  description: string;
  titleField: string;
  searchColumns: string[];
  filters: string[];
  fields: ResourceField[];
  readRoles?: string[];
  writeRoles?: string[];
  userScopedField?: string;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  allowDelete?: boolean;
}

const relation = (path: string, ...labelFields: string[]) => ({ path, labelFields });

const f = (
  api: string,
  column: string,
  type: FieldType,
  options: Omit<ResourceField, 'api' | 'column' | 'type'> = {},
): ResourceField => ({ api, column, type, ...options });

const project = f('projectId', 'project_id', 'uuid', { required: true, relation: relation('projects', 'code', 'name') });
const customer = f('customerId', 'customer_id', 'uuid', { required: true, relation: relation('customers', 'code', 'tradeName', 'legalName') });
const status = f('status', 'status', 'string');
const createdBy = f('createdBy', 'created_by', 'uuid', { fromUser: true, readOnly: true });
const owner = f('ownerUserId', 'owner_user_id', 'uuid', { relation: relation('directory/users', 'displayName', 'email') });

export const platformResources: ResourceDefinition[] = [
  {
    key: 'contacts', path: 'contacts', table: 'customer_contacts', label: 'Contatos', group: 'Clientes',
    description: 'Contatos técnicos, executivos e operacionais do cliente.', titleField: 'name',
    searchColumns: ['name', 'email', 'role'], filters: ['customerId', 'status'],
    fields: [customer, f('name', 'name', 'string', { required: true }), f('email', 'email', 'string'), f('phone', 'phone', 'string'), f('role', 'role', 'string'), status],
  },
  {
    key: 'units', path: 'units', table: 'customer_units', label: 'Unidades', group: 'Clientes',
    description: 'Filiais, garagens, terminais e unidades atendidas.', titleField: 'name',
    searchColumns: ['code', 'name', 'city'], filters: ['customerId', 'status'],
    fields: [customer, f('code', 'code', 'string', { required: true }), f('name', 'name', 'string', { required: true }), f('city', 'city', 'string'), f('state', 'state', 'string'), f('address', 'address', 'text'), status],
  },
  {
    key: 'project-templates', path: 'project-templates', table: 'project_templates', label: 'Templates de projeto', group: 'Planejamento',
    description: 'Modelos versionados para padronizar implantações.', titleField: 'name',
    searchColumns: ['code', 'name'], filters: ['status'],
    fields: [f('code', 'code', 'string', { required: true }), f('name', 'name', 'string', { required: true }), f('description', 'description', 'text'), status, f('currentVersion', 'current_version', 'number'), createdBy],
  },
  {
    key: 'template-versions', path: 'template-versions', table: 'project_template_versions', label: 'Versões de template', group: 'Planejamento', allowUpdate: false, allowDelete: false,
    description: 'Definições imutáveis de fases, marcos e checklists.', titleField: 'version',
    searchColumns: [], filters: ['templateId'],
    fields: [f('templateId', 'template_id', 'uuid', { required: true, relation: relation('project-templates', 'code', 'name') }), f('version', 'version', 'number', { required: true }), f('definition', 'definition', 'json', { required: true }), f('publishedAt', 'published_at', 'date'), createdBy],
  },
  {
    key: 'project-members', path: 'project-members', table: 'project_members', label: 'Equipe do projeto', group: 'Planejamento',
    description: 'Participantes, papéis e alocação do projeto.', titleField: 'role',
    searchColumns: ['role'], filters: ['projectId', 'status'],
    fields: [project, f('userId', 'user_id', 'uuid', { required: true, relation: relation('directory/users', 'displayName', 'email') }), f('role', 'role', 'string', { required: true }), f('allocationPercent', 'allocation_percent', 'number'), status],
  },
  {
    key: 'phases', path: 'phases', table: 'project_phases', label: 'Fases', group: 'Planejamento',
    description: 'Etapas do ciclo de implantação.', titleField: 'name',
    searchColumns: ['name', 'description'], filters: ['projectId', 'status'],
    fields: [project, f('name', 'name', 'string', { required: true }), f('description', 'description', 'text'), status, f('position', 'position', 'number'), f('progress', 'progress', 'number'), f('plannedStartAt', 'planned_start_at', 'date'), f('plannedEndAt', 'planned_end_at', 'date'), f('actualStartAt', 'actual_start_at', 'date'), f('actualEndAt', 'actual_end_at', 'date'), owner],
  },
  {
    key: 'milestones', path: 'milestones', table: 'project_milestones', label: 'Marcos', group: 'Planejamento',
    description: 'Entregas e pontos de controle do cronograma.', titleField: 'title',
    searchColumns: ['title', 'description'], filters: ['projectId', 'phaseId', 'status'],
    fields: [project, f('phaseId', 'phase_id', 'uuid', { relation: relation('phases', 'name') }), f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), status, f('dueAt', 'due_at', 'date'), f('completedAt', 'completed_at', 'date'), owner],
  },
  {
    key: 'checklists', path: 'checklists', table: 'execution_checklists', label: 'Checklists', group: 'Execução',
    description: 'Listas de verificação por fase e gate.', titleField: 'name',
    searchColumns: ['name', 'description'], filters: ['projectId', 'phaseId', 'status'],
    fields: [project, f('phaseId', 'phase_id', 'uuid', { relation: relation('phases', 'name') }), f('name', 'name', 'string', { required: true }), f('description', 'description', 'text'), status, f('progress', 'progress', 'number'), createdBy],
  },
  {
    key: 'checklist-items', path: 'checklist-items', table: 'execution_checklist_items', label: 'Itens de checklist', group: 'Execução',
    description: 'Validações, respostas e evidências obrigatórias.', titleField: 'title',
    searchColumns: ['title', 'description'], filters: ['checklistId', 'status'],
    fields: [f('checklistId', 'checklist_id', 'uuid', { required: true, relation: relation('checklists', 'name') }), f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('required', 'required', 'boolean'), status, f('position', 'position', 'number'), f('assigneeUserId', 'assignee_user_id', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), f('dueAt', 'due_at', 'date'), f('response', 'response', 'json'), f('completedAt', 'completed_at', 'date')],
  },
  {
    key: 'comments', path: 'comments', table: 'collaboration_comments', label: 'Comentários', group: 'Colaboração',
    description: 'Timeline, decisões e menções vinculadas a objetos.', titleField: 'body',
    searchColumns: ['body', 'entity_type'], filters: ['projectId', 'entityType', 'entityId'],
    fields: [project, f('entityType', 'entity_type', 'string', { required: true }), f('entityId', 'entity_id', 'uuid'), f('authorUserId', 'author_user_id', 'uuid', { fromUser: true, readOnly: true }), f('body', 'body', 'text', { required: true }), f('mentions', 'mentions', 'json', { defaultValue: [] })],
  },
  {
    key: 'environments', path: 'environments', table: 'delivery_environments', label: 'Ambientes', group: 'Entrega técnica',
    description: 'Desenvolvimento, homologação, piloto e produção.', titleField: 'name',
    searchColumns: ['name', 'type', 'base_url'], filters: ['projectId', 'status', 'type'],
    fields: [project, f('name', 'name', 'string', { required: true }), f('type', 'type', 'string', { required: true }), status, f('baseUrl', 'base_url', 'string'), owner, f('metadata', 'metadata', 'json')],
  },
  {
    key: 'components', path: 'components', table: 'delivery_components', label: 'Componentes', group: 'Entrega técnica',
    description: 'APIs, portais, validadores, bancos e serviços.', titleField: 'name',
    searchColumns: ['name', 'type', 'current_version'], filters: ['projectId', 'status', 'type'],
    fields: [project, f('name', 'name', 'string', { required: true }), f('type', 'type', 'string', { required: true }), f('repositoryUrl', 'repository_url', 'string'), f('currentVersion', 'current_version', 'string'), status, f('metadata', 'metadata', 'json')],
  },
  {
    key: 'versions', path: 'versions', table: 'delivery_versions', label: 'Versões', group: 'Entrega técnica',
    description: 'Releases e artefatos versionados por componente.', titleField: 'version',
    searchColumns: ['version', 'changelog'], filters: ['componentId', 'status'],
    fields: [f('componentId', 'component_id', 'uuid', { required: true, relation: relation('components', 'name', 'currentVersion') }), f('version', 'version', 'string', { required: true }), f('changelog', 'changelog', 'text'), status, f('artifactUrl', 'artifact_url', 'string'), createdBy, f('releasedAt', 'released_at', 'date')],
  },
  {
    key: 'deployments', path: 'deployments', table: 'delivery_deployments', label: 'Deployments', group: 'Entrega técnica',
    description: 'Execuções de deploy, aprovações e rollback.', titleField: 'name',
    searchColumns: ['name', 'strategy', 'error_message'], filters: ['projectId', 'environmentId', 'status'],
    fields: [project, f('environmentId', 'environment_id', 'uuid', { required: true, relation: relation('environments', 'name', 'type') }), f('versionId', 'version_id', 'uuid', { relation: relation('versions', 'version') }), f('name', 'name', 'string', { required: true }), status, f('strategy', 'strategy', 'string'), f('requestedBy', 'requested_by', 'uuid', { fromUser: true, readOnly: true }), f('approvedBy', 'approved_by', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), f('startedAt', 'started_at', 'date'), f('finishedAt', 'finished_at', 'date'), f('rollbackOf', 'rollback_of', 'uuid', { relation: relation('deployments', 'name', 'status') }), f('errorMessage', 'error_message', 'text'), f('metadata', 'metadata', 'json')],
  },
  {
    key: 'test-plans', path: 'test-plans', table: 'quality_test_plans', label: 'Planos de teste', group: 'Qualidade',
    description: 'Escopo e janela de validação por projeto.', titleField: 'name',
    searchColumns: ['name', 'description'], filters: ['projectId', 'environmentId', 'status'],
    fields: [project, f('environmentId', 'environment_id', 'uuid', { relation: relation('environments', 'name', 'type') }), f('name', 'name', 'string', { required: true }), f('description', 'description', 'text'), status, owner, f('plannedStartAt', 'planned_start_at', 'date'), f('plannedEndAt', 'planned_end_at', 'date')],
  },
  {
    key: 'test-cases', path: 'test-cases', table: 'quality_test_cases', label: 'Casos de teste', group: 'Qualidade',
    description: 'Cenários, passos e resultados esperados.', titleField: 'title',
    searchColumns: ['code', 'title', 'expected_result'], filters: ['testPlanId', 'status', 'priority'],
    fields: [f('testPlanId', 'test_plan_id', 'uuid', { required: true, relation: relation('test-plans', 'name') }), f('code', 'code', 'string', { required: true }), f('title', 'title', 'string', { required: true }), f('preconditions', 'preconditions', 'text'), f('steps', 'steps', 'json'), f('expectedResult', 'expected_result', 'text'), f('priority', 'priority', 'string'), status],
  },
  {
    key: 'test-runs', path: 'test-runs', table: 'quality_test_runs', label: 'Execuções de teste', group: 'Qualidade',
    description: 'Resultado, evidências e executor de cada caso.', titleField: 'status',
    searchColumns: ['notes'], filters: ['testCaseId', 'deploymentId', 'status'],
    fields: [f('testCaseId', 'test_case_id', 'uuid', { required: true, relation: relation('test-cases', 'code', 'title') }), f('deploymentId', 'deployment_id', 'uuid', { relation: relation('deployments', 'name', 'status') }), f('executorUserId', 'executor_user_id', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), status, f('evidence', 'evidence', 'json'), f('notes', 'notes', 'text'), f('startedAt', 'started_at', 'date'), f('finishedAt', 'finished_at', 'date')],
  },
  {
    key: 'defects', path: 'defects', table: 'quality_defects', label: 'Defeitos', group: 'Qualidade',
    description: 'Falhas identificadas e seu ciclo de resolução.', titleField: 'title',
    searchColumns: ['title', 'description'], filters: ['projectId', 'testRunId', 'status', 'severity', 'priority'],
    fields: [project, f('testRunId', 'test_run_id', 'uuid', { relation: relation('test-runs', 'status', 'startedAt') }), f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('severity', 'severity', 'string'), f('priority', 'priority', 'string'), status, f('assigneeUserId', 'assignee_user_id', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), f('detectedAt', 'detected_at', 'date'), f('resolvedAt', 'resolved_at', 'date')],
  },
  {
    key: 'pilots', path: 'pilots', table: 'pilot_runs', label: 'Pilotos', group: 'Piloto',
    description: 'Operações-piloto e critérios de sucesso.', titleField: 'name',
    searchColumns: ['name', 'description'], filters: ['projectId', 'status'],
    fields: [project, f('name', 'name', 'string', { required: true }), f('description', 'description', 'text'), status, f('plannedStartAt', 'planned_start_at', 'date'), f('plannedEndAt', 'planned_end_at', 'date'), f('actualStartAt', 'actual_start_at', 'date'), f('actualEndAt', 'actual_end_at', 'date'), owner],
  },
  {
    key: 'pilot-metrics', path: 'pilot-metrics', table: 'pilot_metrics', label: 'Métricas do piloto', group: 'Piloto',
    description: 'Metas e resultados medidos no piloto.', titleField: 'name',
    searchColumns: ['name', 'unit'], filters: ['pilotId', 'status'],
    fields: [f('pilotId', 'pilot_id', 'uuid', { required: true, relation: relation('pilots', 'name') }), f('name', 'name', 'string', { required: true }), f('unit', 'unit', 'string'), f('targetValue', 'target_value', 'number'), f('actualValue', 'actual_value', 'number'), status, f('measuredAt', 'measured_at', 'date')],
  },
  {
    key: 'pilot-incidents', path: 'pilot-incidents', table: 'pilot_incidents', label: 'Incidentes do piloto', group: 'Piloto',
    description: 'Ocorrências acompanhadas durante a operação-piloto.', titleField: 'title',
    searchColumns: ['title', 'description'], filters: ['pilotId', 'status', 'severity'],
    fields: [f('pilotId', 'pilot_id', 'uuid', { required: true, relation: relation('pilots', 'name') }), f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('severity', 'severity', 'string'), status, owner, f('openedAt', 'opened_at', 'date'), f('resolvedAt', 'resolved_at', 'date')],
  },
  {
    key: 'risks', path: 'risks', table: 'governance_risks', label: 'Riscos', group: 'Governança',
    description: 'Matriz de probabilidade, impacto e mitigação.', titleField: 'title',
    searchColumns: ['title', 'description', 'mitigation'], filters: ['projectId', 'status'],
    fields: [project, f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('probability', 'probability', 'number', { required: true }), f('impact', 'impact', 'number', { required: true }), f('score', 'score', 'number', { readOnly: true }), status, owner, f('mitigation', 'mitigation', 'text'), f('dueAt', 'due_at', 'date')],
  },
  {
    key: 'blockers', path: 'blockers', table: 'governance_blockers', label: 'Impedimentos', group: 'Governança',
    description: 'Bloqueios que exigem ação e escalonamento.', titleField: 'title',
    searchColumns: ['title', 'description'], filters: ['projectId', 'status', 'severity'],
    fields: [project, f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('severity', 'severity', 'string'), status, owner, f('openedAt', 'opened_at', 'date'), f('resolvedAt', 'resolved_at', 'date')],
  },
  {
    key: 'change-requests', path: 'change-requests', table: 'governance_change_requests', label: 'Solicitações de mudança', group: 'Governança',
    description: 'Mudanças de escopo, prazo, custo e arquitetura.', titleField: 'title',
    searchColumns: ['code', 'title', 'description', 'reason'], filters: ['projectId', 'status'],
    fields: [project, f('code', 'code', 'string', { required: true }), f('title', 'title', 'string', { required: true }), f('description', 'description', 'text'), f('reason', 'reason', 'text'), f('impactScope', 'impact_scope', 'json'), status, f('requesterUserId', 'requester_user_id', 'uuid', { fromUser: true, readOnly: true }), f('approverUserId', 'approver_user_id', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), f('requestedAt', 'requested_at', 'date'), f('decidedAt', 'decided_at', 'date')],
  },
  {
    key: 'approvals', path: 'approvals', table: 'governance_approvals', label: 'Aprovações', group: 'Governança',
    description: 'Gates formais associados à versão exata do objeto.', titleField: 'entityType',
    searchColumns: ['entity_type', 'version_ref', 'comments'], filters: ['projectId', 'entityType', 'status'],
    fields: [project, f('entityType', 'entity_type', 'string', { required: true }), f('entityId', 'entity_id', 'uuid', { required: true }), f('versionRef', 'version_ref', 'string', { required: true }), status, f('requestedBy', 'requested_by', 'uuid', { fromUser: true, readOnly: true }), f('decidedBy', 'decided_by', 'uuid', { relation: relation('directory/users', 'displayName', 'email') }), f('comments', 'comments', 'text'), f('requestedAt', 'requested_at', 'date'), f('decidedAt', 'decided_at', 'date')],
  },
  {
    key: 'documents', path: 'documents', table: 'content_documents', label: 'Documentos', group: 'Conteúdo',
    description: 'Documentos do projeto com controle de versão.', titleField: 'title',
    searchColumns: ['title', 'category'], filters: ['projectId', 'customerId', 'status', 'category'],
    fields: [f('projectId', 'project_id', 'uuid'), f('customerId', 'customer_id', 'uuid'), f('title', 'title', 'string', { required: true }), f('category', 'category', 'string'), status, f('currentVersion', 'current_version', 'number', { readOnly: true }), createdBy],
  },
  {
    key: 'document-versions', path: 'document-versions', table: 'content_document_versions', label: 'Versões de documento', group: 'Conteúdo', allowCreate: false, allowUpdate: false, allowDelete: false,
    description: 'Metadados dos arquivos armazenados.', titleField: 'fileName',
    searchColumns: ['file_name', 'mime_type', 'object_key'], filters: ['documentId'],
    fields: [f('documentId', 'document_id', 'uuid', { required: true, relation: relation('documents', 'title', 'category') }), f('version', 'version', 'number', { required: true }), f('fileName', 'file_name', 'string', { required: true }), f('objectKey', 'object_key', 'string', { required: true }), f('mimeType', 'mime_type', 'string'), f('sizeBytes', 'size_bytes', 'number'), f('checksum', 'checksum', 'string'), f('status', 'status', 'string', { readOnly: true }), f('uploadedBy', 'uploaded_by', 'uuid', { fromUser: true, readOnly: true })],
  },
  {
    key: 'portal-access', path: 'portal-access', table: 'portal_access', label: 'Acessos ao portal', group: 'Administração',
    description: 'Vínculos explícitos entre usuários do cliente e empresas autorizadas no portal.', titleField: 'status',
    searchColumns: [], filters: ['customerId', 'userId', 'status'], readRoles: ['ADMIN'], writeRoles: ['ADMIN'],
    fields: [customer, f('userId', 'user_id', 'uuid', { required: true, relation: relation('directory/users', 'displayName', 'email') }), status, f('permissions', 'permissions', 'json', { required: true, defaultValue: ['READ_PROJECTS', 'READ_DOCUMENTS'] })],
  },
  {
    key: 'notifications', path: 'notifications', table: 'notification_notifications', label: 'Notificações', group: 'Comunicação', allowCreate: false, allowUpdate: false, allowDelete: false, readRoles: ['ADMIN', 'MANAGER', 'ANALYST', 'CUSTOMER'],
    description: 'Central de notificações in-app e por canal.', titleField: 'title', userScopedField: 'user_id',
    searchColumns: ['title', 'body', 'type'], filters: ['userId', 'status', 'channel'],
    fields: [f('userId', 'user_id', 'uuid', { fromUser: true, readOnly: true }), f('type', 'type', 'string', { required: true }), f('title', 'title', 'string', { required: true }), f('body', 'body', 'text', { required: true }), f('channel', 'channel', 'string'), status, f('link', 'link', 'string'), f('readAt', 'read_at', 'date'), f('sentAt', 'sent_at', 'date')],
  },
  {
    key: 'webhook-endpoints', path: 'webhook-endpoints', table: 'integration_webhook_endpoints', label: 'Webhooks', group: 'Integrações',
    description: 'Destinos assinados para eventos da plataforma.', titleField: 'name',
    searchColumns: ['name', 'url'], filters: ['status'], writeRoles: ['ADMIN'],
    fields: [f('name', 'name', 'string', { required: true }), f('url', 'url', 'string', { required: true }), f('secret', 'secret_encrypted', 'string', { required: true, sensitive: 'encrypt' }), f('eventTypes', 'event_types', 'json', { defaultValue: [] }), status, createdBy],
  },
  {
    key: 'webhook-deliveries', path: 'webhook-deliveries', table: 'integration_webhook_deliveries', label: 'Entregas de webhook', group: 'Integrações', allowCreate: false, allowUpdate: false, allowDelete: false,
    description: 'Tentativas, respostas e reprocessamento.', titleField: 'status',
    searchColumns: ['response_body'], filters: ['endpointId', 'eventId', 'status'], writeRoles: ['ADMIN'],
    fields: [f('endpointId', 'endpoint_id', 'uuid', { required: true }), f('eventId', 'event_id', 'uuid', { required: true }), status, f('attemptCount', 'attempt_count', 'number'), f('responseStatus', 'response_status', 'number'), f('responseBody', 'response_body', 'text'), f('nextAttemptAt', 'next_attempt_at', 'date'), f('deliveredAt', 'delivered_at', 'date')],
  },
  {
    key: 'report-jobs', path: 'report-jobs', table: 'reporting_jobs', label: 'Relatórios', group: 'Relatórios', allowCreate: false, allowUpdate: false, allowDelete: false,
    description: 'Exportações assíncronas em CSV, XLSX e PDF.', titleField: 'type', userScopedField: 'requested_by',
    searchColumns: ['type', 'format', 'error_message'], filters: ['status', 'type', 'format'],
    fields: [f('requestedBy', 'requested_by', 'uuid', { fromUser: true, readOnly: true }), f('type', 'type', 'string', { required: true }), f('format', 'format', 'string', { required: true }), f('filters', 'filters', 'json'), status, f('objectKey', 'object_key', 'string', { readOnly: true }), f('errorMessage', 'error_message', 'text', { readOnly: true }), f('startedAt', 'started_at', 'date', { readOnly: true }), f('finishedAt', 'finished_at', 'date', { readOnly: true }), f('expiresAt', 'expires_at', 'date', { readOnly: true })],
  },
  {
    key: 'integration-connections', path: 'integration-connections', table: 'integration_connections', label: 'Conexões', group: 'Integrações',
    description: 'Conexões Oracle, HTTP, SFTP e mensageria.', titleField: 'name',
    searchColumns: ['name', 'type', 'last_error'], filters: ['status', 'type'], writeRoles: ['ADMIN'],
    fields: [f('name', 'name', 'string', { required: true }), f('type', 'type', 'string', { required: true }), status, f('config', 'config_encrypted', 'json', { required: true, sensitive: 'encrypt' }), f('lastTestedAt', 'last_tested_at', 'date', { readOnly: true }), f('lastError', 'last_error', 'text', { readOnly: true }), createdBy],
  },
  {
    key: 'integration-jobs', path: 'integration-jobs', table: 'integration_jobs', label: 'Jobs de integração', group: 'Integrações',
    description: 'Sincronizações e testes executados pelos workers.', titleField: 'jobType',
    searchColumns: ['job_type', 'last_error'], filters: ['connectionId', 'projectId', 'status', 'jobType'],
    fields: [f('connectionId', 'connection_id', 'uuid', { required: true, relation: relation('integration-connections', 'name', 'type') }), f('projectId', 'project_id', 'uuid'), f('jobType', 'job_type', 'string', { required: true }), status, f('payload', 'payload', 'json'), f('result', 'result', 'json', { readOnly: true }), f('attemptCount', 'attempt_count', 'number', { readOnly: true }), f('scheduledAt', 'scheduled_at', 'date'), f('startedAt', 'started_at', 'date', { readOnly: true }), f('finishedAt', 'finished_at', 'date', { readOnly: true }), f('lastError', 'last_error', 'text', { readOnly: true })],
  },
];

export function resourceByPath(path: string): ResourceDefinition | undefined {
  return platformResources.find((resource) => resource.path === path);
}
