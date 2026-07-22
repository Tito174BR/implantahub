export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const projectLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  PLANNING: 'Planejamento',
  EXECUTING: 'Em execução',
  HOMOLOGATION: 'Homologação',
  PILOT: 'Piloto',
  PRODUCTION_APPROVAL: 'Aprovação produção',
  PRODUCTION_DEPLOYMENT: 'Implantação produção',
  ASSISTED_OPERATION: 'Operação assistida',
  COMPLETED: 'Concluído',
  BLOCKED: 'Bloqueado',
  SUSPENDED: 'Suspenso',
  CANCELLED: 'Cancelado',
  REJECTED: 'Rejeitado',
};

const taskLabels: Record<string, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  BLOCKED: 'Bloqueada',
  CANCELLED: 'Cancelada',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export function projectStatusLabel(value: string): string {
  return projectLabels[value] ?? value;
}

export function taskStatusLabel(value: string): string {
  return taskLabels[value] ?? value;
}

export function priorityLabel(value: string): string {
  return priorityLabels[value] ?? value;
}

export function statusTone(value: string): Tone {
  if (['COMPLETED', 'ACTIVE', 'SUCCESS', 'APPROVED'].includes(value)) return 'success';
  if (['BLOCKED', 'CRITICAL', 'FAILED', 'REJECTED', 'CANCELLED'].includes(value)) return 'danger';
  if (['HOMOLOGATION', 'PILOT', 'HIGH', 'IN_PROGRESS'].includes(value)) return 'warning';
  if (['EXECUTING', 'PRODUCTION_DEPLOYMENT', 'ASSISTED_OPERATION'].includes(value)) return 'brand';
  if (['PLANNING', 'PRODUCTION_APPROVAL', 'MEDIUM'].includes(value)) return 'info';
  return 'neutral';
}

export const projectStageOrder = [
  'DRAFT',
  'PLANNING',
  'EXECUTING',
  'HOMOLOGATION',
  'PILOT',
  'PRODUCTION_APPROVAL',
  'PRODUCTION_DEPLOYMENT',
  'ASSISTED_OPERATION',
  'COMPLETED',
];

export const nextProjectStatus: Record<string, string | undefined> = {
  DRAFT: 'PLANNING',
  PLANNING: 'EXECUTING',
  EXECUTING: 'HOMOLOGATION',
  HOMOLOGATION: 'PILOT',
  PILOT: 'PRODUCTION_APPROVAL',
  PRODUCTION_APPROVAL: 'PRODUCTION_DEPLOYMENT',
  PRODUCTION_DEPLOYMENT: 'ASSISTED_OPERATION',
  ASSISTED_OPERATION: 'COMPLETED',
};

export function projectProgress(status: string): number {
  const index = projectStageOrder.indexOf(status);
  if (index < 0) return status === 'BLOCKED' ? 45 : 0;
  return Math.round((index / (projectStageOrder.length - 1)) * 100);
}
