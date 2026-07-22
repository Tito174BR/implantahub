'use client';

import { useQuery } from '@tanstack/react-query';
import { FileClock, Fingerprint, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { Badge, Card, EmptyState, ErrorBox, Loading, SearchInput, Select, StatCard } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDateTime, humanizeAction } from '../../lib/format';
import type { ApiListEnvelope, AuditEvent } from '../../lib/types';

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const query = useQuery({ queryKey: ['audit-events'], queryFn: () => apiFetch<ApiListEnvelope<AuditEvent>>('/audit-events') });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (query.data?.data ?? []).filter((event) => {
      const matchesEntity = entityFilter === 'ALL' || event.entityType === entityFilter;
      const matchesSearch = !term || [event.action, event.entityType, event.entityId, event.correlationId].filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
      return matchesEntity && matchesSearch;
    });
  }, [query.data, search, entityFilter]);

  const uniqueEntities = new Set(query.data?.data.map((event) => event.entityType)).size;

  return (
    <AppShell eyebrow="Compliance & traceability" title="Auditoria" subtitle="Consulte alterações, ações e eventos críticos registrados no workspace.">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Eventos carregados" value={query.data?.data.length ?? 0} detail="Últimos registros" icon={<FileClock size={18} />} />
        <StatCard label="Tipos de entidade" value={uniqueEntities} detail="Escopo auditado" icon={<Fingerprint size={18} />} tone="info" />
        <StatCard label="Rastreabilidade" value="Ativa" detail="Correlation ID por operação" icon={<ShieldCheck size={18} />} tone="success" />
      </section>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center">
          <SearchInput className="w-full sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ação, entidade ou correlation ID..." />
          <Select className="w-full sm:w-52" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}><option value="ALL">Todas as entidades</option><option value="PROJECT">Projetos</option><option value="TASK">Tarefas</option><option value="CUSTOMER">Clientes</option></Select>
          <div className="ml-auto text-xs text-[var(--muted)]">{filtered.length} evento(s)</div>
        </div>

        {query.isPending ? <Loading /> : null}
        {query.error ? <div className="p-5"><ErrorBox message={query.error.message} /></div> : null}
        {!query.isPending && filtered.length === 0 ? <div className="p-5"><EmptyState icon={<Search size={20} />} title="Nenhum evento encontrado" description="Ajuste os filtros para localizar o registro desejado." /></div> : null}

        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead><tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"><th className="px-5 py-3">Evento</th><th className="px-5 py-3">Entidade</th><th className="px-5 py-3">Data e hora</th><th className="px-5 py-3">Correlation ID</th><th className="px-5 py-3">Metadados</th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((event) => (
                  <tr key={event.id} className="align-top transition hover:bg-[var(--surface-muted)]">
                    <td className="px-5 py-4"><div className="text-sm font-medium">{humanizeAction(event.action)}</div><div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{event.action}</div></td>
                    <td className="px-5 py-4"><Badge tone="info">{event.entityType}</Badge><div className="mt-2 max-w-40 truncate font-mono text-[10px] text-[var(--muted)]">{event.entityId ?? '—'}</div></td>
                    <td className="px-5 py-4 text-xs text-[var(--text-soft)]">{formatDateTime(event.createdAt)}</td>
                    <td className="px-5 py-4"><code className="block max-w-48 truncate rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-[var(--muted)]">{event.correlationId}</code></td>
                    <td className="px-5 py-4"><code className="block max-w-64 truncate text-[10px] text-[var(--muted)]">{JSON.stringify(event.metadata)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
