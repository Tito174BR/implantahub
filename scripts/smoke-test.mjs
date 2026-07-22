#!/usr/bin/env node

const baseUrl = (process.env.IMPLANTAHUB_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const apiBase = `${baseUrl}/api/v1`;
const email = process.env.IMPLANTAHUB_EMAIL ?? 'admin@implantahub.local';
const password = process.env.IMPLANTAHUB_PASSWORD ?? 'Admin@123456';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { token, cookie, ...init } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Correlation-ID', crypto.randomUUID());
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (cookie) headers.set('Cookie', cookie);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBase}${path}`, { ...init, headers, redirect: 'manual' });
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === 'object' && body?.error?.message
      ? body.error.message
      : `${response.status} ${response.statusText}`;
    throw new Error(`${init.method ?? 'GET'} ${path}: ${message}`);
  }

  return { response, body };
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const raw = values[0];
  assert(raw, 'O login não retornou o cookie de renovação.');
  return raw.split(';', 1)[0];
}

async function step(label, fn) {
  process.stdout.write(`• ${label}... `);
  const value = await fn();
  console.log('OK');
  return value;
}

try {
  const health = await step('Gateway e API', async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert(response.ok, `healthcheck retornou HTTP ${response.status}`);
    return response.json();
  });
  assert(health.status === 'UP', 'A API não está pronta.');

  const login = await step('Login', () => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }));
  let token = login.body.data.accessToken;
  let cookie = cookieFrom(login.response);

  const tenants = await step('Listagem de workspaces', () => request('/auth/tenants', { token }));
  const tenant = tenants.body.data[0];
  assert(tenant?.id, 'Nenhum workspace disponível para o usuário de teste.');

  const selection = await step('Seleção do workspace', () => request('/auth/select-tenant', {
    method: 'POST',
    token,
    body: JSON.stringify({ tenantId: tenant.id }),
  }));
  token = selection.body.data.accessToken;

  const refresh = await step('Renovação da sessão', () => request('/auth/refresh', {
    method: 'POST',
    cookie,
  }));
  token = refresh.body.data.accessToken;
  cookie = cookieFrom(refresh.response);
  assert(refresh.body.data.user?.email === email, 'Refresh não retornou o usuário autenticado.');
  assert(refresh.body.data.tenant?.id === tenant.id, 'Refresh não restaurou o workspace ativo.');

  const checks = [
    ['/dashboard/summary', 'Dashboard'],
    ['/customers?limit=5', 'Clientes'],
    ['/projects?limit=5', 'Projetos'],
    ['/tasks?limit=5', 'Tarefas'],
    ['/directory/users', 'Diretório de usuários'],
    ['/platform/catalog', 'Catálogo operacional'],
    ['/audit-events?limit=5', 'Auditoria'],
    ['/notifications?limit=5', 'Notificações'],
    ['/documents?limit=5', 'Documentos'],
    ['/report-jobs?limit=5', 'Relatórios'],
  ];

  const results = {};
  for (const [path, label] of checks) {
    const result = await step(label, () => request(path, { token }));
    results[path] = result.body;
  }

  const firstProject = results['/projects?limit=5']?.data?.[0];
  if (firstProject?.id) {
    await step('Detalhe do projeto', () => request(`/projects/${firstProject.id}`, { token }));
    await step('Tarefas filtradas por projeto', () => request(`/tasks?projectId=${firstProject.id}&limit=5`, { token }));
  }

  const firstCustomer = results['/customers?limit=5']?.data?.[0];
  if (firstCustomer?.id) {
    await step('Detalhe do cliente', () => request(`/customers/${firstCustomer.id}`, { token }));
  }

  const firstTask = results['/tasks?limit=5']?.data?.[0];
  if (firstTask?.id && firstTask?.status) {
    await step('Mutação idempotente de tarefa', () => request(`/tasks/${firstTask.id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status: firstTask.status, reason: 'Smoke test local' }),
    }));
  }

  console.log(`\nImplantaHub validado com sucesso em ${baseUrl}.`);
  console.log(`Workspace: ${tenant.name} (${tenant.role})`);
} catch (error) {
  console.error(`\nFalha no smoke test: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Confira: docker compose ps && docker compose logs --tail=200 api web nginx');
  process.exitCode = 1;
}
