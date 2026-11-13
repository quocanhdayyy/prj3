-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "club_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "salary_per_year" DECIMAL(15,2) NOT NULL,
    "release_clause" DECIMAL(15,2),
    "status" "ContractStatus" NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_player_id_idx" ON "contracts"("player_id");

-- CreateIndex
CREATE INDEX "contracts_club_id_idx" ON "contracts"("club_id");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve business rules even when concurrent requests write contracts.
CREATE UNIQUE INDEX "contracts_one_active_per_player"
ON "contracts" ("player_id") WHERE "status" = 'ACTIVE';
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_dates_valid"
CHECK ("end_date" > "start_date");
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_money_nonnegative"
CHECK ("salary_per_year" >= 0 AND ("release_clause" IS NULL OR "release_clause" >= 0));
