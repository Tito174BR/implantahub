const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const compactDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem prazo';
  return dateFormatter.format(new Date(value));
}

export function formatCompactDate(value: string | null | undefined): string {
  if (!value) return 'Sem prazo';
  return compactDateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFormatter.format(new Date(value));
}

export function isOverdue(value: string | null | undefined, status?: string): boolean {
  if (!value || status === 'COMPLETED' || status === 'CANCELLED') return false;
  return new Date(value).getTime() < Date.now();
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function humanizeAction(action: string): string {
  const labels: Record<string, string> = {
    'customer.created': 'Cliente criado',
    'customer.updated': 'Cliente atualizado',
    'project.created': 'Projeto criado',
    'project.updated': 'Projeto atualizado',
    'project.status-changed': 'Status do projeto alterado',
    'task.created': 'Tarefa criada',
    'task.status-changed': 'Status da tarefa alterado',
    'auth.login': 'Login realizado',
    'auth.logout': 'Sessão encerrada',
  };
  return labels[action] ?? action.replaceAll('.', ' · ');
}
