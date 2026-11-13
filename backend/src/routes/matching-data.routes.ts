import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware";
import * as controller from "../controllers/matching-data.controller";

export const marketValueHistoryRoutes = Router();
marketValueHistoryRoutes.use(requireAuth);
marketValueHistoryRoutes.get("/", controller.listValuations);
marketValueHistoryRoutes.get("/:id", controller.valuationDetail);
marketValueHistoryRoutes.post("/", requireAdmin, controller.createValuation);
marketValueHistoryRoutes.patch("/:id", requireAdmin, controller.updateValuation);
marketValueHistoryRoutes.delete("/:id", requireAdmin, controller.removeValuation);

export const matchingInputRoutes = Router();
matchingInputRoutes.use(requireAuth);
matchingInputRoutes.get("/", controller.listEstimates);
matchingInputRoutes.get("/:id", controller.estimateDetail);
matchingInputRoutes.post("/", controller.createEstimate);
matchingInputRoutes.patch("/:id", controller.updateEstimate);
matchingInputRoutes.delete("/:id", controller.removeEstimate);

export const playerDataVerificationRoutes = Router();
playerDataVerificationRoutes.use(requireAuth);
playerDataVerificationRoutes.get("/", controller.listVerifications);
playerDataVerificationRoutes.get("/:playerId", controller.verificationDetail);
// Each supplied section replaces that complete section; omitted sections are retained.
playerDataVerificationRoutes.patch("/:playerId", requireAdmin, controller.saveVerification);
playerDataVerificationRoutes.delete("/:playerId", requireAdmin, controller.removeVerification);
