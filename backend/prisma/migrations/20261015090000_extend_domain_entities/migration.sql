BEGIN;

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('PERMANENT', 'LOAN', 'FREE');

-- CreateEnum
CREATE TYPE "DataReliability" AS ENUM ('UNKNOWN', 'RUMOR', 'REPUTABLE_PRESS', 'OFFICIAL', 'FINANCIAL_REPORT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTRACT_RENEWED', 'CONTRACT_TERMINATED', 'CONTRACT_EXPIRING', 'MARKET_VALUE_CHANGED', 'RELEASE_CLAUSE_CHANGED', 'INJURY_RECORDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'SOFT_DELETE', 'DELETE', 'VERIFY');

-- DropIndex
DROP INDEX "shortlists_user_id_player_id_requirement_id_key";

-- AlterTable
ALTER TABLE "shortlists" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "shortlist_id" INTEGER;

-- CreateTable
CREATE TABLE "shortlist_lists" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "default_owner_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "from_club_id" INTEGER,
    "to_club_id" INTEGER NOT NULL,
    "transfer_date" DATE NOT NULL,
    "type" "TransferType" NOT NULL,
    "fee" DECIMAL(15,2),
    "reliability" "DataReliability" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "player_id" INTEGER,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "event_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_configs" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL,
    "financial_weight" DECIMAL(5,4) NOT NULL,
    "squad_weight" DECIMAL(5,4) NOT NULL,
    "risk_weight" DECIMAL(5,4) NOT NULL,
    "criteria_weights" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "requirement_id" INTEGER NOT NULL,
    "config_id" INTEGER NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "financial_score" DECIMAL(5,2) NOT NULL,
    "squad_score" DECIMAL(5,2) NOT NULL,
    "risk_score" DECIMAL(5,2) NOT NULL,
    "criteria_scores" JSONB NOT NULL,
    "pros_cons" JSONB NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" "AuditAction" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "actor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_lists_default_owner_id_key" ON "shortlist_lists"("default_owner_id");

-- CreateIndex
CREATE INDEX "shortlist_lists_user_id_idx" ON "shortlist_lists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_lists_id_user_id_key" ON "shortlist_lists"("id", "user_id");

-- CreateIndex
CREATE INDEX "transfers_player_id_transfer_date_idx" ON "transfers"("player_id", "transfer_date");

-- CreateIndex
CREATE INDEX "transfers_from_club_id_idx" ON "transfers"("from_club_id");

-- CreateIndex
CREATE INDEX "transfers_to_club_id_idx" ON "transfers"("to_club_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_player_id_idx" ON "notifications"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_event_key_key" ON "notifications"("user_id", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_configs_name_version_key" ON "scoring_configs"("name", "version");

-- CreateIndex
CREATE INDEX "match_results_user_id_evaluated_at_idx" ON "match_results"("user_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "match_results_player_id_idx" ON "match_results"("player_id");

-- CreateIndex
CREATE INDEX "match_results_requirement_id_user_id_idx" ON "match_results"("requirement_id", "user_id");

-- CreateIndex
CREATE INDEX "match_results_config_id_idx" ON "match_results"("config_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "shortlists_shortlist_id_user_id_idx" ON "shortlists"("shortlist_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_shortlist_id_player_id_requirement_id_key" ON "shortlists"("shortlist_id", "player_id", "requirement_id");

-- Preserve all existing entries in one default list per owner.
INSERT INTO "shortlist_lists" ("user_id", "name", "default_owner_id")
SELECT DISTINCT "user_id", 'Danh sách mặc định', "user_id" FROM "shortlists";
UPDATE "shortlists" AS item
SET "shortlist_id" = list."id"
FROM "shortlist_lists" AS list
WHERE list."default_owner_id" = item."user_id";
ALTER TABLE "shortlists" ALTER COLUMN "shortlist_id" SET NOT NULL;
DROP INDEX "shortlists_personal_unique";
CREATE UNIQUE INDEX "shortlists_personal_unique"
ON "shortlists" ("shortlist_id", "player_id") WHERE "requirement_id" IS NULL;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_shortlist_id_user_id_fkey" FOREIGN KEY ("shortlist_id", "user_id") REFERENCES "shortlist_lists"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shortlist_lists" ADD CONSTRAINT "shortlist_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_club_id_fkey" FOREIGN KEY ("from_club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_club_id_fkey" FOREIGN KEY ("to_club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_requirement_id_user_id_fkey" FOREIGN KEY ("requirement_id", "user_id") REFERENCES "club_requirements"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "scoring_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints independent of the future API layer.
ALTER TABLE "shortlist_lists" ADD CONSTRAINT "shortlist_default_owner_valid"
CHECK ("default_owner_id" IS NULL OR "default_owner_id" = "user_id");
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlist_priority_positive" CHECK ("priority" >= 1);
ALTER TABLE "transfers" ADD CONSTRAINT "transfer_fee_nonnegative" CHECK ("fee" IS NULL OR "fee" >= 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfer_clubs_distinct" CHECK ("from_club_id" IS NULL OR "from_club_id" <> "to_club_id");
ALTER TABLE "transfers" ADD CONSTRAINT "free_transfer_fee_zero" CHECK ("type" <> 'FREE' OR "fee" IS NULL OR "fee" = 0);
ALTER TABLE "scoring_configs" ADD CONSTRAINT "config_weights_valid"
CHECK ("financial_weight" BETWEEN 0 AND 1 AND "squad_weight" BETWEEN 0 AND 1 AND "risk_weight" BETWEEN 0 AND 1
AND "financial_weight" + "squad_weight" + "risk_weight" = 1 AND "version" >= 1);
ALTER TABLE "scoring_configs" ADD CONSTRAINT "config_json_objects"
CHECK (jsonb_typeof("criteria_weights") = 'object' AND jsonb_typeof("parameters") = 'object');
CREATE UNIQUE INDEX "scoring_configs_single_active" ON "scoring_configs" ("is_active") WHERE "is_active" = true;
ALTER TABLE "match_results" ADD CONSTRAINT "match_scores_range"
CHECK ("total_score" BETWEEN 0 AND 100 AND "financial_score" BETWEEN 0 AND 100
AND "squad_score" BETWEEN 0 AND 100 AND "risk_score" BETWEEN 0 AND 100);

-- A version used by saved results keeps its parameters; activation can still change.
CREATE FUNCTION "protect_used_scoring_config"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "match_results" WHERE "config_id" = OLD."id")
     AND ROW(NEW."name", NEW."version", NEW."financial_weight", NEW."squad_weight", NEW."risk_weight", NEW."criteria_weights", NEW."parameters")
       IS DISTINCT FROM ROW(OLD."name", OLD."version", OLD."financial_weight", OLD."squad_weight", OLD."risk_weight", OLD."criteria_weights", OLD."parameters") THEN
    RAISE EXCEPTION 'Scoring config already used; create a new version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "protect_used_scoring_config" BEFORE UPDATE ON "scoring_configs"
FOR EACH ROW EXECUTE FUNCTION "protect_used_scoring_config"();

COMMIT;
