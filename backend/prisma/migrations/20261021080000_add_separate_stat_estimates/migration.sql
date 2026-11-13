CREATE TABLE "player_stats_estimates" (
    "stats_id" INTEGER NOT NULL,
    "method" VARCHAR(100) NOT NULL,
    "values" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "player_stats_estimates_pkey" PRIMARY KEY ("stats_id"),
    CONSTRAINT "player_stats_estimates_stats_id_fkey" FOREIGN KEY ("stats_id") REFERENCES "player_stats"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
