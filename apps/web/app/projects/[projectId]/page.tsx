'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText, ListChecks, Rocket, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AppShell } from '../../../components/app-shell';
import { Badge, Button, Card, ErrorBox, Loading, ProgressBar, SectionTitle } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { formatDate, formatDateTime, isOverdue } from '../../../lib/format';
import { nextProjectStatus, priorityLabel, projectProgress, projectStageOrder, projectStatusLabel, statusTone, taskStatusLabel } from '../../../lib/status';
import type { ApiEnvelope, ApiListEnvelope, AuditEvent, Customer, Project, Task } from '../../../lib/types';

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const queryClient = useQueryClient();

  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => apiFetch<ApiEnvelope<Project>>(`/projects/${projectId}`) });
  const tasks = useQuery({ queryKey: ['tasks', projectId], queryFn: () => apiFetch<ApiListEnvelope<Task>>(`/tasks?projectId=${projectId}`) });
  const customer = useQuery({
    queryKey: ['customer', project.data?.data.customerId],
    queryFn: () => apiFetch<ApiEnvelope<Customer>>(`/customers/${project.data!.data.customerId}`),
    enabled: Boolean(project.data?.data.customerId),
  });
  const audit = useQuery({ queryKey: ['audit-events'], queryFn: () => apiFetch<ApiListEnvelope<AuditEvent>>('/audit-events'), retry: false });

  const transition = useMutation({
    mutationFn: (status: string) => apiFetch(`/projects/${projectId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus: status, reason: 'Avanço realizado no workspace do projeto.', force: false }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      ]);
    },
  });

  const data = project.data?.data;
  const target = data ? nextProjectStatus[data.status] : undefined;
  const projectEvents = audit.data?.data.filter((event) => event.entityId === projectId).slice(0, 8) ?? [];
  const completedTasks = tasks.data?.data.filter((task) => task.status === 'COMPLETED').length ?? 0;
  const taskProgress = tasks.data?.data.length ? Math.round((completedTasks / tasks.data.data.length) * 100) : 0;

  return (
    <AppShell
      eyebrow="Project workspace"
      title={data?.name ?? 'Projeto'}
      subtitle={data ? `${data.code} · ${customer.data?.data.tradeName ?? customer.data?.data.legalName ?? 'Cliente vinculado'}` : 'Carregando informações do projeto...'}
      actions={
        <>
          <Link href="/projects"><Button variant="secondary"><ArrowLeft size={15} /> Portfólio</Button></Link>
          {target ? <Button onClick={() => transition.mutate(target)} disabled={transition.isPending}>Avançar etapa <ArrowRight size={15} /></Button> : null}
        </>
      }
    >
      {project.isPending ? <Loading /> : null}
      {project.error ? <ErrorBox message={project.error.message} /> : null}
      {transition.error ? <div className="mb-5"><ErrorBox message={transition.error.message} /></div> : null}

      {data ? (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-5 border-b border-[var(--border)] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(data.status)} dot>{projectStatusLabel(data.status)}</Badge>
                <Badge tone={statusTone(data.priority)}>Prioridade {priorityLabel(data.priority)}</Badge>
                <Badge tone={statusTone(data.criticality)}>Criticidade {priorityLabel(data.criticality)}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1.5"><UsersRound size={14} /> {customer.data?.data.tradeName ?? customer.data?.data.legalName ?? 'Cliente vinculado'}</span>
                <span className={`flex items-center gap-1.5 ${isOverdue(data.plannedEndAt, data.status) ? 'font-semibold text-[var(--danger)]' : ''}`}><CalendarDays size={14} /> {formatDate(data.plannedEndAt)}</span>
                <span className="flex items-center gap-1.5"><Clock3 size={14} /> Atualizado {formatDateTime(data.updatedAt)}</span>
              </div>
            </div>

            <div className="overflow-x-auto p-5">
              <div className="flex min-w-[860px] items-start">
                {projectStageOrder.map((stage, index) => {
                  const currentIndex = projectStageOrder.indexOf(data.status);
                  const complete = index < currentIndex || data.status === 'COMPLETED';
                  const current = index === currentIndex;
                  return (
                    <div key={stage} className="flex flex-1 items-start">
                      <div className="flex min-w-0 flex-col items-center text-center">
                        <div className={`grid size-7 place-items-center rounded-full border text-[10px] font-bold ${complete ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : current ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]'}`}>{complete ? <CheckCircle2 size={14} /> : index + 1}</div>
                        <div className={`mt-2 max-w-24 text-[9px] font-medium leading-4 ${current ? 'text-[var(--brand)]' : 'text-[var(--muted)]'}`}>{projectStatusLabel(stage)}</div>
                      </div>
                      {index < projectStageOrder.length - 1 ? <div className={`mt-3.5 h-px flex-1 ${index < currentIndex ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.6fr)]">
            <div className="grid gap-5">
              <Card className="p-5">
                <SectionTitle title="Resumo da implantação" description="Contexto e progresso operacional do projeto." />
                <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">{data.description ?? 'Nenhuma descrição foi adicionada a este projeto.'}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--surface-muted)] p-4"><div className="text-xs text-[var(--muted)]">Ciclo geral</div><div className="mt-2 text-2xl font-semibold">{projectProgress(data.status)}%</div><ProgressBar className="mt-3" value={projectProgress(data.status)} /></div>
                  <div className="rounded-xl bg-[var(--surface-muted)] p-4"><div className="text-xs text-[var(--muted)]">Tarefas concluídas</div><div className="mt-2 text-2xl font-semibold">{completedTasks}<span className="text-sm font-normal text-[var(--muted)]">/{tasks.data?.data.length ?? 0}</span></div><ProgressBar className="mt-3" value={taskProgress} /></div>
                  <div className="rounded-xl bg-[var(--surface-muted)] p-4"><div className="text-xs text-[var(--muted)]">Prazo planejado</div><div className={`mt-2 text-sm font-semibold ${isOverdue(data.plannedEndAt, data.status) ? 'text-[var(--danger)]' : ''}`}>{formatDate(data.plannedEndAt)}</div><div className="mt-3 text-[11px] text-[var(--muted)]">Início {formatDate(data.plannedStartAt)}</div></div>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-[var(--border)] px-5 py-4"><SectionTitle title="Tarefas do projeto" description="Fila de trabalho vinculada a esta implantação." action={<Link href="/tasks" className="text-xs font-semibold text-[var(--brand)]">Abrir kanban</Link>} /></div>
                <div className="divide-y divide-[var(--border)]">
                  {tasks.isPending ? <Loading /> : null}
                  {tasks.data?.data.slice(0, 8).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-5 py-4">
                      <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${task.status === 'COMPLETED' ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--surface-muted)] text-[var(--muted)]'}`}><ListChecks size={15} /></div>
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{task.title}</div><div className="mt-1 text-[11px] text-[var(--muted)]">Prazo {formatDate(task.dueAt)}</div></div>
                      <Badge tone={statusTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
                    </div>
                  ))}
                  {!tasks.isPending && !tasks.data?.data.length ? <div className="p-8 text-center text-sm text-[var(--muted)]">Nenhuma tarefa vinculada.</div> : null}
                </div>
              </Card>
            </div>

            <div className="grid content-start gap-5">
              <Card className="overflow-hidden">
                <div className="border-b border-[var(--border)] px-5 py-4"><SectionTitle title="Atividade" description="Alterações recentes no projeto." /></div>
                <div className="p-5">
                  {projectEvents.length ? (
                    <div className="relative grid gap-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-[var(--border)]">
                      {projectEvents.map((event) => (
                        <div key={event.id} className="relative flex gap-3 pl-0"><div className="relative z-10 mt-1 size-4 shrink-0 rounded-full border-4 border-[var(--surface)] bg-[var(--brand)]" /><div><div className="text-xs font-medium">{event.action.replaceAll('.', ' · ')}</div><div className="mt-1 text-[10px] text-[var(--muted)]">{formatDateTime(event.createdAt)}</div></div></div>
                      ))}
                    </div>
                  ) : <div className="py-8 text-center text-xs text-[var(--muted)]">Nenhuma atividade específica encontrada.</div>}
                </div>
              </Card>

              <Card className="p-5">
                <SectionTitle title="Módulos do projeto" description="Acesse os fluxos operacionais vinculados a esta implantação." />
                <div className="mt-4 grid gap-2">
                  {[
                    { label: 'Homologação e evidências', icon: FileText, href: `/quality?projectId=${projectId}` },
                    { label: 'Riscos e impedimentos', icon: Rocket, href: `/governance?projectId=${projectId}` },
                    { label: 'Deployments e ambientes', icon: CheckCircle2, href: `/delivery?projectId=${projectId}` },
                  ].map(({ label, icon: IconComponent, href }) => (
                    <Link key={label} href={href} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--foreground)]">
                      <IconComponent size={15} className="text-[var(--brand)]" />
                      {label}
                      <ArrowRight size={14} className="ml-auto" />
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
