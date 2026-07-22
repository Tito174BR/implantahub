'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderKanban,
  ListChecks,
  Plus,
  Rocket,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';

import { AppShell } from '../../components/app-shell';
import { Badge, Button, Card, ErrorBox, ProgressBar, SectionTitle, SkeletonCard, StatCard } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatCompactDate, formatDateTime, humanizeAction, isOverdue } from '../../lib/format';
import { priorityLabel, projectProgress, projectStatusLabel, statusTone, taskStatusLabel } from '../../lib/status';
import type { ApiEnvelope, ApiListEnvelope, AuditEvent, DashboardSummary, Project, Task } from '../../lib/types';

export default function DashboardPage() {
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch<ApiEnvelope<DashboardSummary>>('/dashboard/summary'),
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ApiListEnvelope<Project>>('/projects'),
  });
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<ApiListEnvelope<Task>>('/tasks'),
  });
  const audit = useQuery({
    queryKey: ['audit-events'],
    queryFn: () => apiFetch<ApiListEnvelope<AuditEvent>>('/audit-events'),
    retry: false,
  });

  const activeProjects = projects.data?.data
    .filter((project) => !['COMPLETED', 'CANCELLED'].includes(project.status))
    .slice(0, 5) ?? [];
  const attentionTasks = tasks.data?.data
    .filter((task) => task.status === 'BLOCKED' || isOverdue(task.dueAt, task.status))
    .slice(0, 5) ?? [];
  const completedPercent = summary.data?.data.tasks.total
    ? Math.round((summary.data.data.tasks.completed / summary.data.data.tasks.total) * 100)
    : 0;

  return (
    <AppShell
      eyebrow="Operations center"
      title="Visão geral"
      subtitle="Acompanhe saúde, progresso e pontos de atenção de todas as implantações do workspace."
      actions={
        <>
          <Link href="/projects"><Button variant="secondary"><FolderKanban size={16} /> Ver projetos</Button></Link>
          <Link href="/projects"><Button><Plus size={16} /> Novo projeto</Button></Link>
        </>
      }
    >
      {summary.error ? <ErrorBox message={summary.error.message} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isPending ? Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />) : null}
        {summary.data ? (
          <>
            <StatCard label="Projetos ativos" value={summary.data.data.projects.active} detail={`${summary.data.data.projects.total} no portfólio`} trend="Operação" icon={<Rocket size={19} />} tone="brand" />
            <StatCard label="Tarefas pendentes" value={summary.data.data.tasks.pending} detail={`${completedPercent}% concluídas`} icon={<ListChecks size={19} />} tone="info" />
            <StatCard label="Itens atrasados" value={summary.data.data.tasks.overdue} detail="Exigem replanejamento" icon={<Clock3 size={19} />} tone={summary.data.data.tasks.overdue ? 'danger' : 'success'} />
            <StatCard label="Projetos bloqueados" value={summary.data.data.projects.blocked} detail="Dependências críticas" icon={<ShieldAlert size={19} />} tone={summary.data.data.projects.blocked ? 'warning' : 'success'} />
          </>
        ) : null}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <SectionTitle
              title="Portfólio em andamento"
              description="Projetos ativos ordenados por atenção operacional."
              action={<Link href="/projects" className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)]">Ver todos <ArrowRight size={14} /></Link>}
            />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {projects.isPending ? <div className="p-5 text-sm text-[var(--muted)]">Carregando portfólio...</div> : null}
            {activeProjects.map((project) => {
              const progress = projectProgress(project.status);
              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-muted)] md:grid-cols-[minmax(0,1fr)_150px_100px] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-semibold text-[var(--muted)]">{project.code}</span>
                      <Badge tone={statusTone(project.status)} dot>{projectStatusLabel(project.status)}</Badge>
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold group-hover:text-[var(--brand)]">{project.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                      <span className="flex items-center gap-1"><UsersRound size={13} /> {project.customerName ?? 'Cliente não identificado'}</span>
                      <span className={isOverdue(project.plannedEndAt, project.status) ? 'font-semibold text-[var(--danger)]' : ''}>Prazo {formatCompactDate(project.plannedEndAt)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-[var(--muted)]">
                      <span>Progresso</span><span>{progress}%</span>
                    </div>
                    <ProgressBar value={progress} />
                  </div>
                  <div className="text-right"><Badge tone={statusTone(project.priority)}>{priorityLabel(project.priority)}</Badge></div>
                </Link>
              );
            })}
            {!projects.isPending && activeProjects.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted)]">Nenhum projeto ativo.</div> : null}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Entrega do ciclo" description="Distribuição geral das tarefas." />
          <div className="mt-6 flex items-center justify-center">
            <div
              className="relative grid size-44 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--brand) 0 ${completedPercent}%, var(--surface-muted) ${completedPercent}% 100%)` }}
            >
              <div className="grid size-32 place-items-center rounded-full bg-[var(--surface)] text-center shadow-inner">
                <div>
                  <div className="text-3xl font-bold tracking-[-0.04em]">{completedPercent}%</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">concluído</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--surface-muted)] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><CircleDot size={13} className="text-[var(--brand)]" /> Pendentes</div>
              <div className="mt-2 text-xl font-semibold">{summary.data?.data.tasks.pending ?? 0}</div>
            </div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-3">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><CheckCircle2 size={13} className="text-[var(--success)]" /> Concluídas</div>
              <div className="mt-2 text-xl font-semibold">{summary.data?.data.tasks.completed ?? 0}</div>
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <SectionTitle title="Precisam de atenção" description="Tarefas bloqueadas ou com prazo vencido." action={<Link href="/tasks" className="text-xs font-semibold text-[var(--brand)]">Abrir fila</Link>} />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {attentionTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-4">
                <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${task.status === 'BLOCKED' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--warning-soft)] text-[var(--warning)]'}`}>
                  {task.status === 'BLOCKED' ? <ShieldAlert size={17} /> : <AlertTriangle size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{task.title}</div>
                  <div className="mt-1 truncate text-xs text-[var(--muted)]">{task.projectName} · {formatCompactDate(task.dueAt)}</div>
                </div>
                <Badge tone={statusTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
              </div>
            ))}
            {!tasks.isPending && attentionTasks.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 size={28} className="text-[var(--success)]" />
                <div className="mt-3 text-sm font-semibold">Operação em dia</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Nenhuma tarefa exige atenção imediata.</div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <SectionTitle title="Atividade recente" description="Últimas alterações registradas no workspace." action={<Link href="/audit" className="text-xs font-semibold text-[var(--brand)]">Ver auditoria</Link>} />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {audit.data?.data.slice(0, 5).map((event) => (
              <div key={event.id} className="flex gap-3 px-5 py-4">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><CircleDot size={14} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{humanizeAction(event.action)}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                    <span>{event.entityType}</span><span>•</span><span>{formatDateTime(event.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!audit.isPending && !audit.data?.data.length ? <div className="p-8 text-center text-sm text-[var(--muted)]">Sem eventos disponíveis.</div> : null}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
