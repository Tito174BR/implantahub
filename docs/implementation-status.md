# Estado de implementação

> Atualizado em **22 de julho de 2026**.

Esta matriz descreve o que existe no código-fonte e o que ainda depende de infraestrutura externa ou validação de runtime.

## Resumo

| Item | Estado |
|---|---|
| Monorepo pnpm/Turborepo | Implementado |
| Frontend Next.js SaaS | Implementado |
| API Fastify modular | Implementado |
| Worker BullMQ/RabbitMQ | Implementado |
| PostgreSQL com RLS | Implementado |
| Docker Compose local | Implementado |
| CI GitHub Actions | Implementado |
| Smoke test | Implementado |
| Testes Vitest/Playwright | Implementados no repositório |
| Build/testes completos neste ambiente de geração | Não executados; dependem da máquina de destino |
| Oracle com consulta de negócio | Pendente de driver, credenciais e contrato externo |
| Scanner antimalware | Pendente de integração externa |
| SMTP corporativo | Pendente de credenciais reais |
| Produção com TLS/backup/HA | Pendente de infraestrutura de publicação |

## Domínios

| Domínio | Banco/API | Frontend | Processamento especial |
|---|---:|---:|---|
| Autenticação e sessão | Sim | Sim | Refresh rotativo e detecção de reutilização |
| Tenants e memberships | Sim | Sim | Seleção/restauração de workspace |
| Administração de membros | Sim | Sim | Alteração de papel invalida token antigo |
| Convites | Sim | Sim | Token hasheado e e-mail |
| Clientes | Sim | Sim | Busca e detalhe |
| Contatos e unidades | Sim | Sim | CRUD pelo catálogo |
| Projetos | Sim | Sim | Transições de estado |
| Templates e versões | Sim | Sim | Versões imutáveis conforme definição |
| Equipe, fases e marcos | Sim | Sim | CRUD por projeto |
| Tarefas | Sim | Sim | Status dedicado e E2E |
| Checklists e comentários | Sim | Sim | Recursos operacionais |
| Ambientes/componentes/versões/deployments | Sim | Sim | Recursos operacionais |
| Qualidade | Sim | Sim | Planos, casos, execuções e defeitos |
| Piloto | Sim | Sim | Pilotos, métricas e incidentes |
| Governança | Sim | Sim | Riscos, bloqueios, mudanças e aprovações |
| Documentos | Sim | Sim | MinIO, versão PENDING/AVAILABLE |
| Notificações | Sim | Sim | In-app e SMTP pelo worker |
| Relatórios | Sim | Sim | CSV/XLSX/PDF assíncronos |
| Integrações | Sim | Sim | HTTP/TCP/SFTP/Oracle TCP |
| Webhooks | Sim | Sim | HMAC, retry e DLQ |
| Outbox/Inbox | Sim | Administração técnica | Idempotência e publicação |
| Portal do cliente | Sim | Sim | Isolamento de endpoints internos |
| Auditoria | Sim | Sim | Correlation ID |
| Observabilidade | Sim | Grafana externo | Prometheus/Loki/Promtail |

## Recursos do catálogo

Há 34 definições operacionais ligadas a tabelas concretas:

- Clientes: `contacts`, `units`.
- Planejamento: `project-templates`, `template-versions`, `project-members`, `phases`, `milestones`.
- Execução: `checklists`, `checklist-items`, `comments`.
- Entrega: `environments`, `components`, `versions`, `deployments`.
- Qualidade: `test-plans`, `test-cases`, `test-runs`, `defects`.
- Piloto: `pilots`, `pilot-metrics`, `pilot-incidents`.
- Governança: `risks`, `blockers`, `change-requests`, `approvals`.
- Conteúdo/portal: `documents`, `document-versions`, `portal-access`.
- Comunicação: `notifications`.
- Integrações: `webhook-endpoints`, `webhook-deliveries`, `integration-connections`, `integration-jobs`.
- Relatórios: `report-jobs`.

## Correção de rede e sessão

Estado: **implementado no código**.

- `NEXT_PUBLIC_API_URL=/api/v1`.
- Rewrites do Next.js para `API_INTERNAL_URL`.
- Proxy do Nginx para `/api/` e `/health/`.
- Cliente HTTP único em `apps/web/lib/api.ts`.
- Timeout e mensagens de rede.
- Refresh deduplicado.
- Restauração de sessão antes do redirect.
- Upload/download de documento pelo gateway.
- Teste E2E sem `Failed to fetch` em tarefas, clientes, projetos e dashboard.

A confirmação de funcionamento no computador do usuário deve ser feita com:

```bash
docker compose up -d --build
pnpm smoke
pnpm test:e2e
```

## O que não deve ser interpretado como concluído sem homologação

- certificação de segurança;
- desempenho sob carga real;
- recuperação de desastre;
- integração Oracle de negócio;
- entrega real de e-mails fora do Mailpit;
- scanner de malware;
- alta disponibilidade;
- aderência legal específica da organização.

O código está preparado para esses pontos, mas eles exigem ambiente e contratos externos.
