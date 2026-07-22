export interface ApiMeta {
  requestId: string;
  correlationId: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiListEnvelope<T> extends ApiEnvelope<T[]> {
  pagination?: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
}

export interface DirectoryUser extends UserSummary {
  role: 'ADMIN' | 'MANAGER' | 'ANALYST' | 'CUSTOMER';
}

export interface Customer {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  taxIdentifier: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  tenantId?: string;
  customerId: string;
  customerName?: string;
  customerLegalName?: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  criticality: string;
  managerUserId: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  assigneeUserId: string | null;
  completedAt: string | null;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardSummary {
  projects: {
    total: number;
    active: number;
    blocked: number;
    completed: number;
  };
  tasks: {
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  };
  generatedAt: string;
}
