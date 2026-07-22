# Etapa 10 — Implementação

> Atualizado em **22 de julho de 2026**.

## Backend

A API Fastify implementa:

- autenticação e sessão rotativa;
- tenant ativo e papéis;
- clientes, projetos e tarefas com rotas dedicadas;
- 34 recursos operacionais pelo catálogo;
- documentos e versões no MinIO;
- relatórios assíncronos;
- notificações;
- integrações e webhooks;
- portal do cliente;
- dashboard e auditoria;
- Swagger/OpenAPI;
- métricas e healthchecks.

## Banco

As migrations criam 48 tabelas no schema `app`, incluindo:

- identidade, sessões, tokens e memberships;
- clientes e projetos;
- planejamento, execução, entrega, qualidade e piloto;
- governança;
- documentos e portal;
- notificações e relatórios;
- integrações, Outbox, Inbox e dead-letter;
- auditoria.

RLS é aplicado às tabelas multiempresa.

## Frontend

O frontend Next.js implementa:

- login, ativação de convite e restauração de sessão;
- shell SaaS responsivo;
- dashboard;
- clientes, projetos e tarefas;
- páginas operacionais dos módulos;
- documentos e relatórios;
- integrações e administração;
- auditoria e configurações;
- portal do cliente.

## Correção de comunicação

A implementação atual usa `/api/v1` same-origin. O cliente HTTP centralizado trata token, refresh, timeout, downloads e erros. Isso corrige o `Failed to fetch` causado por URL absoluta e restauração incorreta da sessão.

## Worker

O worker processa:

- notificações in-app/e-mail;
- relatórios CSV, XLSX e PDF;
- jobs de integração;
- Outbox para RabbitMQ;
- entregas de webhook;
- retries e dead-letter.

## Segurança implementada

- Argon2id;
- refresh token hasheado e rotativo;
- AES-256-GCM para configurações sensíveis;
- RLS;
- guards de papel;
- bloqueio explícito de `CUSTOMER` em módulos internos;
- logs com redação de segredos;
- auditoria e correlation ID.

## Dependências externas

A implementação de infraestrutura específica continua dependente de:

- credenciais SMTP reais;
- driver e contrato Oracle;
- endpoints de webhook;
- scanner antimalware;
- domínio/TLS e ambiente de produção.
