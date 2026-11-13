import type { Request, Response } from "express";
import { getHealthStatus } from "../services/health.service";

export const healthCheck = (_req: Request, res: Response) => {
  const result = getHealthStatus();
  res.json(result);
};