ALTER TABLE "injury_histories" ADD COLUMN "body_region" VARCHAR(50);
ALTER TABLE "player_stats" ADD COLUMN "position_minutes" JSONB,
    ADD COLUMN "position_minutes_source" VARCHAR(255);
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_position_minutes_source_check"
    CHECK ((position_minutes IS NULL AND position_minutes_source IS NULL)
        OR (jsonb_typeof(position_minutes) = 'object' AND position_minutes_source IS NOT NULL AND length(trim(position_minutes_source)) > 0));
CREATE TABLE "role_score_snapshots" (
    "stats_id" INTEGER NOT NULL,
    "config_hash" VARCHAR(64) NOT NULL,
    "dataset_hash" VARCHAR(64) NOT NULL,
    "matrix_version" VARCHAR(100) NOT NULL,
    "values" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("stats_id", "config_hash"),
    FOREIGN KEY ("stats_id") REFERENCES "player_stats"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "role_score_snapshots_dataset_hash_idx" ON "role_score_snapshots"("dataset_hash");
-- Zero-weight pillars may remain unknown. Historical V1 rows are unchanged.
ALTER TABLE "match_results" ALTER COLUMN "financial_score" DROP NOT NULL,
    ALTER COLUMN "squad_score" DROP NOT NULL, ALTER COLUMN "risk_score" DROP NOT NULL;
