# Frontend SaaS do ImplantaHub

> Atualizado em **22 de julho de 2026**.

## Objetivo

O frontend foi estruturado como workspace operacional, não como landing page ou protótipo visual. Ele consome dados reais da API e organiza os módulos em uma experiência consistente para administradores, gestores, analistas e clientes.

## Shell da aplicação

- Sidebar responsiva por domínio.
- Topbar com contexto de workspace, busca, notificações e usuário.
- Tema claro/escuro persistido localmente.
- Navegação mobile.
- Estados de carregamento, vazio, sucesso e erro.
- Modais e formulários padronizados.
- Mensagens de erro com tratamento de rede e correlation ID quando disponível.

## Rotas

| Rota | Função |
|---|---|
| `/login` | Login corporativo |
| `/accept-invitation` | Ativação de convite |
| `/dashboard` | Indicadores executivos |
| `/customers` | Clientes, busca e cadastro |
| `/projects` | Portfólio e criação de projetos |
| `/projects/[projectId]` | Workspace detalhado |
| `/tasks` | Lista/kanban e criação de tarefas |
| `/planning` | Templates, equipe, fases e marcos |
| `/execution` | Checklists e colaboração |
| `/delivery` | Ambientes, componentes, versões e deployments |
| `/quality` | Testes e defeitos |
| `/pilot` | Piloto, métricas e incidentes |
| `/governance` | Riscos, impedimentos, mudanças e aprovações |
| `/content` | Documentos e versões |
| `/communication` | Notificações |
| `/reports` | Solicitação e download de relatórios |
| `/integrations` | Conexões, jobs e webhooks |
| `/administration` | Membros, convites e acessos |
| `/audit` | Auditoria |
| `/settings` | Perfil, senha, aparência e workspace |
| `/modules` | Catálogo operacional |
| `/help` | Ajuda operacional |
| `/portal` | Projetos liberados ao cliente |
| `/portal/[projectId]` | Detalhe autorizado do projeto |

## Cliente HTTP centralizado

Arquivo principal: `apps/web/lib/api.ts`.

Responsabilidades:

- usa `/api/v1` no mesmo domínio;
- adiciona bearer token;
- adiciona `X-Correlation-ID`;
- envia cookies com `credentials: include`;
- aplica timeout de 30 segundos;
- traduz erros HTTP e de rede;
- renova a sessão em respostas `401`;
- deduplica renovações simultâneas;
- redireciona ao login apenas quando a renovação falha;
- suporta downloads binários.

A URL configurada por `NEXT_PUBLIC_API_URL` só é aceita quando começa com `/`. Uma configuração antiga como `http://localhost:3333` é ignorada e substituída por `/api/v1`.

## Restauração da sessão

Ao abrir uma rota protegida:

1. verifica access token, usuário e tenant no `sessionStorage`;
2. se algo estiver ausente, chama `POST /api/v1/auth/refresh`;
3. restaura usuário e tenant retornados pela API;
4. só redireciona para `/login` quando o refresh falha;
5. direciona usuários `CUSTOMER` ao `/portal`.

Isso evita o problema em que atualizar `/tasks` ou outra tela encerrava visualmente uma sessão ainda válida.

## Tarefas

A tela de tarefas:

- consulta `/api/v1/tasks`;
- carrega projetos reais para o seletor;
- carrega usuários reais do tenant;
- cria tarefas sem IDs fixos;
- altera status por endpoint dedicado;
- apresenta erro de API em linguagem operacional;
- possui cobertura E2E contra regressão de `Failed to fetch`.

## Dados e cache

TanStack Query gerencia consultas, invalidação e refetch. Mutações invalidam as chaves relacionadas para atualizar a tela sem recarregar o navegador.

## Formulários

React Hook Form e Zod são usados nas telas com validação estruturada. Campos obrigatórios e falhas da API são apresentados próximos ao contexto da ação.

## Documentos

O frontend:

1. cria o documento;
2. reserva a versão;
3. envia o arquivo para uma rota `/api/v1` autenticada;
4. confirma a versão;
5. baixa o arquivo pelo cliente autenticado.

Não há chamada direta do navegador para `localhost:9000`.

## Relatórios

- cria jobs pela API;
- consulta o status;
- exibe erro do worker quando houver;
- baixa o arquivo com `apiDownload`;
- mantém autenticação e refresh durante o fluxo.

## Portal do cliente

O portal utiliza endpoints separados. O menu administrativo não é exibido para `CUSTOMER`, e a API também bloqueia acesso interno. Ocultar o menu não é o mecanismo de segurança; a autorização real está no backend.

## Responsividade e acessibilidade

- navegação adaptada a desktop e mobile;
- labels em formulários;
- botões com nomes identificáveis nos testes;
- hierarquia de títulos;
- estados de foco herdados do design system;
- tabelas e cards reorganizados em telas menores.

## Validação do frontend

```bash
docker compose up -d --build
pnpm smoke
pnpm test:e2e
```

Os testes Playwright validam login, dashboard, portal, carregamento de tarefas, criação de tarefa e restauração da sessão após limpar o `sessionStorage`.
