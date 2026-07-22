import { describe, expect, it } from 'vitest';

import { canTransitionProject } from '../src/domain/project-status.js';

describe('project status transitions', () => {
  it('allows the normal implementation flow', () => {
    expect(canTransitionProject('DRAFT', 'PLANNING')).toBe(true);
    expect(canTransitionProject('PLANNING', 'EXECUTING')).toBe(true);
    expect(canTransitionProject('EXECUTING', 'HOMOLOGATION')).toBe(true);
  });

  it('blocks invalid transitions', () => {
    expect(canTransitionProject('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionProject('COMPLETED', 'PLANNING')).toBe(false);
  });

  it('allows an authorized forced transition', () => {
    expect(canTransitionProject('DRAFT', 'COMPLETED', true)).toBe(true);
  });
});
