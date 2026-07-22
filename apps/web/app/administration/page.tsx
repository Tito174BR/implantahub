'use client';

import { Ban, Copy, MailPlus, Shield, UserRoundCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { ResourceCenter } from '../../components/resource-center';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, Select } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import type { ApiEnvelope } from '../../lib/types';

interface Member {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'ANALYST' | 'CUSTOMER';
  status: 'ACTIVE' | 'INACTIVE';
  userStatus: string;
  createdAt: string;
}
interface Invitation {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

const roles = ['ADMIN', 'MANAGER', 'ANALYST', 'CUSTOMER'] as const;

export default function AdministrationPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [activation, setActivation] = useState<{ tenantId: string; token: string; emailQueued: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'ANALYST', expiresInHours: 72 });

  const activationUrl = useMemo(() => activation && typeof window !== 'undefined'
    ? `${window.location.origin}/accept-invitation?tenantId=${encodeURIComponent(activation.tenantId)}&token=${encodeURIComponent(activation.token)}`
    : '', [activation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        apiFetch<ApiEnvelope<Member[]>>('/admin/members'),
        apiFetch<ApiEnvelope<Invitation[]>>('/admin/invitations'),
      ]);
      setMembers(memberResponse.data);
      setInvitations(invitationResponse.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a administração.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch<ApiEnvelope<{ emailQueued: boolean; activation: { tenantId: string; token: string } }>>('/admin/invitations', {
        method: 'POST', body: JSON.stringify(form),
      });
      setActivation({ ...response.data.activation, emailQueued: response.data.emailQueued });
      setCopied(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o convite.');
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(member: Member, patch: Partial<Pick<Member, 'role' | 'status'>>) {
    setUpdatingId(member.id);
    setError('');
    try {
      await apiFetch(`/admin/members/${member.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o membro.');
    } finally {
      setUpdatingId('');
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm(`Revogar o convite enviado para ${invitation.email}?`)) return;
    setError('');
    try {
      await apiFetch(`/admin/invitations/${invitation.id}/revoke`, { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível revogar o convite.');
    }
  }

  async function copyActivationUrl() {
    if (!activationUrl) return;
    await navigator.clipboard.writeText(activationUrl);
    setCopied(true);
  }

  return (
    <AppShell title="Administração" subtitle="Usuários, papéis, convites e acessos ao portal do cliente." eyebrow="Segurança" actions={<Button onClick={() => { setActivation(null); setCopied(false); setOpen(true); }}><MailPlus size={16} /> Convidar usuário</Button>}>
      {error ? <ErrorBox message={error} /> : null}
      {loading ? <Loading /> : (
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><Users className="text-[var(--brand)]" size={20} /><div className="mt-4 text-3xl font-bold">{members.length}</div><div className="mt-1 text-sm text-[var(--muted)]">Membros cadastrados</div></Card>
            <Card className="p-5"><UserRoundCheck className="text-[var(--success)]" size={20} /><div className="mt-4 text-3xl font-bold">{members.filter((item) => item.status === 'ACTIVE').length}</div><div className="mt-1 text-sm text-[var(--muted)]">Acessos ativos</div></Card>
            <Card className="p-5"><Shield className="text-[var(--warning)]" size={20} /><div className="mt-4 text-3xl font-bold">{invitations.filter((item) => item.status === 'PENDING').length}</div><div className="mt-1 text-sm text-[var(--muted)]">Convites pendentes</div></Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4"><h2 className="font-semibold">Membros do workspace</h2><p className="mt-1 text-xs text-[var(--muted)]">Altere o papel ou suspenda o acesso. O último administrador ativo é protegido.</p></div>
            {members.length === 0 ? <EmptyState title="Nenhum membro" /> : (
              <div className="divide-y divide-[var(--border)]">
                {members.map((member) => (
                  <div key={member.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                    <div className="grid size-10 place-items-center rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand)]">{member.displayName.slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><div className="font-medium">{member.displayName}</div><div className="text-xs text-[var(--muted)]">{member.email}</div></div>
                    <Select className="w-full lg:w-44" value={member.role} disabled={updatingId === member.id} onChange={(event) => void updateMember(member, { role: event.target.value as Member['role'] })}>
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </Select>
                    <Badge tone={member.status === 'ACTIVE' ? 'success' : 'neutral'} dot>{member.status}</Badge>
                    <Button size="sm" variant={member.status === 'ACTIVE' ? 'danger' : 'secondary'} disabled={updatingId === member.id} onClick={() => void updateMember(member, { status: member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                      {member.status === 'ACTIVE' ? <><Ban size={14} /> Suspender</> : <><UserRoundCheck size={14} /> Reativar</>}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4"><h2 className="font-semibold">Convites</h2><p className="mt-1 text-xs text-[var(--muted)]">O convite é enviado por e-mail pelo worker e pode ser revogado enquanto estiver pendente.</p></div>
            {invitations.length === 0 ? <EmptyState title="Nenhum convite" /> : (
              <div className="divide-y divide-[var(--border)]">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1"><div className="font-medium">{invitation.displayName}</div><div className="text-xs text-[var(--muted)]">{invitation.email} · expira em {new Date(invitation.expiresAt).toLocaleString('pt-BR')}</div></div>
                    <Badge>{invitation.role}</Badge><Badge tone={invitation.status === 'PENDING' ? 'warning' : invitation.status === 'ACCEPTED' ? 'success' : 'neutral'}>{invitation.status}</Badge>
                    {invitation.status === 'PENDING' ? <Button size="sm" variant="ghost" onClick={() => void revokeInvitation(invitation)}>Revogar</Button> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div>
            <h2 className="mb-3 text-base font-semibold">Acessos ao portal do cliente</h2>
            <ResourceCenter groups={['Administração']} />
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Convidar usuário" description="O link de ativação será enviado por e-mail e também ficará disponível para cópia.">
        {activation ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-[var(--success)]/25 bg-[var(--success-soft)] p-4 text-sm text-[var(--success)]">{activation.emailQueued ? 'Convite criado e colocado na fila de e-mail.' : 'Convite criado, mas o e-mail não pôde ser enfileirado. Copie o link abaixo.'}</div>
            <Field label="Link de ativação"><textarea className="input-shell min-h-32" readOnly value={activationUrl} /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => void copyActivationUrl()}><Copy size={15} /> {copied ? 'Copiado' : 'Copiar link'}</Button><Button onClick={() => setOpen(false)}>Concluir</Button></div>
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label="Nome"><input className="input-shell" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></Field>
            <Field label="E-mail"><input className="input-shell" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
            <Field label="Papel"><Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</Select></Field>
            <Field label="Validade em horas"><input className="input-shell" type="number" min={1} max={720} value={form.expiresInHours} onChange={(event) => setForm({ ...form, expiresInHours: Number(event.target.value) })} /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void invite()} disabled={saving || !form.email || !form.displayName}>{saving ? 'Criando...' : 'Criar e enviar convite'}</Button></div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
