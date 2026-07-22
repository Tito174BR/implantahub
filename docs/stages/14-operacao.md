# Etapa 14 — Operação, segurança e observabilidade

> Atualizado em **22 de julho de 2026**.

## Operação

- Healthchecks de banco, cache, broker, API, frontend e gateway.
- Logs por serviço via Docker Compose.
- Smoke test pela porta `8080` ou `3000`.
- Migrations e seed no perfil local.
- Overlay de produção sem seed.
- Procedimento de atualização preservando volumes.

## Observabilidade

- Métricas Prometheus expostas pela API.
- Prometheus para coleta.
- Grafana provisionado com fontes.
- Loki para armazenamento de logs.
- Promtail para coleta local.
- Correlation ID em requisições e erros.
- Logs JSON e redação de campos sensíveis.

## Confiabilidade

- Outbox para eventos.
- Inbox idempotente.
- BullMQ com tentativas e backoff.
- Webhooks com HMAC, retry e DLQ.
- Notificações idempotentes por dedupe key.
- Relatórios assíncronos.
- Refresh token rotativo com detecção de reutilização.

## Segurança

- Argon2id.
- RLS habilitado e forçado.
- Segredos cifrados com AES-256-GCM.
- Guards de papel.
- Portal isolado.
- Cookies HttpOnly.
- Rate limiting.
- Cabeçalhos de segurança no Nginx.

## Requisitos externos para produção

- TLS e DNS.
- Cofre de segredos.
- Backup/restauração testados.
- SMTP real.
- Scanner antimalware.
- Driver e consultas Oracle.
- Alertas do provedor.
- SLOs e runbooks.
- Testes de carga e segurança.
- Política de retenção de logs e auditoria.

Consulte [`../operations.md`](../operations.md) e [`../security.md`](../security.md).
