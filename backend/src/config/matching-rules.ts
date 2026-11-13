// Initial rules transcribed from docs/matching-engine-spec.md, not calibrated football standards.
export const matchingRules = {
  engineVersion: "matching-v1",
  financial: { feeIntercept: 200, feeSlope: 120, salaryMultiplier: 160, salaryCeilingRatio: 1.5, contractMonths: 60 },
  positionScores: { primary: 100, secondary: 80, group: 50, other: 0 },
  squadAge: [{ min: 15, score: 80 }, { min: 20, score: 90 }, { min: 25, score: 100 }, { min: 31, score: 80 }, { min: 35, score: 70 }],
  resaleAge: [{ min: 15, score: 100 }, { min: 21, score: 90 }, { min: 25, score: 80 }, { min: 28, score: 60 }, { min: 31, score: 40 }, { min: 34, score: 20 }],
  minutes: [{ min: 0, score: 60 }, { min: 450, score: 70 }, { min: 900, score: 80 }, { min: 1500, score: 90 }, { min: 2000, score: 100 }],
  formCapBonus: 20,
  benchmarkAnchorScore: 80,
  roles: {
    ST: { minutesWeight: 0.2, metrics: { goals: { weight: 0.5, a: 0.6, b: 1 }, assists: { weight: 0.2, a: 0.2, b: 0.4 }, keyPasses: { weight: 0.1, a: 1, b: 2 } } },
    WING: { minutesWeight: 0.2, metrics: { goals: { weight: 0.3, a: 0.4, b: 0.7 }, assists: { weight: 0.25, a: 0.25, b: 0.5 }, keyPasses: { weight: 0.25, a: 1.5, b: 3 } } },
    CAM: { minutesWeight: 0.2, metrics: { goals: { weight: 0.15, a: 0.2, b: 0.4 }, assists: { weight: 0.25, a: 0.3, b: 0.6 }, keyPasses: { weight: 0.4, a: 2, b: 3.5 } } },
    CM: { minutesWeight: 0.2, metrics: { keyPasses: { weight: 0.3, a: 1.5, b: 3 }, passesCompleted: { weight: 0.3, a: 50, b: 75 }, interceptions: { weight: 0.2, a: 1, b: 2 } } },
    CDM: { minutesWeight: 0.2, metrics: { tacklesWon: { weight: 0.3, a: 2, b: 3.5 }, interceptions: { weight: 0.3, a: 1.5, b: 3 }, passesCompleted: { weight: 0.2, a: 50, b: 75 } } },
    CB: { minutesWeight: 0.2, metrics: { tacklesWon: { weight: 0.25, a: 1.2, b: 2.5 }, interceptions: { weight: 0.35, a: 1.2, b: 2.5 }, passesCompleted: { weight: 0.2, a: 45, b: 70 } } },
    FULLBACK: { minutesWeight: 0.2, metrics: { assists: { weight: 0.2, a: 0.15, b: 0.35 }, keyPasses: { weight: 0.25, a: 1, b: 2 }, tacklesWon: { weight: 0.35, a: 1.5, b: 3 } } },
  },
  injury: [{ max: 30, score: 100 }, { max: 90, score: 80 }, { max: 180, score: 60 }, { max: 270, score: 40 }, { max: null, score: 20 }],
  ongoingInjuryCap: 50,
  injuryLookbackYears: 2,
  resale: { changeBase: 50, changeMultiplier: 2, trendWeight: 0.6, ageWeight: 0.4, lookbackMonths: 12 },
};

export const matchingTemplate = () => ({
  name: "Matching theo đặc tả", version: 1,
  financialWeight: 0.4, squadWeight: 0.4, riskWeight: 0.2,
  criteriaWeights: { financial: { fee: 0.45, salary: 0.35, contract: 0.2 }, squad: { position: null, age: null, form: null }, risk: { injury: null, resale: null } },
  parameters: { ...structuredClone(matchingRules), positionGroups: [] as string[][], completedSeasons: [] as string[] },
  instructions: [
    "Điền trọng số squad.position/age/form và risk.injury/resale; mỗi nhóm có tổng 1. Không có giá trị mặc định cho phần chưa chốt.",
    "Điền positionGroups theo nhóm vị trí đã thống nhất; để rỗng thì trường hợp cần so nhóm sẽ báo thiếu cấu hình.",
    "Điền completedSeasons với các mùa đã kết thúc. Mùa ngoài danh sách không dùng các mốc phút tuyệt đối.",
    "Bỏ instructions khi POST /api/scoring-configs. Tạo phiên bản rồi kích hoạt qua API cấu hình.",
  ],
});
