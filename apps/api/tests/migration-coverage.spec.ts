import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { platformResources } from '../src/modules/platform/catalog.js';

describe('full platform migration', () => {
  it('creates every concrete resource table and enables RLS', async () => {
    const migration = await readFile(resolve(process.cwd(), 'migrations/0002_full_platform.sql'), 'utf8');
    for (const resource of platformResources) {
      expect(migration).toContain(`app.${resource.table}`);
    }
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('tenant_id = app.current_tenant_id()');
  });
});
