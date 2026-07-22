import { randomUUID } from 'node:crypto';

import type { Database } from '../db/client.js';
import { outboxEvents } from '../db/schema.js';

interface OutboxInput {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export async function addOutboxEvent(
  tenantDb: Database,
  input: OutboxInput,
): Promise<void> {
  await tenantDb.insert(outboxEvents).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    eventVersion: 1,
    payload: input.payload,
    correlationId: input.correlationId,
  });
}
