# Etapa 15 — Entrega

> Atualizado em **22 de julho de 2026**.

## Conteúdo entregue

- monorepo pnpm/Turborepo;
- frontend Next.js SaaS;
- API Fastify modular;
- worker assíncrono;
- 48 tabelas em migrations;
- 34 recursos operacionais no catálogo;
- autenticação, tenants, papéis, sessões e convites;
- clientes, projetos, tarefas e módulos operacionais;
- documentos e MinIO;
- relatórios CSV/XLSX/PDF;
- integrações, webhooks, Outbox, Inbox e DLQ;
- portal do cliente;
- auditoria e observabilidade;
- Docker Compose de desenvolvimento e overlay de produção;
- GitHub Actions;
- Vitest, Playwright e smoke test;
- documentação atualizada.

## Correção consolidada de rede

A entrega atual inclui:

- `/api/v1` same-origin;
- proxy pelo Next.js e Nginx;
- refresh automático e deduplicado;
- restauração de sessão e tenant;
- upload/download autenticado;
- teste E2E contra `Failed to fetch`.

## Instalação

```bash
cp .env.example .env
docker compose up -d --build
pnpm smoke
```

## Credenciais locais

```text
admin@implantahub.local
Admin@123456
```

O seed também cria gestor, analista e cliente com a mesma senha local.

## Critério de aceite técnico

1. todos os serviços principais iniciam;
2. API, web e Nginx ficam saudáveis;
3. `pnpm smoke` conclui com sucesso;
4. `pnpm typecheck`, `pnpm test` e `pnpm build` passam;
5. Playwright passa;
6. tarefas carregam e podem ser criadas;
7. refresh restaura a sessão após recarregar;
8. cliente acessa o portal e recebe `403` nos endpoints internos;
9. upload/download e relatório assíncrono passam;
10. logs não expõem segredos.

## Limites da entrega

O código-fonte não equivale a certificação de produção. Go-live exige credenciais e infraestrutura reais, backup, TLS, scanner antimalware, validação Oracle, testes de carga/segurança e homologação organizacional.

Consulte [`../validation-report.md`](../validation-report.md) para separar o que foi validado estaticamente do que precisa ser executado no ambiente de destino.
