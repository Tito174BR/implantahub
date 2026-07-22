'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleDot, ListChecks, Plus, Play, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Modal, SearchInput, Select } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatCompactDate, isOverdue } from '../../lib/format';
import { priorityLabel, statusTone, taskStatusLabel } from '../../lib/status';
import type { ApiEnvelope, ApiListEnvelope, DirectoryUser, Project, Task } from '../../lib/types';


const formSchema = z.object({
  projectId: z.string().uuid('Selecione um projeto.'),
  title: z.string().min(3, 'Informe um título.'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assigneeUserId: z.string().optional(),
  dueAt: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const columns = [
  { id: 'PENDING', label: 'A fazer', icon: CircleDot },
  { id: 'IN_PROGRESS', label: 'Em andamento', icon: Play },
  { id: 'BLOCKED', label: 'Bloqueadas', icon: ShieldAlert },
  { id: 'COMPLETED', label: 'Concluídas', icon: Check },
];

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => apiFetch<ApiListEnvelope<Task>>('/tasks') });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<ApiListEnvelope<Project>>('/projects') });
  const users = useQuery({ queryKey: ['directory-users'], queryFn: () => apiFetch<ApiEnvelope<DirectoryUser[]>>('/directory/users') });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { projectId: '', title: '', description: '', priority: 'MEDIUM', assigneeUserId: '', dueAt: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        description: data.description || null,
        dueAt: data.dueAt ? new Date(`${data.dueAt}T18:00:00`).toISOString() : null,
        assigneeUserId: data.assigneeUserId || null,
      }),
    }),
    onSuccess: async () => {
      form.reset();
      setModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (tasks.data?.data ?? []).filter((task) => {
      const matchesSearch = !term || [task.title, task.projectName, task.description].filter(Boolean).some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term));
      const matchesProject = projectFilter === 'ALL' || task.projectId === projectFilter;
      return matchesSearch && matchesProject;
    });
  }, [tasks.data, search, projectFilter]);

  return (
    <AppShell
      eyebrow="Execution board"
      title="Tarefas"
      subtitle="Organize o trabalho operacional, trate bloqueios e mantenha os prazos sob controle."
      actions={<Button onClick={() => setModalOpen(true)}><Plus size={16} /> Nova tarefa</Button>}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput className="w-full sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa ou projeto..." />
        <Select className="w-full sm:w-64" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="ALL">Todos os projetos</option>{projects.data?.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
        <div className="ml-auto text-xs text-[var(--muted)]">{filtered.length} tarefa(s)</div>
      </div>

      {tasks.error ? <div className="mb-4"><ErrorBox message={tasks.error.message} /></div> : null}
      {projects.error ? <div className="mb-4"><ErrorBox message={projects.error.message} /></div> : null}
      {users.error ? <div className="mb-4"><ErrorBox message={users.error.message} /></div> : null}
      {statusMutation.error ? <div className="mb-4"><ErrorBox message={statusMutation.error.message} /></div> : null}
      {tasks.isPending ? <Card><Loading /></Card> : null}

      {!tasks.isPending && filtered.length === 0 ? <EmptyState icon={<ListChecks size={21} />} title="Nenhuma tarefa encontrada" description="Crie uma tarefa ou ajuste os filtros do quadro." action={<Button onClick={() => setModalOpen(true)}><Plus size={15} /> Criar tarefa</Button>} /> : null}

      {filtered.length ? (
        <div className="grid items-start gap-4 xl:grid-cols-4">
          {columns.map(({ id, label, icon: Icon }) => {
            const items = filtered.filter((task) => task.status === id);
            return (
              <section key={id} className="rounded-2xl bg-[var(--background-subtle)] p-3">
                <div className="mb-3 flex items-center gap-2 px-1 py-1">
                  <Icon size={15} className={id === 'BLOCKED' ? 'text-[var(--danger)]' : id === 'COMPLETED' ? 'text-[var(--success)]' : 'text-[var(--muted)]'} />
                  <h2 className="text-xs font-semibold">{label}</h2>
                  <span className="ml-auto rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)] shadow-xs">{items.length}</span>
                </div>
                <div className="grid gap-3">
                  {items.map((task) => (
                    <Card key={task.id} hover className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Badge tone={statusTone(task.priority)}>{priorityLabel(task.priority)}</Badge>
                        {isOverdue(task.dueAt, task.status) ? <Badge tone="danger">Atrasada</Badge> : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-5">{task.title}</h3>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{task.description ?? 'Sem descrição.'}</p>
                      <div className="mt-4 border-t border-[var(--border)] pt-3">
                        <div className="truncate text-[11px] font-medium text-[var(--text-soft)]">{task.projectName}</div>
                        <div className={`mt-1 text-[10px] ${isOverdue(task.dueAt, task.status) ? 'font-semibold text-[var(--danger)]' : 'text-[var(--muted)]'}`}>{formatCompactDate(task.dueAt)}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {task.status === 'PENDING' ? <Button variant="secondary" size="sm" onClick={() => statusMutation.mutate({ id: task.id, status: 'IN_PROGRESS' })}><Play size={13} /> Iniciar</Button> : null}
                        {!['COMPLETED', 'CANCELLED', 'BLOCKED'].includes(task.status) ? <Button variant="ghost" size="sm" onClick={() => statusMutation.mutate({ id: task.id, status: 'BLOCKED' })}><ShieldAlert size={13} /> Bloquear</Button> : null}
                        {task.status === 'BLOCKED' ? <Button variant="secondary" size="sm" onClick={() => statusMutation.mutate({ id: task.id, status: 'IN_PROGRESS' })}>Desbloquear</Button> : null}
                        {task.status !== 'COMPLETED' ? <Button size="sm" onClick={() => statusMutation.mutate({ id: task.id, status: 'COMPLETED' })}><Check size={13} /> Concluir</Button> : null}
                      </div>
                    </Card>
                  ))}
                  {!items.length ? <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-8 text-center text-[11px] text-[var(--muted)]">Nenhuma tarefa</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Criar tarefa" description="Adicione um novo item à fila operacional.">
        <form className="grid gap-5" onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}>
          <Field label="Projeto" error={form.formState.errors.projectId?.message}><Select {...form.register('projectId')}><option value="">Selecione</option>{projects.data?.data.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field>
          <Field label="Título" error={form.formState.errors.title?.message}><input className="input-shell" placeholder="Validar acesso ao ambiente de homologação" {...form.register('title')} /></Field>
          <Field label="Descrição"><textarea className="input-shell min-h-24 resize-y" placeholder="Detalhes e critérios de conclusão..." {...form.register('description')} /></Field>
          <Field label="Responsável">
            <Select {...form.register('assigneeUserId')}>
              <option value="">Sem responsável</option>
              {users.data?.data.filter((user) => user.role !== 'CUSTOMER').map((user) => (
                <option key={user.id} value={user.id}>{user.displayName} — {user.role}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Prioridade"><Select {...form.register('priority')}><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></Select></Field><Field label="Prazo"><input className="input-shell" type="date" {...form.register('dueAt')} /></Field></div>
          {createMutation.error ? <ErrorBox message={createMutation.error.message} /> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-5"><Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Criando...' : 'Criar tarefa'}</Button></div>
        </form>
      </Modal>
    </AppShell>
  );
}
