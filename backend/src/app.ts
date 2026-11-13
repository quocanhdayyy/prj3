import express from "express";
import type { ErrorRequestHandler } from "express";
import path from "node:path";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import clubRoutes from "./routes/club.routes";
import playerRoutes from "./routes/player.routes";
import contractRoutes from "./routes/contract.routes";
import playerStatsRoutes from "./routes/player-stats.routes";
import injuryHistoryRoutes from "./routes/injury-history.routes";
import userRoutes from "./routes/user.routes";
import clubRequirementRoutes from "./routes/club-requirement.routes";
import shortlistRoutes from "./routes/shortlist.routes";
import authRoutes from "./routes/auth.routes";
import transferRoutes from "./routes/transfer.routes";
import shortlistListRoutes from "./routes/shortlist-list.routes";
import notificationRoutes from "./routes/notification.routes";
import scoringConfigRoutes from "./routes/scoring-config.routes";
import matchResultRoutes from "./routes/match-result.routes";
import auditLogRoutes from "./routes/audit-log.routes";
import { marketValueHistoryRoutes, matchingInputRoutes, playerDataVerificationRoutes } from "./routes/matching-data.routes";
import matchingRoutes from "./routes/matching.routes";

const app = express();

app.use(cors());
app.use(express.json());
const publicDirectory = path.join(__dirname, "../public");
app.use("/login-assets", express.static(publicDirectory, { index: false }));
app.get("/login", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(publicDirectory, "login.html"));
});
app.use("/api/auth", authRoutes);

app.use("/api/health", healthRoutes);
app.use("/api/clubs" , clubRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/player-stats", playerStatsRoutes);
app.use("/api/injury-history", injuryHistoryRoutes);
app.use("/api/users", userRoutes);
app.use("/api/club-requirements", clubRequirementRoutes);
app.use("/api/shortlists", shortlistRoutes);
app.use("/api/shortlist-items", shortlistRoutes);
app.use("/api/shortlist-lists", shortlistListRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/scoring-configs", scoringConfigRoutes);
app.use("/api/match-results", matchResultRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/market-value-history", marketValueHistoryRoutes);
app.use("/api/matching-inputs", matchingInputRoutes);
app.use("/api/player-data-verifications", playerDataVerificationRoutes);
app.use("/api/matching", matchingRoutes);
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const type = error && typeof error === "object" && "type" in error ? error.type : undefined;
  if (type === "entity.parse.failed") {
    res.status(400).json({ status: "error", message: "Body không phải JSON hợp lệ." }); return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ status: "error", message: "Body vượt kích thước cho phép." }); return;
  }
  res.status(500).json({ status: "error", message: "Không thể xử lý yêu cầu. Vui lòng thử lại." });
};
app.use(errorHandler);
export default app;
