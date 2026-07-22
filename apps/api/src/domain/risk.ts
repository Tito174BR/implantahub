export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export function calculateRiskLevel(probability: number, impact: number): RiskLevel {
  if (!Number.isInteger(probability) || probability < 1 || probability > 5) {
    throw new Error('RISK_PROBABILITY_OUT_OF_RANGE');
  }
  if (!Number.isInteger(impact) || impact < 1 || impact > 5) {
    throw new Error('RISK_IMPACT_OUT_OF_RANGE');
  }

  const score = probability * impact;
  if (score >= 20) return 'CRITICAL';
  if (score >= 12) return 'HIGH';
  if (score >= 6) return 'MODERATE';
  return 'LOW';
}
