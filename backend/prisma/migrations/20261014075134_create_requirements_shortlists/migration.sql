-- CreateTable
CREATE TABLE "club_requirements" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "min_age" INTEGER NOT NULL,
    "max_age" INTEGER NOT NULL,
    "salary_limit" DECIMAL(15,2) NOT NULL,
    "position" VARCHAR(50) NOT NULL,
    "priority" INTEGER NOT NULL,
    "budget" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "club_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "requirement_id" INTEGER,
    "note" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_requirements_club_id_idx" ON "club_requirements"("club_id");

-- CreateIndex
CREATE INDEX "club_requirements_user_id_idx" ON "club_requirements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_requirements_id_user_id_key" ON "club_requirements"("id", "user_id");

-- CreateIndex
CREATE INDEX "shortlists_player_id_idx" ON "shortlists"("player_id");

-- CreateIndex
CREATE INDEX "shortlists_requirement_id_user_id_idx" ON "shortlists"("requirement_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_user_id_player_id_requirement_id_key" ON "shortlists"("user_id", "player_id", "requirement_id");

-- AddForeignKey
ALTER TABLE "club_requirements" ADD CONSTRAINT "club_requirements_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_requirements" ADD CONSTRAINT "club_requirements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_requirement_id_user_id_fkey" FOREIGN KEY ("requirement_id", "user_id") REFERENCES "club_requirements"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- NULL requirements still represent a unique personal shortlist entry.
CREATE UNIQUE INDEX "shortlists_personal_unique"
ON "shortlists" ("user_id", "player_id") WHERE "requirement_id" IS NULL;
ALTER TABLE "club_requirements" ADD CONSTRAINT "requirement_ages_valid"
CHECK ("min_age" >= 0 AND "max_age" >= "min_age");
ALTER TABLE "club_requirements" ADD CONSTRAINT "requirement_money_priority_valid"
CHECK ("salary_limit" >= 0 AND "budget" >= 0 AND "priority" >= 1);
