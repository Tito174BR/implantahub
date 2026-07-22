# Correção de rede, proxy e sessão

> Atualizado em **22 de julho de 2026**.

## Sintoma original

Telas como tarefas exibiam:

```text
Failed to fetch
```

A causa não era a tela de tarefas isoladamente. O navegador tentava acessar a API por uma URL absoluta, normalmente `http://localhost:3333`. Isso falha quando:

- a aplicação é aberta pela porta `8080`;
- o usuário usa IP da rede ou domínio;
- `localhost` aponta para a máquina do navegador e não para o host esperado;
- CORS/cookies não correspondem à origem;
- a API está disponível apenas pela rede interna do Docker;
- o token expirou e a sessão não foi restaurada antes do redirect.

## Solução aplicada

### 1. Same-origin no navegador

`apps/web/lib/api.ts` utiliza:

```text
/api/v1
```

URLs absolutas em `NEXT_PUBLIC_API_URL` são ignoradas. Isso evita que um `.env` antigo reintroduza `localhost:3333`.

### 2. Proxy do Next.js

`apps/web/next.config.ts`:

```text
/api/:path*    → API_INTERNAL_URL/api/:path*
/health/:path* → API_INTERNAL_URL/health/:path*
```

No Docker:

```text
API_INTERNAL_URL=http://api:3333
```

### 3. Proxy do Nginx

A porta `8080` encaminha:

```text
/api/*         → api:3333
/health/*      → api:3333
/docs          → api:3333
/openapi.json  → api:3333
/              → web:3000
```

### 4. Renovação de sessão

- access token no `sessionStorage`;
- refresh token no cookie HttpOnly;
- refresh automático em `401`;
- uma única Promise compartilhada para múltiplas requisições simultâneas;
- restauração de usuário e tenant ao recarregar;
- limpeza da sessão somente quando o refresh falha.

### 5. Uploads e downloads

Documentos e relatórios também usam o cliente centralizado. O navegador não chama diretamente `localhost:9000` nem ignora o fluxo de renovação.

### 6. Healthchecks

- API: `http://127.0.0.1:3333/health/ready`.
- Web: `http://127.0.0.1:3000/login`.
- Nginx: `http://127.0.0.1/health/ready`.

O uso de `127.0.0.1` no healthcheck da API evita resolução IPv6 incompatível em algumas imagens Alpine.

## Configuração correta

`.env`:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_INTERNAL_URL=http://api:3333
WEB_ORIGIN=http://localhost:3000,http://localhost:8080
```

No `docker-compose.yml`, o frontend já recebe os dois primeiros valores.

## Rebuild obrigatório

Como variáveis `NEXT_PUBLIC_*` podem ser incorporadas ao bundle, faça rebuild completo após atualizar:

```bash
docker compose down
docker compose build --no-cache web api nginx
docker compose up -d
```

Ou reconstrua tudo:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Validação

```bash
docker compose ps
curl -i http://localhost:8080/health/ready
curl -I http://localhost:8080/login
curl -I http://localhost:3000/login
pnpm smoke
```

No DevTools do navegador, as requisições devem aparecer como:

```text
http://localhost:8080/api/v1/tasks
```

ou:

```text
http://localhost:3000/api/v1/tasks
```

Elas não devem aparecer como `http://localhost:3333/...`.

## Teste de regressão

O Playwright cobre:

- login administrativo;
- abertura de `/tasks` sem `Failed to fetch`;
- criação de tarefa usando projeto e usuário reais;
- limpeza do `sessionStorage`;
- restauração pelo cookie;
- acesso subsequente a tarefas, clientes, projetos e dashboard.

## Diagnóstico

### API saudável, mas `/api/v1` falha no 3000

```bash
docker compose logs --tail=200 web api
curl -i http://localhost:3000/api/v1/dashboard/summary
```

Sem token, a resposta esperada é `401` em JSON, não erro de conexão nem HTML do Next.js.

### Porta 8080 falha

```bash
docker compose logs --tail=200 nginx web api
curl -i http://localhost:8080/health/ready
```

### Cookie não renova

Confirme que o navegador acessa sempre pela mesma origem durante a sessão. Não alterne entre `localhost`, `127.0.0.1` e IP da rede sem fazer novo login.

### Cache antigo

```bash
docker compose down
docker compose build --no-cache web
docker compose up -d web nginx
```

Depois, limpe os dados do site no navegador e entre novamente.
