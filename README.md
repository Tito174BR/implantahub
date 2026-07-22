# ImplantaHub

> Atualizado em **22 de julho de 2026**.

O ImplantaHub é uma plataforma SaaS multiempresa para planejar, executar, homologar e acompanhar projetos de implantação corporativa do início ao go-live.

Este repositório contém frontend, API, banco com isolamento por tenant, workers assíncronos, armazenamento de documentos, relatórios, integrações, portal do cliente, auditoria, observabilidade, Docker e CI/CD.

## Estado atual da entrega

A base implementa os módulos descritos neste documento e inclui a correção estrutural do erro **`Failed to fetch`**:

- o navegador usa somente rotas **same-origin** em `/api/v1`;
- o Next.js e o Nginx encaminham as requisições ao serviço `api`;
- não há dependência de `http://localhost:3333` no código executado pelo navegador;
- o access token é renovado pelo cookie HttpOnly;
- a sessão e o workspace são restaurados ao recarregar a página;
- tarefas, clientes, projetos, documentos e relatórios usam o mesmo cliente HTTP centralizado.

A validação definitiva do runtime deve ser feita com `docker compose up -d --build` e `pnpm smoke` na máquina de destino. O relatório completo está em [`docs/validation-report.md`](docs/validation-report.md).

## Módulos

| Domínio | Capacidades |
|---|---|
| Identidade e acesso | Login, refresh token rotativo, seleção de workspace, perfil, troca de senha, logout, membros, papéis e convites |
| Clientes | Clientes, contatos e unidades |
| Planejamento | Templates versionados, equipe, fases e marcos |
| Execução | Tarefas, checklists, itens, respostas, evidências e comentários |
| Entrega técnica | Ambientes, componentes, versões e deployments |
| Qualidade | Planos, casos, execuções de teste e defeitos |
| Piloto | Pilotos, métricas e incidentes |
| Governança | Riscos, impedimentos, mudanças e aprovações |
| Conteúdo | Documentos versionados, upload e download autenticados, MinIO |
| Comunicação | Notificações in-app e e-mail |
| Relatórios | Jobs assíncronos e exportação CSV, XLSX e PDF |
| Integrações | HTTP, TCP, SFTP, teste de conectividade Oracle, Outbox, Inbox, webhooks e DLQ |
| Portal do cliente | Projetos, fases, marcos e documentos liberados |
| Auditoria | Ator, tenant, entidade, ação e correlation ID |

## Arquitetura resumida

```text
Navegador
   │
   ├── http://localhost:3000 ── Next.js ───────┐
   │                                           │
   └── http://localhost:8080 ── Nginx ─────────┤
                                               ▼
                                      Fastify API :3333
                                      │      │      │
                                      │      │      ├── MinIO
                                      │      ├──────── Redis / BullMQ
                                      └─────────────── PostgreSQL + RLS
                                                      │
Worker ────────────────────────────────────────────────┤
  ├── notificações e SMTP                             │
  ├── relatórios CSV/XLSX/PDF                         │
  ├── jobs de integração                              │
  └── Outbox / webhooks ───── RabbitMQ / DLQ ─────────┘
```

O frontend sempre chama `/api/v1`. No acesso pela porta `3000`, o rewrite do Next.js encaminha para `API_INTERNAL_URL`. No acesso pela porta `8080`, o Nginx encaminha `/api/` diretamente para a API.

## Stack

- **Runtime:** Node.js 24 e pnpm 10.13.1.
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query e React Hook Form.
- **API:** Fastify 5, TypeScript, Zod, JWT, Argon2id e Drizzle ORM.
- **Dados:** PostgreSQL 17, migrations SQL e Row-Level Security.
- **Assíncrono:** Redis 8, BullMQ e RabbitMQ 4.
- **Arquivos:** MinIO.
- **Relatórios:** CSV, ExcelJS e PDFKit.
- **Observabilidade:** Prometheus, Grafana, Loki e Promtail.
- **Testes:** Vitest e Playwright.
- **Entrega:** Docker Compose, Nginx e GitHub Actions.

## Executar com Docker

### Requisitos

- Docker Desktop ou Docker Engine com Compose.
- Aproximadamente 6 GB de memória disponível para a stack completa.
- Portas livres: `3000`, `3001`, `3100`, `3333`, `5432`, `5672`, `6379`, `8025`, `8080`, `9000`, `9001`, `9090` e `15672`.

### Primeira execução

```bash
cd implantahub
cp .env.example .env
docker compose up -d --build
```

A API executa migrations e seed antes de iniciar. Acompanhe:

```bash
docker compose ps
docker compose logs -f api web worker nginx
```

O estado esperado dos serviços principais é:

```text
postgres   healthy
redis      healthy
rabbitmq   healthy
api        healthy
web        healthy
nginx      healthy
worker     running
```

### Atualizar uma instalação existente

Preservando o `.env` e os volumes:

```bash
cd ~/implantahub
docker compose down
cp .env /tmp/implantahub.env
cd ~
mv implantahub "implantahub-backup-$(date +%Y%m%d-%H%M%S)"
unzip ~/Downloads/implantahub-full.zip -d ~
cp /tmp/implantahub.env ~/implantahub/.env
cd ~/implantahub
docker compose build --no-cache
docker compose up -d
```

Não use `docker compose down -v` durante uma atualização, pois `-v` apaga banco, filas, relatórios e arquivos locais.

## Acessos locais

| Serviço | Endereço |
|---|---|
| Aplicação direta | http://localhost:3000 |
| Aplicação pelo gateway | http://localhost:8080 |
| API direta | http://localhost:3333 |
| Swagger | http://localhost:3333/docs |
| OpenAPI | http://localhost:3333/openapi.json |
| Mailpit | http://localhost:8025 |
| MinIO Console | http://localhost:9001 |
| RabbitMQ | http://localhost:15672 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki | http://localhost:3100 |

## Credenciais do seed local

Todos usam a senha `Admin@123456`:

| Perfil | E-mail | Destino após login |
|---|---|---|
| Administrador | `admin@implantahub.local` | Dashboard administrativo |
| Gestor | `gestor@implantahub.local` | Dashboard administrativo |
| Analista | `analista@implantahub.local` | Dashboard administrativo |
| Cliente | `cliente@implantahub.local` | Portal do cliente |

Serviços auxiliares:

| Serviço | Usuário | Senha |
|---|---|---|
| RabbitMQ | `implantahub` | `implantahub` |
| MinIO | `implantahub` | `implantahub-secret` |
| Grafana | `admin` | `admin` |

Essas credenciais são exclusivamente locais. Troque segredos, senhas e chaves antes de publicar.

## Rotas do frontend

```text
/login
/accept-invitation
/dashboard
/customers
/projects
/projects/[projectId]
/tasks
/planning
/execution
/delivery
/quality
/pilot
/governance
/content
/communication
/reports
/integrations
/administration
/audit
/settings
/modules
/help
/portal
/portal/[projectId]
```

## Validar a plataforma

### Smoke test

Depois que os containers estiverem saudáveis:

```bash
pnpm smoke
```

O teste usa `http://localhost:8080` e valida:

- healthcheck do gateway e da API;
- login e seleção de workspace;
- rotação do refresh token;
- restauração de usuário e tenant;
- dashboard, clientes, projetos e tarefas;
- diretório, catálogo, auditoria e notificações;
- documentos e relatórios;
- detalhe e filtragem por projeto;
- alteração idempotente de tarefa.

Para testar pelo Next.js diretamente:

```bash
IMPLANTAHUB_URL=http://localhost:3000 pnpm smoke
```

### Testes automatizados

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Desenvolvimento sem Docker para o código

O gerenciador correto é **pnpm**, não Yarn:

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install
```

Suba apenas os serviços de infraestrutura:

```bash
docker compose up -d postgres redis rabbitmq minio mailpit
```

Ao executar API e worker no host, altere no `.env` os hosts internos `postgres`, `redis`, `rabbitmq`, `minio` e `api` para `localhost` quando aplicável.

```bash
pnpm --filter @implantahub/api db:migrate
pnpm --filter @implantahub/api db:seed
pnpm dev
```

## Diagnóstico rápido

### `Failed to fetch`

```bash
docker compose ps
docker compose logs --tail=200 api web nginx
curl -i http://localhost:8080/health/ready
curl -i http://localhost:8080/api/v1/auth/refresh
```

O frontend deve usar `NEXT_PUBLIC_API_URL=/api/v1`. Não configure uma URL absoluta para o navegador.

### API `unhealthy`

```bash
docker compose logs --tail=300 api
docker inspect implantahub-api-1 --format '{{range .State.Health.Log}}{{println .Output}}{{end}}'
```

O healthcheck correto usa `http://127.0.0.1:3333/health/ready`.

### Frontend não abre

```bash
docker compose ps web nginx
docker compose logs --tail=200 web nginx
curl -I http://localhost:3000/login
curl -I http://localhost:8080/login
```

Mais detalhes em [`docs/operations.md`](docs/operations.md) e [`docs/network-and-session-fix.md`](docs/network-and-session-fix.md).

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — arquitetura e decisões.
- [`docs/api.md`](docs/api.md) — convenções e endpoints.
- [`docs/frontend-redesign.md`](docs/frontend-redesign.md) — frontend SaaS.
- [`docs/implementation-status.md`](docs/implementation-status.md) — matriz de implementação.
- [`docs/network-and-session-fix.md`](docs/network-and-session-fix.md) — correção de rede e sessão.
- [`docs/operations.md`](docs/operations.md) — execução, atualização e troubleshooting.
- [`docs/security.md`](docs/security.md) — controles e requisitos de produção.
- [`docs/validation-report.md`](docs/validation-report.md) — validações executadas e pendentes.
- [`docs/stages/`](docs/stages/) — Etapas 9 a 15.

## Publicação em produção

Antes do go-live:

1. troque todas as credenciais e chaves;
2. habilite TLS e domínio oficial;
3. configure cookies seguros e `WEB_ORIGIN` real;
4. execute migrations em job único;
5. configure backups e teste restauração;
6. conecte SMTP transacional;
7. conecte scanner antimalware para documentos;
8. configure driver e consultas Oracle específicas;
9. execute testes de carga, segurança, recuperação e isolamento multiempresa;
10. configure alertas operacionais.
