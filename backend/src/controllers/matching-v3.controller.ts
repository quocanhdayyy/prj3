import { endpoint } from "../utils/api-handler";
import { ENGINE_VERSION, IMPLEMENTATION_STAGE, SCORING_AVAILABLE, matrixVersion, v3Template, defaultOptions, roles, strategies, policies, inputMetrics } from "../services/matching/v3/config";

// Stage 1 exposes configuration/input contracts only. Scoring is not enabled.
export const templateV3 = endpoint(async (_req, res) => {
  res.json({ status: "success", data: {
    engineVersion: ENGINE_VERSION, implementationStage: IMPLEMENTATION_STAGE, scoringAvailable: SCORING_AVAILABLE,
    matrixVersion, config: v3Template(), options: defaultOptions, roles, strategies, inputMetrics, policies,
  } });
});
