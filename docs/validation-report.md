# Relatório de validação

> Atualizado em **22 de julho de 2026**.

Este relatório descreve verificações feitas sobre o snapshot atual do repositório e separa validação estrutural de validação de runtime.

## Inventário do snapshot

| Item | Quantidade |
|---|---:|
| Arquivos no repositório | 138 |
| Arquivos Markdown | 16 |
| Arquivos TypeScript/TSX | 84 |
| Arquivos JSON | 15 |
| Arquivos YAML | 8 |
| Migrations SQL da aplicação | 2 |
| Tabelas `app.*` | 48 |
| Recursos do catálogo | 34 |
| Testes unitários/estruturais | 4 arquivos |
| Testes E2E | 2 arquivos |

Existe ainda `infrastructure/postgres/00-roles.sql`, responsável pelos papéis iniciais do banco.

## Validações estruturais registradas

- JSON e YAML parseáveis.
- Imports relativos locais resolvidos.
- Catálogo com chaves, paths e tabelas únicas.
- Tabelas do catálogo presentes na migration completa.
- Presença de `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- 34 recursos ligados a tabelas concretas.
- Rotas especiais separadas das rotas geradas.
- Ausência de `node_modules`, `.next`, `dist` e coverage no pacote-fonte.
- Dependência `fastify-plugin` declarada na API.
- Healthcheck da API usando `127.0.0.1`.

## Validação da correção `Failed to fetch`

Confirmado no código:

- `apps/web/lib/api.ts` usa `/api/v1` same-origin;
- URL absoluta de `NEXT_PUBLIC_API_URL` é ignorada;
- `apps/web/next.config.ts` encaminha `/api` e `/health`;
- Nginx encaminha `/api`, `/health`, `/docs` e `/openapi.json`;
- refresh automático usa cookie e `credentials: include`;
- refresh concorrente é deduplicado;
- sessão e tenant são restaurados;
- documentos e relatórios usam o cliente autenticado;
- tarefas não usam gerente/analista fixos;
- teste Playwright verifica ausência de `Failed to fetch` e criação de tarefa.

## Testes disponíveis

### Vitest

- transições de projeto;
- matriz de risco;
- consistência do catálogo;
- cobertura de migration/RLS.

### Playwright

- login e dashboard;
- portal do cliente;
- tarefas e criação real;
- restauração de sessão;
- recursos do catálogo;
- documentos;
- relatórios;
- isolamento do cliente;
- convites e mudança de papel.

### Smoke

`scripts/smoke-test.mjs` valida a stack pela rota pública e cobre os principais módulos.

## Verificações que devem rodar na máquina de destino

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm test:e2e
```

Também valide:

```bash
curl -i http://localhost:8080/health/ready
curl -I http://localhost:8080/login
```

## Critério de sucesso do smoke test

Saída final:

```text
ImplantaHub validado com sucesso em http://localhost:8080.
```

## Verificações externas não cobertas localmente

- consulta Oracle de negócio;
- SMTP corporativo;
- webhooks de terceiros;
- scanner antimalware;
- TLS e domínio público;
- backup/restauração do ambiente real;
- carga, stress e recuperação;
- pentest e certificação de segurança;
- alta disponibilidade.

## Interpretação correta

O repositório contém a implementação e os testes necessários para validar a plataforma. A afirmação de que a instalação está **100% funcional no ambiente específico** só pode ser feita depois que os comandos de runtime acima passarem nesse ambiente, pois Docker, portas, volumes, arquitetura da máquina e integrações externas influenciam o resultado.
