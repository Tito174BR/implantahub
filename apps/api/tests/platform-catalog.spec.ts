import { describe, expect, it } from 'vitest';

import { platformResources } from '../src/modules/platform/catalog.js';

describe('platform resource catalog', () => {
  it('has unique keys, paths and concrete tables', () => {
    expect(new Set(platformResources.map((item) => item.key)).size).toBe(platformResources.length);
    expect(new Set(platformResources.map((item) => item.path)).size).toBe(platformResources.length);
    expect(new Set(platformResources.map((item) => item.table)).size).toBe(platformResources.length);
  });

  it('does not expose sensitive values as ordinary fields', () => {
    const sensitive = platformResources.flatMap((resource) =>
      resource.fields.filter((field) => field.sensitive).map((field) => ({ resource: resource.key, field })),
    );
    expect(sensitive.length).toBeGreaterThanOrEqual(2);
    expect(sensitive.every((item) => ['hash', 'encrypt', 'redact'].includes(item.field.sensitive!))).toBe(true);
  });

  it('declares required ownership fields for project resources', () => {
    const projectScoped = platformResources.filter((resource) => resource.filters.includes('projectId'));
    expect(projectScoped.length).toBeGreaterThan(10);
    for (const resource of projectScoped) {
      expect(resource.fields.some((field) => field.api === 'projectId')).toBe(true);
    }
  });
});
