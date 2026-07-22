# Etapa 13 — CI/CD

> Atualizado em **22 de julho de 2026**.

Workflow: `.github/workflows/ci.yml`.

## Gatilhos

- pull requests;
- pushes para `main`.

## Job `validate`

1. checkout;
2. pnpm 10.13.1;
3. Node.js 24;
4. `pnpm install --no-frozen-lockfile`;
5. `pnpm typecheck`;
6. `pnpm test`;
7. `pnpm build`;
8. `docker compose config --quiet`;
9. `pnpm audit --audit-level high`.

## Job `docker-build`

Constrói as imagens:

- `api`;
- `worker`;
- `web`.

## Job `e2e`

- instala Chromium do Playwright;
- sobe PostgreSQL, Redis, RabbitMQ, MinIO, API, worker e web;
- aguarda `/login`;
- executa `pnpm test:e2e`;
- coleta logs em qualquer resultado;
- publica o relatório Playwright quando existir.

## O que ainda deve entrar em um pipeline de release

- versionamento semântico e changelog;
- build com tag imutável;
- publicação em registry;
- SBOM;
- assinatura de imagem;
- scan de container;
- migrations como etapa controlada;
- aprovação por ambiente;
- rollout e rollback;
- smoke test pós-deploy;
- promoção entre homologação e produção.

## Segredos do CI

Não grave credenciais reais no repositório. Use secrets protegidos e ambientes do provedor de CI. Os valores de `.env.example` são apenas para testes locais.
