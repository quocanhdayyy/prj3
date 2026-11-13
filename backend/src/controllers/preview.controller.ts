import { Prisma } from "../generated/prisma/client";
import { ownerScope } from "../middleware/auth.middleware";
import { endpoint } from "../utils/api-handler";
import { InputError, readInteger, readMoney, readObject, readText } from "../utils/api-validation";
import { normalizePositionCode, playerPositions } from "../config/player-positions";
import { decimal } from "../services/matching/matching-scoring.service";
import { calculateFinancialFit } from "../services/matching/financial-scoring.service";
import { evaluateFinancialFit } from "../services/matching/financial-evaluation.service";
import { previewSquad } from "../services/matching/squad-preview.service";
import type { SquadPreviewInput } from "../services/matching/squad-preview.service";
import { evaluateRiskDemo, evaluateRiskPreview, listRiskDemos, simulateRiskPreview } from "../services/matching/risk-preview.service";
import type { RiskWeights } from "../services/matching/risk-preview.service";

// Financial previews
export const financialPreview = endpoint(async (req, res) => {
  const input = readObject(req.body, ["budget", "salaryLimit", "estimatedFee", "expectedSalaryPerYear", "remainingMonths"]);
  const months = input.remainingMonths;
  if (months !== undefined && months !== null && (typeof months !== "number" || !Number.isFinite(months) || months < 0)) {
    throw new InputError("remainingMonths phải là số không âm, cho phép số lẻ, hoặc null nếu chưa biết.");
  }
  const data = calculateFinancialFit({
    budget: readMoney(input.budget, "budget"), salaryLimit: readMoney(input.salaryLimit, "salaryLimit"),
    estimatedFee: input.estimatedFee == null ? null : readMoney(input.estimatedFee, "estimatedFee"),
    expectedSalaryPerYear: input.expectedSalaryPerYear == null ? null : readMoney(input.expectedSalaryPerYear, "expectedSalaryPerYear"),
    remainingMonths: months == null ? null : new Prisma.Decimal(months as number),
  });
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: { mode: "preview", ...data } });
});
export const financialEvaluate = endpoint(async (req, res) => {
  const input = readObject(req.body, ["playerId", "requirementId"]);
  const data = await evaluateFinancialFit(readInteger(input.playerId, "playerId", 1), readInteger(input.requirementId, "requirementId", 1), ownerScope(res));
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data });
});

// Squad preview
export const squadPreview = endpoint(async (req, res) => {
  const body = readObject(req.body, ["playerId", "season", "requiredPosition", "weights"]);
  const input: SquadPreviewInput = { playerId: readInteger(body.playerId, "playerId", 1), season: readText(body.season, "season", 20) };
  if (body.requiredPosition !== undefined) {
    const position = normalizePositionCode(readText(body.requiredPosition, "requiredPosition", 50));
    if (!playerPositions.includes(position)) throw new InputError("Vị trí không hợp lệ.");
    input.requiredPosition = position;
  }
  if (body.weights !== undefined) {
    const weights = readObject(body.weights, ["position", "age", "form"]);
    for (const key of ["position", "age", "form"]) {
      const value = weights[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new InputError("Điền đủ ba trọng số S từ 0 đến 100, tổng bằng 100%.");
    }
    const { position, age, form } = weights as NonNullable<SquadPreviewInput["weights"]>;
    if (!decimal(position).add(age).add(form).equals(100)) throw new InputError("Tổng ba trọng số S phải bằng 100%.");
    input.weights = { position, age, form };
  }
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await previewSquad(input) });
});

// Risk previews and explicit DEMO
const readWeights = (value: unknown): RiskWeights | undefined => {
  if (value === undefined) return undefined;
  const w = readObject(value, ["injury", "resale"]);
  for (const k of ["injury", "resale"]) if (typeof w[k] !== "number" || !Number.isFinite(w[k]) || (w[k] as number) < 0 || (w[k] as number) > 100) throw new InputError("Điền đủ hai trọng số R từ 0 đến 100%, tổng bằng 100%.");
  const { injury, resale } = w as RiskWeights;
  if (!decimal(injury).add(resale).equals(100)) throw new InputError("Tổng hai trọng số R phải bằng 100%.");
  return { injury, resale };
};
export const riskDemoList = endpoint(async (_req, res) => {
  res.set("Cache-Control", "no-store"); res.json({ status: "success", data: await listRiskDemos() });
});
export const riskDemo = endpoint(async (req, res) => {
  const b = readObject(req.body, ["demoId", "weights", "valuationSource"]);
  const weights = readWeights(b.weights);
  const data = await evaluateRiskDemo({ demoId: readText(b.demoId, "demoId", 50), ...(weights ? { weights } : {}),
    ...(b.valuationSource === undefined ? {} : { valuationSource: readText(b.valuationSource, "valuationSource", 255) }) });
  res.set("Cache-Control", "no-store"); res.json({ status: "success", data });
});
export const riskEvaluate = endpoint(async (req, res) => {
  const b = readObject(req.body, ["playerId", "valuationSource", "weights"]);
  const weights = readWeights(b.weights);
  const result = await evaluateRiskPreview({ playerId: readInteger(b.playerId, "playerId", 1), ...(weights ? { weights } : {}),
    ...(b.valuationSource === undefined ? {} : { valuationSource: readText(b.valuationSource, "valuationSource", 255) }) });
  res.set("Cache-Control", "no-store"); res.json({ status: "success", data: result });
});
export const riskPreview = endpoint(async (req, res) => {
  const b = readObject(req.body, ["age", "daysMissed", "ongoing", "currentValue", "priorValue", "weights"]);
  const age = b.age == null ? null : readInteger(b.age, "age", 15);
  if (age !== null && age > 100) throw new InputError("Tuổi thử phải từ 15 đến 100.");
  const daysMissed = b.daysMissed == null ? null : readInteger(b.daysMissed, "daysMissed");
  if (daysMissed !== null && daysMissed > 731) throw new InputError("Số ngày nghỉ trong hai năm tối đa 731 ngày.");
  if (typeof b.ongoing !== "boolean") throw new InputError("ongoing phải là boolean, cho biết có đang chấn thương hay không.");
  const weights = readWeights(b.weights);
  const data = simulateRiskPreview({ age, daysMissed, ongoing: b.ongoing,
    currentValue: b.currentValue == null ? null : readMoney(b.currentValue, "currentValue").toString(),
    priorValue: b.priorValue == null ? null : readMoney(b.priorValue, "priorValue").toString(), ...(weights ? { weights } : {}) });
  res.set("Cache-Control", "no-store"); res.json({ status: "success", data });
});
