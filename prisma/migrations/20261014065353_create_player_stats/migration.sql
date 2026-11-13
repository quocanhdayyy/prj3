-- CreateTable
CREATE TABLE "player_stats" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "season" VARCHAR(20) NOT NULL,
    "appearances" INTEGER NOT NULL,
    "minutes_played" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "yellow_cards" INTEGER NOT NULL,
    "red_cards" INTEGER NOT NULL,
    "tackles_won" INTEGER,
    "interceptions" INTEGER,
    "key_passes" INTEGER,
    "passes_completed" INTEGER,
    "passes_attempted" INTEGER,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_player_id_season_key" ON "player_stats"("player_id", "season");

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
