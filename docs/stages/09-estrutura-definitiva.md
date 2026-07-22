# Etapa 9 — Estrutura definitiva

> Atualizado em **22 de julho de 2026**.

## Resultado

Foi consolidado um monorepo pnpm/Turborepo com separação entre aplicação web, API, worker, contratos e testes E2E.

```text
implantahub/
├── apps/
│   ├── api/
│   │   ├── migrations/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── domain/
│   │   │   ├── lib/
│   │   │   ├── modules/
│   │   │   ├── plugins/
│   │   │   └── scripts/
│   │   └── tests/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   ├── worker/
│   │   └── src/
│   └── e2e/
│       └── tests/
├── packages/
│   └── contracts/
├── infrastructure/
│   ├── postgres/
│   ├── nginx/
│   ├── prometheus/
│   ├── grafana/
│   ├── loki/
│   └── promtail/
├── scripts/
├── docs/
├── docker-compose.yml
├── docker-compose.prod.yml
├── pnpm-workspace.yaml
└── turbo.json
```

## Princípios

- Monólito modular na API.
- Tabelas concretas por recurso.
- Catálogo tipado apenas para eliminar repetição de CRUD.
- Rotas dedicadas para fluxos complexos.
- Same-origin entre frontend e API.
- Worker separado para tarefas demoradas.
- Contratos compartilhados sem acoplar UI ao banco.
- Infraestrutura local reproduzível por Docker Compose.

## Fronteiras de domínio

- Identidade e tenancy.
- Clientes.
- Projetos e planejamento.
- Execução e colaboração.
- Entrega técnica.
- Qualidade.
- Piloto.
- Governança.
- Conteúdo.
- Comunicação.
- Relatórios.
- Integrações.
- Portal.
- Auditoria.

## Decisão de gateway

A estrutura definitiva mantém a API em `api:3333` dentro do Docker, mas o navegador nunca usa esse hostname. Next.js e Nginx expõem `/api/v1` no mesmo domínio da interface.

## Critério de conclusão

- estrutura criada;
- workspaces configurados;
- Dockerfiles por aplicação;
- módulos da API registrados;
- rotas do frontend organizadas;
- infraestrutura separada;
- documentação conectada ao repositório.
