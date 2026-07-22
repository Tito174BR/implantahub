import { randomUUID } from 'node:crypto';

import type { Database } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

interface AuditInput {
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(
  tenantDb: Database,
  input: AuditInput,
): Promise<void> {
  await tenantDb.insert(auditEvents).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    correlationId: input.correlationId,
    metadata: input.metadata ?? {},
  });
}
