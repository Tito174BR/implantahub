'use client';

import { Building2, KeyRound, Moon, Palette, ShieldCheck, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, ErrorBox, Field, SectionTitle } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { getTenant, getUser, setUser, type StoredTenant, type StoredUser } from '../../lib/session';
import type { ApiEnvelope } from '../../lib/types';

export default function SettingsPage() {
  const [tenant, setTenantState] = useState<StoredTenant | null>(null);
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const storedTenant = getTenant();
    const storedUser = getUser();
    setTenantState(storedTenant);
    setUserState(storedUser);
    setDisplayName(storedUser?.displayName ?? '');
    const savedTheme = localStorage.getItem('implantahub.theme') === 'dark' ? 'dark' : 'light';
    setTheme(savedTheme);
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setError('');
    setProfileMessage('');
    try {
      const response = await apiFetch<ApiEnvelope<StoredUser>>('/auth/me', {
        method: 'PATCH', body: JSON.stringify({ displayName }),
      });
      setUser(response.data);
      setUserState(response.data);
      setProfileMessage('Perfil atualizado com sucesso.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o perfil.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword() {
    setError('');
    setPasswordMessage('');
    if (passwords.newPassword.length < 10) {
      setError('A nova senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmation) {
      setError('A confirmação da nova senha não confere.');
      return;
    }
    setPasswordSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmation: '' });
      setPasswordMessage('Senha alterada. As outras sessões ativas foram encerradas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.');
    } finally {
      setPasswordSaving(false);
    }
  }

  function applyTheme(value: 'light' | 'dark') {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    localStorage.setItem('implantahub.theme', value);
  }

  return (
    <AppShell eyebrow="Workspace administration" title="Configurações" subtitle="Perfil, segurança, aparência e contexto empresarial da conta.">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-3">
          <a href="#perfil" className="flex w-full items-center gap-3 rounded-xl bg-[var(--brand-soft)] px-3 py-3 text-left text-sm font-semibold text-[var(--brand)]"><UserRound size={17} /> Perfil</a>
          <a href="#seguranca" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"><ShieldCheck size={17} /> Segurança</a>
          <a href="#aparencia" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"><Palette size={17} /> Aparência</a>
          <Link href="/integrations" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"><KeyRound size={17} /> API e integrações</Link>
        </Card>

        <div className="grid gap-5">
          <Card id="perfil" className="scroll-mt-24 p-6">
            <SectionTitle title="Informações pessoais" description="Dados utilizados para identificar você dentro do workspace." action={<Badge tone="success" dot>Conta ativa</Badge>} />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Nome"><input className="input-shell" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} /></Field>
              <Field label="E-mail"><input className="input-shell" value={user?.email ?? ''} disabled /></Field>
            </div>
            {profileMessage ? <p className="mt-4 text-sm text-[var(--success)]">{profileMessage}</p> : null}
            <div className="mt-6 flex justify-end"><Button onClick={() => void saveProfile()} disabled={profileSaving || displayName.trim().length < 2}>{profileSaving ? 'Salvando...' : 'Salvar perfil'}</Button></div>
          </Card>

          <Card id="seguranca" className="scroll-mt-24 p-6">
            <SectionTitle title="Alterar senha" description="A troca de senha encerra as outras sessões ativas da sua conta." />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Senha atual"><input className="input-shell" type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></Field>
              <div className="hidden sm:block" />
              <Field label="Nova senha" hint="Mínimo de 10 caracteres."><input className="input-shell" type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></Field>
              <Field label="Confirmar nova senha"><input className="input-shell" type="password" autoComplete="new-password" value={passwords.confirmation} onChange={(event) => setPasswords({ ...passwords, confirmation: event.target.value })} /></Field>
            </div>
            {passwordMessage ? <p className="mt-4 text-sm text-[var(--success)]">{passwordMessage}</p> : null}
            <div className="mt-6 flex justify-end"><Button onClick={() => void changePassword()} disabled={passwordSaving || !passwords.currentPassword || !passwords.newPassword}>{passwordSaving ? 'Alterando...' : 'Alterar senha'}</Button></div>
          </Card>

          <Card id="aparencia" className="scroll-mt-24 p-6">
            <SectionTitle title="Aparência" description="A preferência fica salva neste navegador." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => applyTheme('light')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${theme === 'light' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'}`}><Sun size={20} /><div><div className="font-semibold">Tema claro</div><div className="mt-1 text-xs text-[var(--muted)]">Interface clara para ambientes iluminados.</div></div></button>
              <button type="button" onClick={() => applyTheme('dark')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${theme === 'dark' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--border)] hover:bg-[var(--surface-muted)]'}`}><Moon size={20} /><div><div className="font-semibold">Tema escuro</div><div className="mt-1 text-xs text-[var(--muted)]">Menor brilho para uso prolongado.</div></div></button>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="Workspace atual" description="Contexto empresarial selecionado nesta sessão." />
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div className="grid size-11 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><Building2 size={20} /></div>
              <div><div className="font-semibold">{tenant?.name ?? 'ImplantaHub'}</div><div className="mt-1 text-xs text-[var(--muted)]">{tenant?.slug ?? 'workspace'} · {tenant?.role ?? 'ADMIN'}</div></div>
              <Badge className="ml-auto" tone="success" dot>Ativo</Badge>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
