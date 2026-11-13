-- Source identifiers prevent duplicate imports; existing local primary keys remain unchanged.
ALTER TABLE "clubs" ADD COLUMN "transfermarkt_id" INTEGER;
ALTER TABLE "players" ADD COLUMN "transfermarkt_id" INTEGER;
CREATE UNIQUE INDEX "clubs_transfermarkt_id_key" ON "clubs"("transfermarkt_id");
CREATE UNIQUE INDEX "players_transfermarkt_id_key" ON "players"("transfermarkt_id");

-- Unknown source data is NULL, never a made-up year, zero valuation, or guessed dominant foot.
ALTER TABLE "clubs" ALTER COLUMN "founded_year" DROP NOT NULL;
ALTER TABLE "players" ALTER COLUMN "market_value" DROP NOT NULL;
ALTER TABLE "players" ALTER COLUMN "height" DROP NOT NULL;
ALTER TABLE "players" ALTER COLUMN "preferred_foot" DROP NOT NULL;
