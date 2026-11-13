// Trial configuration approved for F only; it does not activate a full ScoringConfig.
export const financialScoring = {
  version: "financial-trial-v1",
  weights: { fee: "0.45", salary: "0.35", contract: "0.20" },
  fee: { intercept: "200", slope: "120" },
  salary: { multiplier: "160", ceilingRatio: "1.5" },
  contract: { horizonMonths: "60" },
} as const;
