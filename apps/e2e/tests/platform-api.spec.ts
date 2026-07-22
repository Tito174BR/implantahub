import { expect, test, type APIRequestContext } from '@playwright/test';

const apiBase = process.env.E2E_API_URL ?? 'http://localhost:3333/api/v1';
const apiOrigin = new URL(apiBase).origin;

async function authenticateAs(
  request: APIRequestContext,
  email = 'admin@implantahub.local',
) {
  const login = await request.post(`${apiBase}/auth/login`, {
    data: { email, password: 'Admin@123456' },
  });
  expect(login.ok()).toBeTruthy();
  const loginBody = await login.json() as { data: { accessToken: string } };

  const tenants = await request.get(`${apiBase}/auth/tenants`, {
    headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
  });
  expect(tenants.ok()).toBeTruthy();
  const tenantsBody = await tenants.json() as { data: Array<{ id: string }> };
  expect(tenantsBody.data.length).toBeGreaterThan(0);

  const selected = await request.post(`${apiBase}/auth/select-tenant`, {
    headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    data: { tenantId: tenantsBody.data[0]!.id },
  });
  expect(selected.ok()).toBeTruthy();
  const selectedBody = await selected.json() as { data: { accessToken: string; tenant: { id: string } } };
  return {
    token: selectedBody.data.accessToken,
    tenantId: selectedBody.data.tenant.id,
    headers: { authorization: `Bearer ${selectedBody.data.accessToken}` },
  };
}

test('catálogo e recursos operacionais persistem dados reais', async ({ request }) => {
  const auth = await authenticateAs(request);
  const catalog = await request.get(`${apiBase}/platform/catalog`, { headers: auth.headers });
  expect(catalog.ok()).toBeTruthy();
  const catalogBody = await catalog.json() as { data: Array<{ key: string }> };
  expect(catalogBody.data.length).toBeGreaterThanOrEqual(30);
  expect(catalogBody.data.some((item) => item.key === 'risks')).toBeTruthy();

  const projects = await request.get(`${apiBase}/projects`, { headers: auth.headers });
  const projectsBody = await projects.json() as { data: Array<{ id: string }> };
  const projectId = projectsBody.data[0]!.id;

  const code = `RISK-E2E-${Date.now()}`;
  const created = await request.post(`${apiBase}/risks`, {
    headers: auth.headers,
    data: {
      projectId,
      title: code,
      description: 'Risco criado pelo teste E2E.',
      probability: 2,
      impact: 3,
      status: 'OPEN',
    },
  });
  expect(created.status()).toBe(201);
  const createdBody = await created.json() as { data: { id: string; score: number } };
  expect(createdBody.data.score).toBe(6);

  const filtered = await request.get(`${apiBase}/risks?search=${code}`, { headers: auth.headers });
  expect(filtered.ok()).toBeTruthy();
  const filteredBody = await filtered.json() as { data: Array<{ id: string; title: string }> };
  expect(filteredBody.data.some((item) => item.id === createdBody.data.id)).toBeTruthy();
});

test('documento percorre upload e download pelo gateway autenticado', async ({ request }) => {
  const auth = await authenticateAs(request);
  const projectsResponse = await request.get(`${apiBase}/projects`, { headers: auth.headers });
  const projects = await projectsResponse.json() as { data: Array<{ id: string; customerId: string }> };
  const project = projects.data[0]!;

  const documentResponse = await request.post(`${apiBase}/documents`, {
    headers: auth.headers,
    data: {
      projectId: project.id,
      customerId: project.customerId,
      title: `Evidência E2E ${Date.now()}`,
      category: 'EVIDENCE',
      status: 'ACTIVE',
    },
  });
  expect(documentResponse.status()).toBe(201);
  const documentBody = await documentResponse.json() as { data: { id: string } };

  const content = Buffer.from('ImplantaHub document upload E2E', 'utf8');
  const presignResponse = await request.post(`${apiBase}/documents/${documentBody.data.id}/upload-url`, {
    headers: auth.headers,
    data: { fileName: 'evidencia-e2e.txt', mimeType: 'text/plain', sizeBytes: content.length },
  });
  expect(presignResponse.status()).toBe(201);
  const presign = await presignResponse.json() as { data: { versionId: string; uploadUrl: string; requiredHeaders: Record<string, string> } };

  const upload = await request.put(`${apiOrigin}${presign.data.uploadUrl}`, {
    headers: { ...auth.headers, ...presign.data.requiredHeaders },
    data: content,
  });
  expect(upload.ok()).toBeTruthy();

  const download = await request.get(`${apiBase}/document-versions/${presign.data.versionId}/download`, {
    headers: auth.headers,
  });
  expect(download.ok()).toBeTruthy();
  expect(await download.body()).toEqual(content);
});

test('relatório assíncrono é processado e disponibilizado', async ({ request }) => {
  const auth = await authenticateAs(request);
  const created = await request.post(`${apiBase}/reports`, {
    headers: auth.headers,
    data: { type: 'EXECUTIVE', format: 'CSV', filters: {} },
  });
  expect(created.status()).toBe(202);
  const createdBody = await created.json() as { data: { id: string } };

  let status = 'PENDING';
  for (let attempt = 0; attempt < 30 && status !== 'COMPLETED'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const jobs = await request.get(`${apiBase}/report-jobs?limit=100`, { headers: auth.headers });
    const jobsBody = await jobs.json() as { data: Array<{ id: string; status: string; errorMessage?: string }> };
    const job = jobsBody.data.find((item) => item.id === createdBody.data.id);
    status = job?.status ?? 'MISSING';
    if (status === 'FAILED') throw new Error(job?.errorMessage ?? 'Report worker failed');
  }
  expect(status).toBe('COMPLETED');

  const download = await request.get(`${apiBase}/reports/${createdBody.data.id}/download`, {
    headers: auth.headers,
  });
  expect(download.ok()).toBeTruthy();
  expect((await download.text()).length).toBeGreaterThan(20);
});


test('cliente acessa somente o portal autorizado', async ({ request }) => {
  const auth = await authenticateAs(request, 'cliente@implantahub.local');

  const portal = await request.get(`${apiBase}/portal/projects`, { headers: auth.headers });
  expect(portal.ok()).toBeTruthy();
  const portalBody = await portal.json() as { data: Array<{ id: string }> };
  expect(portalBody.data.length).toBeGreaterThan(0);

  const internalProjects = await request.get(`${apiBase}/projects`, { headers: auth.headers });
  expect(internalProjects.status()).toBe(403);

  const catalog = await request.get(`${apiBase}/platform/catalog`, { headers: auth.headers });
  expect(catalog.status()).toBe(403);

  const portalProject = await request.get(`${apiBase}/portal/projects/${portalBody.data[0]!.id}`, {
    headers: auth.headers,
  });
  expect(portalProject.ok()).toBeTruthy();
});

test('convite cria conta, vínculo e permite administração do membro', async ({ request }) => {
  const admin = await authenticateAs(request);
  const suffix = Date.now();
  const email = `e2e.${suffix}@implantahub.local`;
  const password = `ImplantaHub@${suffix}`;

  const invitationResponse = await request.post(`${apiBase}/admin/invitations`, {
    headers: admin.headers,
    data: {
      email,
      displayName: 'Usuário E2E',
      role: 'ANALYST',
      expiresInHours: 2,
    },
  });
  expect(invitationResponse.status()).toBe(201);
  const invitation = await invitationResponse.json() as {
    data: { emailQueued: boolean; activation: { tenantId: string; token: string } };
  };
  expect(invitation.data.emailQueued).toBeTruthy();

  const acceptance = await request.post(`${apiBase}/auth/accept-invitation`, {
    data: {
      tenantId: invitation.data.activation.tenantId,
      token: invitation.data.activation.token,
      password,
    },
  });
  expect(acceptance.ok()).toBeTruthy();

  const login = await request.post(`${apiBase}/auth/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const loginBody = await login.json() as { data: { accessToken: string } };
  const selected = await request.post(`${apiBase}/auth/select-tenant`, {
    headers: { authorization: `Bearer ${loginBody.data.accessToken}` },
    data: { tenantId: invitation.data.activation.tenantId },
  });
  expect(selected.ok()).toBeTruthy();
  const selectedBody = await selected.json() as { data: { accessToken: string; tenant: { role: string } } };
  expect(selectedBody.data.tenant.role).toBe('ANALYST');

  const membersResponse = await request.get(`${apiBase}/admin/members`, { headers: admin.headers });
  const members = await membersResponse.json() as { data: Array<{ id: string; email: string }> };
  const member = members.data.find((item) => item.email === email);
  expect(member).toBeTruthy();

  const update = await request.patch(`${apiBase}/admin/members/${member!.id}`, {
    headers: admin.headers,
    data: { role: 'MANAGER' },
  });
  expect(update.ok()).toBeTruthy();

  const staleRoleRequest = await request.get(`${apiBase}/dashboard/summary`, {
    headers: { authorization: `Bearer ${selectedBody.data.accessToken}` },
  });
  expect(staleRoleRequest.status()).toBe(401);
});
