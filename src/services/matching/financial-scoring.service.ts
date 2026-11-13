import { Prisma } from "../../generated/prisma/client";
import { financialScoring as config } from "../../config/financial-scoring";
import { InputError } from "../../utils/api-validation";

type Decimal = Prisma.Decimal;
export type FinancialInputs = {
  budget: Decimal;
  salaryLimit: Decimal;
  estimatedFee: Decimal | null;
  expectedSalaryPerYear: Decimal | null;
  remainingMonths: Decimal | null;
};
const clamp = (value: Decimal) => Prisma.Decimal.max(0, Prisma.Decimal.min(100, value));
const rounded = (value: Decimal | null) => value === null ? null : value.toDecimalPlaces(2).toNumber();

export type FinancialParameters = {
  feeIntercept: number; feeSlope: number; salaryMultiplier: number; salaryCeilingRatio: number; contractMonths: number;
};
export const financialRawScores = (input: FinancialInputs, settings: FinancialParameters) => {
  for (const field of ["budget", "salaryLimit"] as const) {
    if (!input[field].isFinite() || input[field].lte(0)) throw new InputError(`${field} phải lớn hơn 0 để tính điểm F.`);
  }
  for (const field of ["estimatedFee", "expectedSalaryPerYear", "remainingMonths"] as const) {
    const value = input[field];
    if (value !== null && (!value.isFinite() || value.lt(0))) throw new InputError(`${field} phải không âm hoặc null nếu chưa biết.`);
  }
  const fee = input.estimatedFee === null ? null : clamp(new Prisma.Decimal(settings.feeIntercept)
    .sub(new Prisma.Decimal(settings.feeSlope).mul(input.estimatedFee).div(input.budget)));
  const salary = input.expectedSalaryPerYear === null ? null : clamp(new Prisma.Decimal(settings.salaryMultiplier)
    .mul(new Prisma.Decimal(settings.salaryCeilingRatio).sub(input.expectedSalaryPerYear.div(input.salaryLimit))));
  const contract = input.remainingMonths === null ? null : clamp(new Prisma.Decimal(100)
    .sub(new Prisma.Decimal(100).mul(input.remainingMonths).div(settings.contractMonths)));
  return { fee, salary, contract };
};
export const calculateFinancialFit = (input: FinancialInputs) => {
  const { fee, salary, contract } = financialRawScores(input, {
    feeIntercept: Number(config.fee.intercept), feeSlope: Number(config.fee.slope),
    salaryMultiplier: Number(config.salary.multiplier), salaryCeilingRatio: Number(config.salary.ceilingRatio), contractMonths: Number(config.contract.horizonMonths),
  });
  const component = (score: Decimal | null, weight: string) => ({
    score: rounded(score), weight: Number(weight), contribution: rounded(score === null ? null : score.mul(weight)),
  });
  const missing = (["estimatedFee", "expectedSalaryPerYear", "remainingMonths"] as const).filter(field => input[field] === null);
  // Sum full-precision, clamped scores; round only the response, never an intermediate calculation.
  const total = fee !== null && salary !== null && contract !== null
    ? fee.mul(config.weights.fee).add(salary.mul(config.weights.salary)).add(contract.mul(config.weights.contract)) : null;
  return {
    configVersion: config.version,
    complete: missing.length === 0,
    financialScore: rounded(total),
    missing,
    inputs: {
      budget: input.budget.toString(), salaryLimit: input.salaryLimit.toString(),
      estimatedFee: input.estimatedFee?.toString() ?? null,
      expectedSalaryPerYear: input.expectedSalaryPerYear?.toString() ?? null,
      remainingMonths: input.remainingMonths?.toString() ?? null,
    },
    components: {
      fee: component(fee, config.weights.fee), salary: component(salary, config.weights.salary),
      contract: component(contract, config.weights.contract),
    },
    saved: false,
  };
};

const dayMs = 86400000;
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const shiftMonths = (date: Date, months: number) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return start;
};

// Whole calendar months plus the fraction of the next calendar-month interval.
// Month-end anchors clamp to the last valid day; no fixed 30-day-month assumption.
export const remainingContractMonths = (asOf: Date, end: Date): Decimal => {
  const start = utcDay(asOf); const finish = utcDay(end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(finish.getTime())) throw new InputError("Ngày tính thời hạn hợp đồng không hợp lệ.");
  if (finish <= start) return new Prisma.Decimal(0);
  let whole = (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + finish.getUTCMonth() - start.getUTCMonth();
  if (shiftMonths(start, whole) > finish) whole--;
  const anchor = shiftMonths(start, whole); const next = shiftMonths(start, whole + 1);
  return new Prisma.Decimal(whole).add(new Prisma.Decimal((finish.getTime() - anchor.getTime()) / dayMs)
    .div((next.getTime() - anchor.getTime()) / dayMs));
};
