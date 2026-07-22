# Etapa 11 — Testes

> Atualizado em **22 de julho de 2026**.

## Testes unitários e estruturais

Local: `apps/api/tests`.

- `project-status.spec.ts`: transições válidas, inválidas e forçadas.
- `risk.spec.ts`: matriz de risco e limites.
- `platform-catalog.spec.ts`: unicidade, campos sensíveis e recursos por projeto.
- `migration-coverage.spec.ts`: tabelas do catálogo e presença de RLS.

## Testes E2E

Local: `apps/e2e/tests`.

### Interface

- login administrativo;
- dashboard;
- login de cliente e portal;
- abertura de tarefas sem `Failed to fetch`;
- criação de tarefa com projeto e usuário reais;
- limpeza do `sessionStorage` e restauração pelo cookie;
- navegação por clientes, projetos e dashboard após refresh.

### API

- autenticação e seleção de tenant;
- catálogo e criação de risco;
- upload/download de documento pelo gateway;
- relatório assíncrono;
- isolamento de usuário `CUSTOMER`;
- convite, ativação e alteração de papel;
- invalidação de token com papel antigo.

## Smoke test

`scripts/smoke-test.mjs` valida a stack já iniciada:

```bash
pnpm smoke
```

Cobertura:

- gateway e readiness;
- login;
- workspaces;
- seleção de tenant;
- refresh rotativo;
- dashboard;
- clientes;
- projetos;
- tarefas;
- diretório;
- catálogo;
- auditoria;
- notificações;
- documentos;
- relatórios;
- detalhes e filtros;
- mutação idempotente de tarefa.

## Comandos

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm smoke
```

## Pré-condições para E2E

```bash
docker compose up -d --build postgres redis rabbitmq minio mailpit api worker web
pnpm --filter @implantahub/e2e exec playwright install chromium
pnpm test:e2e
```

## Limites

Os testes presentes no repositório não substituem:

- carga e stress;
- caos e recuperação;
- DAST e pentest;
- validação Oracle real;
- SMTP corporativo;
- scanner antimalware;
- testes de navegador/dispositivo ampliados.
