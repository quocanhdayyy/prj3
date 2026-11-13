import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { ownerWhere, requireFound } from "../../utils/api-handler";
import { calculateFinancialFit, remainingContractMonths } from "./financial-scoring.service";

export const evaluateFinancialFit = (playerId: number, requirementId: number, userId?: number) => prisma.$transaction(async tx => {
  // Check private requirement ownership before returning any associated data.
  const requirement = requireFound(await tx.clubRequirement.findFirst({ where: { id: requirementId, ...ownerWhere(userId) } }));
  const player = requireFound(await tx.player.findUnique({ where: { id: playerId }, select: { id: true, name: true } }));
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const asOf = new Date(`${date}T00:00:00.000Z`);
  const estimate = await tx.matchingInput.findUnique({ where: { requirementId_playerId: { requirementId, playerId } } });
  const contract = await tx.contract.findFirst({ where: {
    playerId, status: "ACTIVE", startDate: { lte: asOf }, endDate: { gte: asOf },
  }});
  const verification = contract ? null : await tx.playerDataVerification.findUnique({ where: { playerId } });
  // An old FREE_AGENT assertion is not proof of today's status. Missing contract rows are not proof either.
  const confirmedFreeAgent = verification?.registrationStatus === "FREE_AGENT"
    && verification.registrationAsOf?.getTime() === asOf.getTime();
  const remainingMonths = contract ? remainingContractMonths(asOf, contract.endDate)
    : confirmedFreeAgent ? new Prisma.Decimal(0) : null;
  const calculation = calculateFinancialFit({
    budget: requirement.budget, salaryLimit: requirement.salaryLimit,
    estimatedFee: estimate?.estimatedFee ?? null, expectedSalaryPerYear: estimate?.expectedSalaryPerYear ?? null,
    remainingMonths,
  });
  const notes: string[] = [];
  if (calculation.missing.includes("estimatedFee")) notes.push("Chưa có phí mua dự kiến; không tự lấy giá trị thị trường hoặc phí chuyển nhượng cũ.");
  if (calculation.missing.includes("expectedSalaryPerYear")) notes.push("Chưa có lương năm dự kiến; không tự thay bằng lương hợp đồng hiện tại.");
  if (remainingMonths === null) notes.push("Chưa có hợp đồng ACTIVE tại ngày đánh giá hoặc xác nhận tự do đúng ngày để tính thời hạn còn lại.");
  return {
    mode: "database", player, requirementId, evaluatedOn: date, ...calculation,
    sources: {
      matchingInputId: estimate?.id ?? null,
      feeSource: estimate?.feeSource ?? null, salarySource: estimate?.salarySource ?? null,
      contractId: contract?.id ?? null, contractEndDate: contract?.endDate.toISOString().slice(0, 10) ?? null,
      contractBasis: contract ? "ACTIVE_CONTRACT" : confirmedFreeAgent ? "VERIFIED_FREE_AGENT_TODAY" : "UNKNOWN",
      registrationSource: confirmedFreeAgent ? verification?.registrationSource ?? null : null,
    },
    notes,
  };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
