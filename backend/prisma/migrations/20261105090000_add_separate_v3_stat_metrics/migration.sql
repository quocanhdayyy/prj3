CREATE TABLE "player_stats_metrics" (
    "stats_id" INTEGER NOT NULL,
    "method" VARCHAR(100) NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "values" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_stats_metrics_pkey" PRIMARY KEY ("stats_id")
);

ALTER TABLE "player_stats_metrics" ADD CONSTRAINT "player_stats_metrics_stats_id_fkey"
    FOREIGN KEY ("stats_id") REFERENCES "player_stats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
