import { z } from 'zod';

export const projectStatusSchema = z.enum([
  'DRAFT',
  'PLANNING',
  'EXECUTING',
  'HOMOLOGATION',
  'PILOT',
  'PRODUCTION_APPROVAL',
  'PRODUCTION_DEPLOYMENT',
  'ASSISTED_OPERATION',
  'COMPLETED',
  'BLOCKED',
  'SUSPENDED',
  'CANCELLED',
  'REJECTED',
]);

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type Priority = z.infer<typeof prioritySchema>;

export const createCustomerSchema = z.object({
  code: z.string().min(2).max(50),
  legalName: z.string().min(2).max(200),
  tradeName: z.string().max(200).nullable().optional(),
  taxIdentifier: z.string().max(40).nullable().optional(),
});

export const createProjectSchema = z.object({
  customerId: z.string().uuid(),
  code: z.string().min(2).max(60),
  name: z.string().min(3).max(200),
  description: z.string().max(20_000).nullable().optional(),
  managerUserId: z.string().uuid(),
  priority: prioritySchema.default('MEDIUM'),
  criticality: prioritySchema.default('MEDIUM'),
  plannedStartAt: z.string().datetime().nullable().optional(),
  plannedEndAt: z.string().datetime().nullable().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(220),
  description: z.string().max(20_000).nullable().optional(),
  priority: prioritySchema.default('MEDIUM'),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
});

export interface ApiMeta {
  requestId: string;
  correlationId: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiListEnvelope<T> extends ApiEnvelope<T[]> {
  pagination: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}
