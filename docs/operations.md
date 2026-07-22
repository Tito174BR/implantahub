# Operação local e troubleshooting

> Atualizado em **22 de julho de 2026**.

## Subir a stack

```bash
cd ~/implantahub
cp .env.example .env   # apenas na primeira execução
docker compose up -d --build
```

Acompanhe:

```bash
docker compose ps
docker compose logs -f api web worker nginx
```

## Parar

Preservando dados:

```bash
docker compose down
```

Apagando volumes locais:

```bash
docker compose down -v
```

Use `-v` somente para reset completo.

## Atualização segura

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

As migrations são incrementais. Não apague os volumes durante a atualização.

## URLs

| Serviço | Porta |
|---|---:|
| Frontend Next.js | 3000 |
| Gateway Nginx | 8080 |
| API | 3333 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ UI | 15672 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
| Prometheus | 9090 |
| Grafana | 3001 |
| Loki | 3100 |

## Healthchecks

```bash
curl -i http://localhost:3333/health/live
curl -i http://localhost:3333/health/ready
curl -i http://localhost:8080/health/ready
curl -I http://localhost:3000/login
curl -I http://localhost:8080/login
```

## Smoke test

```bash
pnpm smoke
```

Variáveis opcionais:

```bash
IMPLANTAHUB_URL=http://localhost:3000 \
IMPLANTAHUB_EMAIL=admin@implantahub.local \
IMPLANTAHUB_PASSWORD=Admin@123456 \
pnpm smoke
```

## Logs

```bash
docker compose logs --tail=300 api
docker compose logs --tail=300 web
docker compose logs --tail=300 worker
docker compose logs --tail=300 nginx
docker compose logs -f api worker
```

## Rebuild seletivo

```bash
docker compose build --no-cache api
docker compose up -d api
```

```bash
docker compose build --no-cache web
docker compose up -d web nginx
```

## Problemas comuns

### `Cannot find package 'fastify-plugin'`

A dependência deve existir em `apps/api/package.json`. Na versão atual ela já está declarada.

```bash
pnpm install
docker compose build --no-cache api
docker compose up -d api
```

### API inicia, mas fica `unhealthy`

```bash
docker compose logs --tail=300 api
docker inspect implantahub-api-1 \
  --format '{{range .State.Health.Log}}{{println .Output}}{{end}}'
```

O healthcheck deve usar:

```text
http://127.0.0.1:3333/health/ready
```

### `Failed to fetch`

```bash
docker compose ps
docker compose logs --tail=200 api web nginx
curl -i http://localhost:8080/health/ready
curl -i http://localhost:8080/api/v1/auth/refresh
```

Confirme:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_INTERNAL_URL=http://api:3333
```

Depois reconstrua o frontend:

```bash
docker compose build --no-cache web
docker compose up -d web nginx
```

### Frontend em `Created`, mas não iniciou

O serviço `web` depende da API saudável. Corrija a API primeiro e rode:

```bash
docker compose up -d web nginx worker
```

### Porta ocupada no macOS

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
lsof -nP -iTCP:3333 -sTCP:LISTEN
```

### Promtail no Docker Desktop

O mount de `/var/lib/docker/containers` pode não existir no macOS. Isso afeta coleta de logs, não a aplicação principal. É possível subir sem Promtail:

```bash
docker compose up -d postgres redis rabbitmq minio mailpit api worker web nginx prometheus loki grafana
```

### Banco local inconsistente

Reset completo, apagando dados:

```bash
docker compose down -v
docker compose up -d --build
```

### Migration falhou

```bash
docker compose logs --tail=300 postgres api
docker compose run --rm api pnpm db:migrate
```

Não execute migrations simultaneamente em múltiplas réplicas em produção.

## Backup local

### PostgreSQL

```bash
docker compose exec -T postgres \
  pg_dump -U postgres -d implantahub -Fc > implantahub.dump
```

### Restaurar PostgreSQL

Use em uma base vazia:

```bash
docker compose exec -T postgres \
  pg_restore -U postgres -d implantahub --clean --if-exists < implantahub.dump
```

### MinIO e relatórios

Os volumes são `minio_data` e `report_data`. Em produção, use backup externo e política de retenção; copiar volume em uso sem consistência não substitui um procedimento de backup.

## Produção

O arquivo `docker-compose.prod.yml` troca os targets de desenvolvimento pelos builds finais. Antes de usar:

- remova portas internas desnecessárias;
- configure TLS no gateway;
- use registry privado e imagens imutáveis;
- use cofre de segredos;
- separe migrations do startup;
- configure banco e storage gerenciados ou com HA;
- habilite backup e alertas.
