'use client';

import { ArrowRight, CalendarDays, FolderKanban, LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Logo } from '../../components/logo';
import { Badge, Button, Card, EmptyState, ErrorBox, Loading } from '../../components/ui';
import { apiFetch, restoreSession } from '../../lib/api';
import { clearSession, getTenant, getUser, type StoredTenant, type StoredUser } from '../../lib/session';
import type { ApiEnvelope } from '../../lib/types';

interface PortalProject { id: string; code: string; name: string; description: string | null; status: string; priority: string; plannedStartAt: string | null; plannedEndAt: string | null; customerName: string }

export default function PortalPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<StoredUser | null>(null);
  const [tenant, setTenant] = useState<StoredTenant | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const restored = await restoreSession();
      if (!active) return;
      if (!restored) {
        router.replace('/login');
        return;
      }
      setUser(getUser());
      setTenant(getTenant());
      try {
        const response = await apiFetch<ApiEnvelope<PortalProject[]>>('/portal/projects');
        if (active) setProjects(response.data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus projetos.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } finally { clearSession(); router.replace('/login'); }
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5"><Logo /><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="text-xs font-semibold">{user?.displayName}</div><div className="text-[10px] text-[var(--muted)]">{tenant?.name}</div></div><Button variant="ghost" size="icon" onClick={() => void logout()}><LogOut size={17} /></Button></div></div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-10">
        <div className="max-w-2xl"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--brand)]"><ShieldCheck size={15} /> Portal do cliente</div><h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Acompanhe suas implantações</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Consulte o andamento, os marcos e os documentos liberados pela equipe de implantação.</p></div>
        {error ? <div className="mt-6"><ErrorBox message={error} /></div> : null}
        {loading ? <Loading /> : projects.length === 0 ? <div className="mt-8"><EmptyState icon={<FolderKanban />} title="Nenhum projeto disponível" /></div> : (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {projects.map((project) => (
              <Card key={project.id} className="p-6" hover>
                <div className="flex items-start justify-between gap-4"><div><div className="font-mono text-[10px] font-semibold text-[var(--muted)]">{project.code}</div><h2 className="mt-2 text-lg font-semibold">{project.name}</h2><p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{project.description}</p></div><Badge tone="brand" dot>{project.status}</Badge></div>
                <div className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarDays size={14} /> Previsão: {project.plannedEndAt ? new Date(project.plannedEndAt).toLocaleDateString('pt-BR') : 'a definir'}</div>
                <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)]" href={`/portal/${project.id}`}>Abrir acompanhamento <ArrowRight size={15} /></Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
