# API do ImplantaHub

> Atualizado em **22 de julho de 2026**.

## Endereços

| Uso | URL local |
|---|---|
| Gateway recomendado | `http://localhost:8080/api/v1` |
| Proxy do Next.js | `http://localhost:3000/api/v1` |
| API direta para desenvolvimento | `http://localhost:3333/api/v1` |
| Swagger | `http://localhost:3333/docs` |
| OpenAPI JSON | `http://localhost:3333/openapi.json` |
| Liveness | `/health/live` |
| Readiness | `/health/ready` |

O frontend não deve montar URLs absolutas para a API. Use sempre `/api/v1` no navegador.

## Convenções

- JSON para requisições e respostas comuns.
- UUID para identificadores.
- ISO 8601 para datas.
- `Authorization: Bearer <access-token>` nas rotas autenticadas.
- Cookie HttpOnly `implantahub_refresh` para renovação de sessão.
- `X-Correlation-ID` aceito em todas as requisições.
- Limite global de 300 requisições por minuto; login possui limite mais restritivo.
- Recursos multiempresa exigem tenant ativo no token.

## Envelopes

### Sucesso

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "correlationId": "..."
  }
}
```

### Lista

```json
{
  "data": [],
  "pagination": {
    "limit": 100,
    "hasNextPage": false,
    "nextCursor": null
  },
  "meta": {
    "requestId": "...",
    "correlationId": "..."
  }
}
```

A paginação por cursor está reservada no contrato; a versão atual retorna `hasNextPage: false`.

### Erro

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A requisição contém campos inválidos.",
    "details": [
      {
        "field": "name",
        "reason": "too_small",
        "message": "..."
      }
    ]
  },
  "meta": {
    "requestId": "...",
    "correlationId": "..."
  }
}
```

## Autenticação e sessão

### Fluxo

1. `POST /auth/login` retorna access token sem tenant e grava o refresh token no cookie HttpOnly.
2. `GET /auth/tenants` lista workspaces disponíveis.
3. `POST /auth/select-tenant` retorna novo access token com `tenantId` e `role`.
4. `POST /auth/refresh` rotaciona o refresh token e restaura usuário e tenant.
5. A API invalida tokens antigos quando detecta reutilização da família de refresh tokens.
6. `POST /auth/logout` revoga a sessão e remove o cookie.

### Endpoints

| Método | Rota | Uso |
|---|---|---|
| POST | `/auth/login` | Autenticar |
| GET | `/auth/tenants` | Listar workspaces |
| POST | `/auth/select-tenant` | Selecionar workspace |
| POST | `/auth/refresh` | Renovar sessão |
| GET | `/auth/me` | Consultar perfil |
| PATCH | `/auth/me` | Atualizar nome |
| POST | `/auth/change-password` | Alterar senha e revogar outras sessões |
| POST | `/auth/logout` | Encerrar sessão |
| POST | `/auth/accept-invitation` | Aceitar convite e definir senha |

O access token expira em 15 minutos. O refresh token expira em 30 dias e é rotacionado a cada uso.

## Papéis

| Papel | Escopo principal |
|---|---|
| `ADMIN` | Administração, integrações e todos os módulos internos |
| `MANAGER` | Gestão operacional e governança |
| `ANALYST` | Execução e atualização de recursos permitidos |
| `CUSTOMER` | Somente portal e recursos explicitamente autorizados |

A API valida o papel atual no banco. Alterações de papel invalidam tokens com papel antigo.

## Endpoints explícitos

### Administração

- `GET /directory/users`
- `GET /admin/members`
- `PATCH /admin/members/:id`
- `GET /admin/invitations`
- `POST /admin/invitations`
- `POST /admin/invitations/:id/revoke`

### Clientes

- `GET /customers`
- `POST /customers`
- `GET /customers/:customerId`
- `PATCH /customers/:customerId`

### Projetos

- `GET /projects`
- `POST /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `POST /projects/:projectId/transitions`

### Tarefas

- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:taskId/status`

### Dashboard e auditoria

- `GET /dashboard/summary`
- `GET /audit-events`

### Notificações

- `POST /notifications/:notificationId/read`
- `POST /notifications/read-all`

### Documentos

- `POST /documents/:documentId/upload-url`
- `PUT /document-versions/:versionId/content`
- `POST /document-versions/:versionId/complete`
- `GET /document-versions/:versionId/download`
- `GET /document-versions/:versionId/download-url`

O caminho recomendado para o navegador é `upload-url` → `PUT content` → `complete`. O conteúdo passa pelo gateway autenticado e a API transmite ao MinIO.

### Relatórios

- `POST /reports`
- `GET /reports/:reportId/download`
- `GET /report-jobs`

A criação retorna `202`. O worker gera CSV, XLSX ou PDF e atualiza o job.

### Integrações

- `POST /integration-connections/:connectionId/test`
- `POST /integration-jobs/:jobId/run`
- `POST /webhook-deliveries/:deliveryId/retry`
- `POST /integration-inbox`

### Portal do cliente

- `GET /portal/projects`
- `GET /portal/projects/:projectId`

Usuários `CUSTOMER` recebem `403` em módulos internos, mesmo que tentem chamar a API diretamente.

## Recursos operacionais gerados pelo catálogo

Cada recurso abaixo possui tabela concreta e rotas de leitura. Criação, atualização e exclusão são habilitadas conforme a definição do recurso e o papel do usuário.

```text
contacts
units
project-templates
template-versions
project-members
phases
milestones
checklists
checklist-items
comments
environments
components
versions
deployments
test-plans
test-cases
test-runs
defects
pilots
pilot-metrics
pilot-incidents
risks
blockers
change-requests
approvals
documents
document-versions
portal-access
notifications
webhook-endpoints
webhook-deliveries
report-jobs
integration-connections
integration-jobs
```

Padrão de rota:

```text
GET    /api/v1/{resource}
GET    /api/v1/{resource}/:id
POST   /api/v1/{resource}
PATCH  /api/v1/{resource}/:id
DELETE /api/v1/{resource}/:id
```

Rotas não permitidas pela definição do recurso retornam `404` ou `403`, conforme o caso.

## Filtros

Os endpoints principais e os recursos do catálogo aceitam combinações como:

```text
?search=texto
?limit=50
?projectId=<uuid>
?customerId=<uuid>
?status=OPEN
?ownerUserId=<uuid>
```

Os filtros válidos dependem da definição retornada por:

```text
GET /api/v1/platform/catalog
```

## Erros relevantes

| Código | Significado |
|---|---|
| `AUTH_INVALID_CREDENTIALS` | E-mail ou senha inválidos |
| `AUTH_SESSION_EXPIRED` | Token ausente ou expirado |
| `AUTH_REFRESH_TOKEN_REUSED` | Refresh token reutilizado; família revogada |
| `AUTH_TENANT_REQUIRED` | Tenant ainda não selecionado |
| `AUTH_TENANT_ACCESS_DENIED` | Usuário sem acesso ao workspace |
| `AUTH_ROLE_CHANGED` | Papel mudou e o token precisa ser renovado |
| `PERMISSION_DENIED` | Papel sem permissão |
| `VALIDATION_ERROR` | Payload inválido |
| `RESOURCE_CONFLICT` | Violação de unicidade |
| `RESOURCE_IN_USE` | Registro vinculado a outro recurso |
| `PROJECT_INVALID_STATUS_TRANSITION` | Transição de projeto não permitida |

## Isolamento multiempresa

A API abre transações com `app.current_tenant_id` definido no PostgreSQL. As tabelas tenant-scoped usam RLS habilitado e forçado. A aplicação não depende apenas de cláusulas `WHERE tenant_id = ...` no código.

## Teste rápido

```bash
curl -i http://localhost:8080/health/ready
pnpm smoke
```

Para investigar uma falha, use o correlation ID retornado no envelope e procure nos logs da API.
