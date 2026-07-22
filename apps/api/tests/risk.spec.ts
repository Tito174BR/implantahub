import { describe, expect, it } from 'vitest';

import { calculateRiskLevel } from '../src/domain/risk.js';

describe('risk level', () => {
  it('calculates the expected matrix', () => {
    expect(calculateRiskLevel(1, 1)).toBe('LOW');
    expect(calculateRiskLevel(2, 3)).toBe('MODERATE');
    expect(calculateRiskLevel(3, 4)).toBe('HIGH');
    expect(calculateRiskLevel(5, 5)).toBe('CRITICAL');
  });

  it('rejects values outside the matrix', () => {
    expect(() => calculateRiskLevel(0, 5)).toThrow('RISK_PROBABILITY_OUT_OF_RANGE');
  });
});
