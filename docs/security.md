# Segurança do ImplantaHub

> Atualizado em **22 de julho de 2026**.

## Modelo de confiança

- O navegador não acessa diretamente banco, Redis, RabbitMQ ou MinIO no fluxo padrão.
- O gateway encaminha apenas HTTP para frontend e API.
- A API valida token, sessão, tenant e papel em cada requisição protegida.
- O PostgreSQL aplica RLS nas tabelas multiempresa.
- O worker recebe tenant explícito e abre transação com contexto de tenant.

## Autenticação

- Senhas com Argon2id.
- Access token JWT de 15 minutos.
- Refresh token opaco de 30 dias.
- Refresh armazenado apenas como hash no banco.
- Cookie HttpOnly, `SameSite=Lax` e `Secure` em produção.
- Rotação a cada refresh.
- Detecção de reutilização e revogação da família.
- Sessões persistidas e revogáveis.
- Troca de senha revoga outras sessões.
- Mudança de papel ou tenant invalida o token antigo.

## Autorização

Papéis:

- `ADMIN`
- `MANAGER`
- `ANALYST`
- `CUSTOMER`

As permissões são verificadas no backend. O frontend apenas adapta a navegação. Usuários `CUSTOMER` recebem bloqueio explícito nos endpoints administrativos e operacionais internos.

## Multi-tenancy

- `tenantId` não é aceito como autoridade isolada vinda do cliente.
- O tenant ativo vem da sessão e do JWT.
- Membership é revalidada no banco.
- A transação define `app.current_tenant_id`.
- RLS usa `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- O papel da aplicação não deve ser proprietário das tabelas nem ignorar RLS.

## Segredos

- Segredos de integração e webhooks são cifrados com AES-256-GCM.
- `ENCRYPTION_KEY` é transformada em chave de 256 bits.
- Logs redigem autorização, cookies, senhas, tokens e campos de segredo.
- `.env.example` contém somente valores de desenvolvimento.
- Produção deve usar cofre de segredos e rotação.

## API e transporte

- CORS restrito a `WEB_ORIGIN` em produção.
- Same-origin no frontend reduz exposição de CORS e inconsistência de cookies.
- Rate limiting global e limite específico no login.
- `trustProxy` habilitado para gateway.
- Correlation ID por requisição.
- Erros internos não devolvem stack trace.
- Nginx adiciona cabeçalhos de segurança básicos.

Cabeçalhos atuais do Nginx:

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Em produção, adicione CSP e HSTS após validar os domínios e recursos utilizados.

## Documentos

- Upload e download autenticados.
- Autorização por tenant e acesso ao portal.
- Versão inicia como `PENDING`.
- Confirmação verifica objeto e tamanho antes de `AVAILABLE`.
- Limite do Nginx configurado para 210 MB.
- Nome do arquivo e MIME não devem ser tratados como prova de conteúdo seguro.

Antes de produção, conecte scanner antimalware e quarentena real.

## Webhooks

- Segredo cifrado em repouso.
- Assinatura HMAC-SHA256.
- Tentativas e respostas persistidas.
- Backoff exponencial.
- Reprocessamento manual.
- Dead-letter para falhas esgotadas.

O consumidor externo deve validar assinatura, timestamp/identificador do evento e idempotência.

## Auditoria

Mutações relevantes registram:

- tenant;
- ator;
- ação;
- entidade e ID;
- dados de contexto;
- correlation ID;
- data/hora.

Produção deve definir retenção, exportação e acesso à auditoria conforme requisitos legais.

## Banco

- Papel de migration separado do papel da aplicação.
- Conexões com menor privilégio.
- Constraints de chave, unicidade e domínio.
- RLS em recursos tenant-scoped.
- Queries parametrizadas.

## Controles ainda necessários para go-live

1. TLS em todos os pontos externos.
2. CSP, HSTS e política de cookies revisada.
3. Cofre e rotação de segredos.
4. Backup cifrado e restauração testada.
5. Scanner antimalware.
6. SAST, DAST e análise de imagens.
7. SBOM e assinatura de imagens.
8. Teste de invasão.
9. Testes de isolamento multiempresa em ambiente homologado.
10. Política de retenção e privacidade.
11. Gestão de vulnerabilidades e patches.
12. MFA/SSO caso exigido pela organização.

## Resposta a incidente

Em caso de suspeita de credencial comprometida:

- revogue sessões do usuário;
- altere senha;
- rotacione JWT, cookie e encryption keys conforme impacto;
- invalide webhooks e credenciais de integração;
- preserve logs e auditoria;
- verifique Outbox, Inbox e entregas recentes;
- revise acessos a documentos e relatórios.
