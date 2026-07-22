import type { ProjectStatus } from '@implantahub/contracts';

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED'],
  PLANNING: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['HOMOLOGATION', 'BLOCKED', 'SUSPENDED', 'CANCELLED'],
  HOMOLOGATION: ['PILOT', 'EXECUTING', 'BLOCKED', 'SUSPENDED'],
  PILOT: ['PRODUCTION_APPROVAL', 'EXECUTING', 'BLOCKED', 'SUSPENDED'],
  PRODUCTION_APPROVAL: ['PRODUCTION_DEPLOYMENT', 'HOMOLOGATION', 'CANCELLED'],
  PRODUCTION_DEPLOYMENT: ['ASSISTED_OPERATION', 'BLOCKED'],
  ASSISTED_OPERATION: ['COMPLETED', 'BLOCKED'],
  COMPLETED: ['EXECUTING'],
  BLOCKED: ['EXECUTING', 'HOMOLOGATION', 'PILOT', 'PRODUCTION_DEPLOYMENT'],
  SUSPENDED: ['EXECUTING', 'CANCELLED'],
  CANCELLED: [],
  REJECTED: ['EXECUTING', 'CANCELLED'],
};

export function canTransitionProject(
  current: ProjectStatus,
  target: ProjectStatus,
  force = false,
): boolean {
  return force || transitions[current].includes(target);
}

export function assertProjectTransition(
  current: ProjectStatus,
  target: ProjectStatus,
  force = false,
): void {
  if (!canTransitionProject(current, target, force)) {
    throw new Error(`PROJECT_INVALID_STATUS_TRANSITION:${current}:${target}`);
  }
}
