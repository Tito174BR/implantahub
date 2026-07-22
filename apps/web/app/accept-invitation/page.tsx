'use client';

import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { Logo } from '../../components/logo';
import { Button, ErrorBox, Field } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import type { ApiEnvelope } from '../../lib/types';

interface AcceptedInvitation {
  userId: string;
  email: string;
  displayName: string;
  role: string;
}

export default function AcceptInvitationPage() {
  const [tenantId, setTenantId] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTenantId(params.get('tenantId') ?? '');
    setToken(params.get('token') ?? '');
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!tenantId || !token) {
      setError('O link de convite está incompleto. Solicite um novo convite ao administrador.');
      return;
    }
    if (password.length < 10) {
      setError('A senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('A confirmação da senha não confere.');
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch<ApiEnvelope<AcceptedInvitation>>('/auth/accept-invitation', {
        method: 'POST',
        body: JSON.stringify({ tenantId, token, password }),
      });
      setAccepted(response.data);
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível aceitar o convite.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-muted)] px-5 py-10 text-[var(--text)]">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-black/5 sm:p-8">
          {accepted ? (
            <div className="text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]"><CheckCircle2 size={28} /></div>
              <h1 className="mt-5 text-2xl font-bold tracking-[-0.04em]">Acesso ativado</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                A conta de <strong className="text-[var(--text)]">{accepted.displayName}</strong> foi ativada como {accepted.role}. Entre com o e-mail {accepted.email} e a senha que acabou de criar.
              </p>
              <Link href="/login" className="mt-7 inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-hover)]">
                Ir para o login <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><KeyRound size={21} /></div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand)]"><ShieldCheck size={14} /> Convite seguro</div>
                  <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Ative sua conta</h1>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Conta nova: defina uma senha forte. Conta já existente: informe sua senha atual para vincular o novo workspace.</p>
                </div>
              </div>

              <form className="mt-7 grid gap-5" onSubmit={submit}>
                <Field label="Senha da conta" hint="Conta nova: crie uma senha. Conta existente: use a senha atual.">
                  <input className="input-shell" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
                </Field>
                <Field label="Confirmar nova senha">
                  <input className="input-shell" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={10} />
                </Field>
                {error ? <ErrorBox message={error} /> : null}
                <Button className="w-full" type="submit" disabled={saving || !tenantId || !token}>
                  {saving ? 'Ativando conta...' : 'Ativar meu acesso'} <ArrowRight size={16} />
                </Button>
              </form>

              {(!tenantId || !token) ? <p className="mt-5 text-center text-xs text-[var(--danger)]">Este link não contém os dados necessários para ativação.</p> : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
