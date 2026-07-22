# Etapa 12 — Docker

> Atualizado em **22 de julho de 2026**.

## Serviços

```text
postgres
redis
rabbitmq
minio
mailpit
api
worker
web
nginx
prometheus
loki
promtail
grafana
```

## Redes

- `app`: web, gateway, API e worker.
- `data`: PostgreSQL, Redis, RabbitMQ, MinIO e Mailpit.
- `monitoring`: API, worker e observabilidade.

## Volumes

- `postgres_data`
- `redis_data`
- `rabbitmq_data`
- `minio_data`
- `prometheus_data`
- `loki_data`
- `grafana_data`
- `report_data`

## Desenvolvimento

```bash
cp .env.example .env
docker compose up -d --build
```

A API executa migrations e seed. O worker, o web e o Nginx aguardam a API saudável.

## Healthchecks

- PostgreSQL: `pg_isready`.
- Redis: `redis-cli ping`.
- RabbitMQ: diagnóstico interno.
- API: readiness em `127.0.0.1:3333`.
- Web: página `/login` em `127.0.0.1:3000`.
- Nginx: `/health/ready` pelo gateway.

## Produção local

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

O overlay usa targets finais dos Dockerfiles e não deve executar seed. Em múltiplas réplicas, migrations precisam rodar em job único antes do rollout.

## Same-origin

```env
NEXT_PUBLIC_API_URL=/api/v1
API_INTERNAL_URL=http://api:3333
```

O frontend não deve receber `http://localhost:3333` como URL pública.

## Validação

```bash
docker compose config --quiet
docker compose ps
pnpm smoke
```

## Observação para macOS

Promtail pode não conseguir montar `/var/lib/docker/containers` no Docker Desktop. A falha desse serviço não impede a plataforma principal; apenas reduz a coleta local de logs.
