import { expect, test } from '@playwright/test';

test('administrador entra no dashboard operacional', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill('admin@implantahub.local');
  await page.getByLabel('Senha').fill('Admin@123456');
  await page.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByText('Projetos ativos')).toBeVisible();
});

test('cliente entra no portal restrito', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill('cliente@implantahub.local');
  await page.getByLabel('Senha').fill('Admin@123456');
  await page.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByRole('heading', { name: 'Acompanhe suas implantações' })).toBeVisible();
  await expect(page.getByText('Implantação do Portal de Bilhetagem')).toBeVisible();
});

test('tarefas carregam e uma nova tarefa pode ser criada pelo frontend', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill('admin@implantahub.local');
  await page.getByLabel('Senha').fill('Admin@123456');
  await page.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tarefas' })).toBeVisible();
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);

  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  await page.getByLabel('Projeto').selectOption({ index: 1 });
  const title = `Tarefa E2E ${Date.now()}`;
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Responsável').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Criar tarefa' }).click();

  await expect(page.getByText(title)).toBeVisible();
});


test('sessão é restaurada pelo cookie e módulos usam o gateway same-origin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill('admin@implantahub.local');
  await page.getByLabel('Senha').fill('Admin@123456');
  await page.getByRole('button', { name: 'Entrar no workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tarefas' })).toBeVisible();
  await expect(page.getByText(/Não foi possível conectar à API|Failed to fetch/i)).toHaveCount(0);

  for (const route of ['/customers', '/projects', '/dashboard']) {
    await page.goto(route);
    await expect(page.getByText(/Não foi possível conectar à API|Failed to fetch/i)).toHaveCount(0);
  }
});
