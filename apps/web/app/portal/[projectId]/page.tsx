'use client';

import { ArrowLeft, CalendarDays, CheckCircle2, Download, FileText, Milestone } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Logo } from '../../../components/logo';
import { Badge, Card, ErrorBox, Loading, ProgressBar } from '../../../components/ui';
import { apiDownload, apiFetch } from '../../../lib/api';
import type { ApiEnvelope } from '../../../lib/types';

interface PortalDetail {
  project: { id: string; code: string; name: string; description: string | null; status: string; plannedStartAt: string | null; plannedEndAt: string | null };
  phases: Array<{ id: string; name: string; status: string; progress: number; planned_end_at?: string | null; plannedEndAt?: string | null }>;
  milestones: Array<{ id: string; title: string; status: string; due_at?: string | null; dueAt?: string | null }>;
  documents: Array<{ id: string; title: string; category: string; current_version?: number; currentVersion?: number; version_id?: string | null; versionId?: string | null; file_name?: string | null; fileName?: string | null }>;
}

export default function PortalProjectPage() {
  const params = useParams<{ projectId: string }>();
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch<ApiEnvelope<PortalDetail>>(`/portal/projects/${params.projectId}`)
      .then((response) => setDetail(response.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o projeto.'));
  }, [params.projectId]);

  async function downloadDocument(versionId: string, fallbackName: string) {
    try {
      const { blob, fileName } = await apiDownload(`/document-versions/${versionId}/download`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName ?? fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível baixar o documento.');
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5"><Logo /><Link href="/portal" className="flex items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft size={16} /> Voltar</Link></div></header>
      <div className="mx-auto max-w-7xl px-5 py-10">
        {error ? <ErrorBox message={error} /> : !detail ? <Loading /> : (
          <div className="grid gap-6">
            <Card className="p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-mono text-xs text-[var(--muted)]">{detail.project.code}</div><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">{detail.project.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{detail.project.description}</p></div><Badge tone="brand" dot>{detail.project.status}</Badge></div><div className="mt-5 flex gap-4 text-xs text-[var(--muted)]"><span className="flex items-center gap-1"><CalendarDays size={14} /> Início {detail.project.plannedStartAt ? new Date(detail.project.plannedStartAt).toLocaleDateString('pt-BR') : '—'}</span><span>Previsão {detail.project.plannedEndAt ? new Date(detail.project.plannedEndAt).toLocaleDateString('pt-BR') : '—'}</span></div></Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5"><div className="mb-5 flex items-center gap-2 font-semibold"><CheckCircle2 size={18} className="text-[var(--brand)]" /> Fases</div><div className="grid gap-4">{detail.phases.map((phase) => <div key={phase.id}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{phase.name}</span><span className="text-xs text-[var(--muted)]">{phase.progress}%</span></div><ProgressBar value={phase.progress} /></div>)}</div></Card>
              <Card className="p-5"><div className="mb-5 flex items-center gap-2 font-semibold"><Milestone size={18} className="text-[var(--warning)]" /> Marcos</div><div className="grid gap-3">{detail.milestones.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] p-3"><div className="min-w-0 flex-1 text-sm font-medium">{item.title}</div><Badge>{item.status}</Badge></div>)}</div></Card>
            </div>
            <Card className="p-5"><div className="mb-5 flex items-center gap-2 font-semibold"><FileText size={18} className="text-[var(--success)]" /> Documentos liberados</div><div className="grid gap-3 sm:grid-cols-2">{detail.documents.map((document) => { const versionId = document.versionId ?? document.version_id; return <div key={document.id} className="rounded-xl border border-[var(--border)] p-4"><div className="font-medium">{document.title}</div><div className="mt-1 text-xs text-[var(--muted)]">{document.category} · versão {document.currentVersion ?? document.current_version ?? 0}</div>{versionId ? <button type="button" onClick={() => void downloadDocument(versionId, document.fileName ?? document.file_name ?? 'documento')} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--brand)]"><Download size={14} /> Baixar {document.fileName ?? document.file_name ?? 'documento'}</button> : null}</div>; })}</div></Card>
          </div>
        )}
      </div>
    </main>
  );
}
