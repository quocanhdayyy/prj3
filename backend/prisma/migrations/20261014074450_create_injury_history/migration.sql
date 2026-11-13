-- CreateTable
CREATE TABLE "injury_histories" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "injury_type" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,

    CONSTRAINT "injury_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "injury_histories_player_id_idx" ON "injury_histories"("player_id");

-- AddForeignKey
ALTER TABLE "injury_histories" ADD CONSTRAINT "injury_histories_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An unresolved injury has no end date; resolved dates cannot precede the start.
ALTER TABLE "injury_histories" ADD CONSTRAINT "injury_dates_valid"
CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
