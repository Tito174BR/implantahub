# Arquitetura do ImplantaHub

> Atualizado em **22 de julho de 2026**.

## Objetivos arquiteturais

- Isolamento multiempresa aplicado no banco.
- Fluxos operacionais centralizados em uma única plataforma.
- Frontend sem dependência de hostname interno ou porta fixa da API.
- Processamento assíncrono para operações demoradas.
- Auditabilidade de mutações e integrações.
- Evolução modular sem fragmentar prematuramente em microserviços.

## Visão de contexto

```text
Usuário interno ─┐
Cliente externo ─┼── Navegador ── Next.js/Nginx ── Fastify API
Administrador ───┘                                  │
                                                    ├── PostgreSQL
                                                    ├── Redis/BullMQ
                                                    ├── RabbitMQ
                                                    ├── MinIO
                                                    └── SMTP
```

## Monorepo

```text
apps/
  api/       Fastify, autenticação, regras, migrations e endpoints
  web/       Next.js, shell SaaS, páginas e cliente HTTP
  worker/    filas, relatórios, notificações, webhooks e integrações
  e2e/       testes Playwright de UI e API
packages/
  contracts/ contratos compartilhados em Zod
infrastructure/
  postgres/  papéis iniciais
  nginx/     gateway e proxy reverso
  prometheus/
  grafana/
  loki/
  promtail/
docs/        arquitetura, operação, segurança e etapas
scripts/     smoke test da stack
```

## Estilo da aplicação

A API é um **monólito modular**. Isso mantém transações, regras e consistência centralizadas enquanto o produto ainda evolui. Os domínios possuem módulos próprios; recursos repetitivos usam um catálogo tipado para gerar CRUD sem armazenar tudo em uma tabela genérica.

Os 34 recursos do catálogo apontam para tabelas concretas. Fluxos com regras especiais — autenticação, projetos, tarefas, documentos, relatórios, portal, administração e integrações — possuem rotas dedicadas.

## Caminho das requisições

### Porta 3000

```text
Browser → Next.js :3000 → rewrite /api/* → api:3333
```

### Porta 8080

```text
Browser → Nginx :8080
               ├── /        → web:3000
               ├── /api/*   → api:3333
               ├── /health/*→ api:3333
               ├── /docs    → api:3333
               └── /openapi.json → api:3333
```

O frontend define `NEXT_PUBLIC_API_URL=/api/v1`. O cliente ignora configurações absolutas e usa same-origin, eliminando problemas de CORS, `localhost`, IP de rede e acesso por domínio.

## Sessão

```text
Login
  ├── access token JWT de 15 minutos
  └── refresh token opaco em cookie HttpOnly de 30 dias

Seleção do tenant
  └── novo JWT com tenantId e role

Refresh
  ├── token anterior marcado como usado
  ├── novo token emitido na mesma família
  └── reutilização revoga família e sessão
```

O frontend mantém access token, usuário e tenant no `sessionStorage`. Ao recarregar a página, tenta renovar pelo cookie antes de redirecionar ao login. Requisições concorrentes compartilham uma única renovação.

## Multi-tenancy

- Usuários são globais.
- A associação com empresas ocorre por memberships.
- O JWT contém `tenantId` e `role` do workspace ativo.
- A API revalida sessão, membership e papel no banco.
- O PostgreSQL recebe `app.current_tenant_id` por transação.
- RLS está habilitado e forçado nas tabelas multiempresa.
- Usuários `CUSTOMER` são bloqueados nos endpoints internos e usam apenas o portal.

## Persistência

- PostgreSQL é a fonte oficial.
- Migrations SQL criam 48 tabelas no schema `app`.
- O papel de migration é separado do papel da aplicação.
- Entidades principais utilizam UUID.
- Agregados relevantes possuem versionamento/lock otimista onde definido.
- Auditoria e Outbox são gravados junto às mutações.

## Processamento assíncrono

### BullMQ/Redis

Usado para:

- notificações;
- relatórios;
- jobs de integração;
- processamento de entregas que exigem retry.

Jobs possuem tentativas, backoff exponencial e retenção limitada de resultados.

### RabbitMQ

Eventos persistidos no Outbox são publicados para o exchange de eventos. A persistência antes da publicação reduz perda de eventos entre banco e broker.

### Webhooks

- payload assinado com HMAC-SHA256;
- tentativas registradas;
- backoff exponencial;
- resposta HTTP persistida;
- estado final de falha;
- reprocessamento manual;
- encaminhamento para dead-letter quando esgotado.

## Documentos

```text
Documento → versão PENDING → upload autenticado → MinIO
                                      │
                                      └── confirmação de tamanho/objeto
                                               │
                                               ▼
                                          AVAILABLE
```

Uploads e downloads passam pela API. O navegador não acessa o MinIO diretamente no fluxo padrão, evitando vazamento de endpoint interno e simplificando autorização.

## Relatórios

1. A API cria `reporting_jobs` com status inicial.
2. O worker consulta dados no tenant correto.
3. Gera CSV, XLSX ou PDF no volume compartilhado.
4. Atualiza status e caminho do arquivo.
5. Envia notificação.
6. A API autoriza o download ao solicitante.

## Observabilidade

- Logs JSON do Fastify e worker.
- Correlation ID por requisição.
- Redação de autorização, cookies, tokens, senhas e segredos.
- Métricas Prometheus.
- Dashboards Grafana.
- Logs agregados por Loki/Promtail.
- Liveness e readiness separados.

## Decisões e trade-offs

### Monólito modular

Escolhido para reduzir complexidade operacional e manter transações locais. Os módulos podem ser extraídos quando carga, equipe ou domínio justificarem.

### Catálogo de recursos

Reduz duplicação de CRUD sem sacrificar tabelas concretas. Regras especiais permanecem em módulos dedicados.

### Same-origin

Evita que o frontend conheça a URL interna da API. Também facilita cookies, CORS, domínio e proxy reverso.

### MinIO atrás da API

Traz autorização consistente e simplifica o ambiente local, com custo de tráfego passando pela API.

## Limites atuais

- Paginação por cursor está modelada no envelope, mas ainda não percorre múltiplas páginas.
- O teste Oracle atual valida conectividade TCP; consultas específicas exigem driver e contrato do sistema externo.
- Scanner antimalware de documentos precisa ser conectado antes de produção.
- Alta disponibilidade, autoscaling e orquestração em cluster não fazem parte do Compose local.
