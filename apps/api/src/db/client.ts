import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg, { type PoolClient } from 'pg';

import { env } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export type Database = NodePgDatabase<typeof schema>;

export async function withTenant<T>(
  tenantId: string,
  callback: (tenantDb: Database) => Promise<T>,
): Promise<T> {
  return withTenantClient(tenantId, async (client) => {
    const tenantDb = drizzle(client, { schema });
    return callback(tenantDb);
  });
}

export async function withTenantClient<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
