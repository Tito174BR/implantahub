'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, LayoutGrid, List, Plus, Rocket, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, ProgressBar, SearchInput, Select } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatCompactDate, isOverdue } from '../../lib/format';
import { nextProjectStatus, priorityLabel, projectProgress, projectStatusLabel, statusTone } from '../../lib/status';
import type { ApiEnvelope, ApiListEnvelope, Customer, DirectoryUser, Project } from '../../lib/types';


const formSchema = z.object({
  customerId: z.string().uuid('Selecione um cliente.'),
  code: z.string().min(2, 'Informe o código.'),
  name: z.string().min(3, 'Informe o nome do projeto.'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  criticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  managerUserId: z.string().uuid('Selecione o gerente responsável.'),
  plannedEndAt: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [modalOpen, setModalOpen] = useState(false);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<ApiListEnvelope<Project>>('/projects') });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => apiFetch<ApiListEnvelope<Customer>>('/customers') });
  const users = useQuery({ queryKey: ['directory-users'], queryFn: () => apiFetch<ApiEnvelope<DirectoryUser[]>>('/directory/users') });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { customerId: '', code: '', name: '', description: '', priority: 'MEDIUM', criticality: 'MEDIUM', managerUserId: '', plannedEndAt: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiFetch('/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        customerId: data.customerId,
        code: data.code,
        name: data.name,
        description: data.description || null,
        managerUserId: data.managerUserId,
        priority: data.priority,
        criticality: data.criticality,
        plannedEndAt: data.plannedEndAt ? new Date(`${data.plannedEndAt}T18:00:00`).toISOString() : null,
      }),
    }),
    onSuccess: async () => {
      form.reset();
      setModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/projects/${id}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus: status, reason: 'Avanço realizado pelo workspace.', force: false }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (projects.data?.data ?? []).filter((project) => {
      const matchesSearch = !term || [project.code, project.name, project.customerName ?? ''].some((value) => value.toLocaleLowerCase('pt-BR').includes(term));
      const matchesStatus = statusFilter === 'ALL' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects.data, search, statusFilter]);

  return (
    <AppShell
      eyebrow="Delivery portfolio"
      title="Projetos"
      subtitle="Planeje, acompanhe e conduza cada implantação do kickoff à operação assistida."
      actions={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Novo projeto</Button>}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center">
          <SearchInput className="w-full lg:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar projeto, código ou cliente..." />
          <Select className="w-full lg:w-52" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Todos os status</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PLANNING">Planejamento</option>
            <option value="EXECUTING">Em execução</option>
            <option value="HOMOLOGATION">Homologação</option>
            <option value="PILOT">Piloto</option>
            <option value="COMPLETED">Concluído</option>
            <option value="BLOCKED">Bloqueado</option>
          </Select>
          <div className="ml-auto flex items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
            <button type="button" onClick={() => setView('grid')} className={`grid size-8 place-items-center rounded-lg transition ${view === 'grid' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-sm' : 'text-[var(--muted)]'}`} aria-label="Visualização em cards"><LayoutGrid size={15} /></button>
            <button type="button" onClick={() => setView('list')} className={`grid size-8 place-items-center rounded-lg transition ${view === 'list' ? 'bg-[var(--surface)] text-[var(--brand)] shadow-sm' : 'text-[var(--muted)]'}`} aria-label="Visualização em lista"><List size={15} /></button>
          </div>
        </div>

        {projects.isPending ? <Loading /> : null}
        {projects.error ? <div className="p-5"><ErrorBox message={projects.error.message} /></div> : null}
        {users.error ? <div className="p-5"><ErrorBox message={users.error.message} /></div> : null}
        {transitionMutation.error ? <div className="p-5"><ErrorBox message={transitionMutation.error.message} /></div> : null}

        {!projects.isPending && filtered.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Rocket size={21} />} title="Nenhum projeto encontrado" description="Crie uma nova implantação ou ajuste os filtros do portfólio." action={<Button onClick={() => setModalOpen(true)}><Plus size={15} /> Criar projeto</Button>} /></div>
        ) : null}

        {view === 'grid' && filtered.length ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((project) => {
              const progress = projectProgress(project.status);
              const target = nextProjectStatus[project.status];
              return (
                <Card key={project.id} hover className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] font-semibold text-[var(--muted)]">{project.code}</div>
                      <Link href={`/projects/${project.id}`} className="mt-2 block truncate text-base font-semibold tracking-[-0.02em] hover:text-[var(--brand)]">{project.name}</Link>
                    </div>
                    <Badge tone={statusTone(project.status)} dot>{projectStatusLabel(project.status)}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--muted)]">{project.description ?? 'Projeto de implantação sem descrição cadastrada.'}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]"><UsersRound size={14} /> <span className="truncate">{project.customerName ?? 'Cliente não identificado'}</span></div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarDays size={14} /> <span className={isOverdue(project.plannedEndAt, project.status) ? 'font-semibold text-[var(--danger)]' : ''}>{formatCompactDate(project.plannedEndAt)}</span></div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-medium text-[var(--muted)]"><span>Progresso do ciclo</span><span>{progress}%</span></div>
                    <ProgressBar value={progress} />
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
                    <Badge tone={statusTone(project.priority)}>{priorityLabel(project.priority)}</Badge>
                    {target ? (
                      <Button variant="ghost" size="sm" onClick={() => transitionMutation.mutate({ id: project.id, status: target })} disabled={transitionMutation.isPending}>
                        Avançar <ArrowRight size={14} />
                      </Button>
                    ) : <Link href={`/projects/${project.id}`} className="text-xs font-semibold text-[var(--brand)]">Ver projeto</Link>}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {view === 'list' && filtered.length ? (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-muted)] lg:grid-cols-[minmax(0,1fr)_150px_180px_100px] lg:items-center">
                <div className="min-w-0"><div className="font-mono text-[10px] text-[var(--muted)]">{project.code}</div><div className="mt-1 truncate text-sm font-semibold">{project.name}</div><div className="mt-1 truncate text-xs text-[var(--muted)]">{project.customerName ?? 'Cliente não identificado'}</div></div>
                <Badge className="w-fit" tone={statusTone(project.status)} dot>{projectStatusLabel(project.status)}</Badge>
                <div><div className="mb-1.5 flex justify-between text-[10px] text-[var(--muted)]"><span>Progresso</span><span>{projectProgress(project.status)}%</span></div><ProgressBar value={projectProgress(project.status)} /></div>
                <div className={`text-xs ${isOverdue(project.plannedEndAt, project.status) ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>{formatCompactDate(project.plannedEndAt)}</div>
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Criar projeto" description="Configure as informações iniciais da nova implantação." width="max-w-2xl">
        <form className="grid gap-5" onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente" error={form.formState.errors.customerId?.message}>
              <Select {...form.register('customerId')}><option value="">Selecione</option>{customers.data?.data.map((customer) => <option key={customer.id} value={customer.id}>{customer.tradeName ?? customer.legalName}</option>)}</Select>
            </Field>
            <Field label="Código" error={form.formState.errors.code?.message}><input className="input-shell" placeholder="IMP-2026-002" {...form.register('code')} /></Field>
          </div>
          <Field label="Nome do projeto" error={form.formState.errors.name?.message}><input className="input-shell" placeholder="Implantação do portal corporativo" {...form.register('name')} /></Field>
          <Field label="Descrição"><textarea className="input-shell min-h-24 resize-y" placeholder="Objetivo e contexto da implantação..." {...form.register('description')} /></Field>
          <Field label="Gerente responsável" error={form.formState.errors.managerUserId?.message}>
            <Select {...form.register('managerUserId')}>
              <option value="">Selecione</option>
              {users.data?.data.filter((user) => user.role !== 'CUSTOMER').map((user) => (
                <option key={user.id} value={user.id}>{user.displayName} — {user.role}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Prioridade"><Select {...form.register('priority')}><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></Select></Field>
            <Field label="Criticidade"><Select {...form.register('criticality')}><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></Select></Field>
            <Field label="Prazo planejado"><input className="input-shell" type="date" {...form.register('plannedEndAt')} /></Field>
          </div>
          {createMutation.error ? <ErrorBox message={createMutation.error.message} /> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-5"><Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Criando...' : 'Criar projeto'}</Button></div>
        </form>
      </Modal>
    </AppShell>
  );
}
