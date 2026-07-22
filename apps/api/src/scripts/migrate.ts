import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { env } from '../config/env.js';

const { Client } = pg;
const migrationUrl = env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL;
const client = new Client({ connectionString: migrationUrl });

const currentFile = fileURLToPath(import.meta.url);
const migrationsDir = resolve(dirname(currentFile), '../../migrations');

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      executed_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const applied = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
      [filename],
    );
    if (applied.rowCount) continue;

    const sql = await readFile(resolve(migrationsDir, filename), 'utf8');
    console.log(`Applying ${filename}`);

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migrations(filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Migrations completed');
} finally {
  await client.end();
}
