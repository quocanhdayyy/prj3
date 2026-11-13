import { prisma } from "../../config/prisma";
import { matchingRules } from "../../config/matching-rules";
import type { EngineRules } from "./matching-config";
import { combine, decimal, display, playerAge, scoreBand, scoreForm, scorePosition } from "./matching-scoring.service";
import { ApiError, requireFound } from "../../utils/api-handler";

export type SquadPreviewInput = {
  playerId: number; season: string; requiredPosition?: string;
  weights?: { position: number; age: number; form: number };
};

// Preview uses the agreed initial rules, independently of incomplete S/R configs.
// No unagreed position groups or S weights are invented or saved.
const rules: EngineRules = { ...structuredClone(matchingRules), positionGroups: [], completedSeasons: ["2025/2026"] };
export const previewSquad = async (input: SquadPreviewInput, now = new Date()) => {
  if (!rules.completedSeasons.includes(input.season)) throw new ApiError(409, "Bản thử hỗ trợ mùa đã kết thúc 2025/2026.");
  return prisma.$transaction(async tx => {
    const player = requireFound(await tx.player.findUnique({ where: { id: input.playerId },
      select: { id: true, name: true, dateOfBirth: true, position: true, secondaryPositions: true } }));
    const stats = await tx.playerStats.findUnique({ where: { playerId_season: { playerId: player.id, season: input.season } } });
    const asOf = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })}T00:00:00Z`);
    const age = playerAge(player.dateOfBirth, asOf);
    const requiredPosition = input.requiredPosition ?? player.position;
    const position = scorePosition(player.position, player.secondaryPositions, requiredPosition, rules);
    const form = scoreForm(stats, player.position, rules);
    const scores = { position: position.score, age: age === null ? null : scoreBand(age, rules.squadAge), form: form.score };
    const weights = input.weights ? Object.fromEntries(Object.entries(input.weights).map(([k, v]) => [k, decimal(v).div(100).toNumber()])) : null;
    const squadScore = weights ? combine(scores, weights) : null;
    const missing: string[] = [];
    if (!weights) missing.push("squad.weights");
    if (weights) for (const [key, weight] of Object.entries(weights)) {
      if (weight > 0 && scores[key as keyof typeof scores] === null) missing.push(`squad.${key}`);
    }
    return { player: { id: player.id, name: player.name, position: player.position, secondaryPositions: player.secondaryPositions, age },
      statsId: stats?.id ?? null, season: input.season, evaluatedOn: asOf.toISOString().slice(0, 10),
      rulesBasis: "AGREED_INITIAL_RULES_PREVIEW", engineVersion: rules.engineVersion,
      formRoleBasis: "PRIMARY", formRole: form.role, requiredPosition, positionBasis: position.basis,
      formScore: display(form.score), squadScore: display(squadScore),
      scores: { position: display(scores.position), age: display(scores.age), form: display(scores.form) },
      weights: input.weights ?? null, weightUnit: "PERCENT", complete: squadScore !== null, saved: false, missing,
      stats, form: form.details,
      notes: ["Điểm phong độ thuộc S; S còn gồm vị trí và tuổi. Tuổi tính tại ngày đánh giá.",
        "Dùng mốc và công thức khởi đầu đã chốt; các trọng số S nhập ở đây chỉ để thử, không thay cấu hình chính.",
        "Chưa khai báo nhóm vị trí ở bản thử: vị trí khác nhóm/chưa rõ nhóm sẽ báo thiếu, không tự gán 0/50.",
        "Thiếu chỉ số cần cho vai trò thì điểm phong độ giữ null. GK chưa có công thức phong độ."],
    };
  }, { isolationLevel: "RepeatableRead" });
};
