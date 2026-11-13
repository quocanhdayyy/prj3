-- Additive migration: preserve existing rows and do not invent historical values.
BEGIN;

-- CreateEnum
CREATE TYPE "PlayerRegistrationStatus" AS ENUM ('UNKNOWN', 'CONTRACTED', 'FREE_AGENT');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "secondary_positions" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[];

-- CreateTable
CREATE TABLE "player_market_value_histories" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "valued_at" DATE NOT NULL,
    "market_value" DECIMAL(15,2) NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "reliability" "DataReliability" NOT NULL DEFAULT 'UNKNOWN',
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_market_value_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_inputs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "requirement_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "estimated_fee" DECIMAL(15,2),
    "expected_salary_per_year" DECIMAL(15,2),
    "fee_source" VARCHAR(255),
    "salary_source" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "matching_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_data_verifications" (
    "player_id" INTEGER NOT NULL,
    "injury_covered_from" DATE,
    "injury_covered_through" DATE,
    "injury_verified_at" TIMESTAMPTZ(3),
    "injury_verified_by_id" INTEGER,
    "injury_source" VARCHAR(255),
    "registration_status" "PlayerRegistrationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "registration_as_of" DATE,
    "registration_verified_at" TIMESTAMPTZ(3),
    "registration_verified_by_id" INTEGER,
    "registration_source" VARCHAR(255),

    CONSTRAINT "player_data_verifications_pkey" PRIMARY KEY ("player_id")
);

-- CreateIndex
CREATE INDEX "player_market_value_histories_player_id_valued_at_idx" ON "player_market_value_histories"("player_id", "valued_at");

-- CreateIndex
CREATE UNIQUE INDEX "player_market_value_histories_player_id_valued_at_source_key" ON "player_market_value_histories"("player_id", "valued_at", "source");

-- CreateIndex
CREATE INDEX "matching_inputs_requirement_id_user_id_idx" ON "matching_inputs"("requirement_id", "user_id");

-- CreateIndex
CREATE INDEX "matching_inputs_player_id_idx" ON "matching_inputs"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "matching_inputs_requirement_id_player_id_key" ON "matching_inputs"("requirement_id", "player_id");

-- CreateIndex
CREATE INDEX "player_data_verifications_injury_verified_by_id_idx" ON "player_data_verifications"("injury_verified_by_id");

-- CreateIndex
CREATE INDEX "player_data_verifications_registration_verified_by_id_idx" ON "player_data_verifications"("registration_verified_by_id");

-- AddForeignKey
ALTER TABLE "player_market_value_histories" ADD CONSTRAINT "player_market_value_histories_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_inputs" ADD CONSTRAINT "matching_inputs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_inputs" ADD CONSTRAINT "matching_inputs_requirement_id_user_id_fkey" FOREIGN KEY ("requirement_id", "user_id") REFERENCES "club_requirements"("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "matching_inputs" ADD CONSTRAINT "matching_inputs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_data_verifications" ADD CONSTRAINT "player_data_verifications_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_data_verifications" ADD CONSTRAINT "player_data_verifications_injury_verified_by_id_fkey" FOREIGN KEY ("injury_verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_data_verifications" ADD CONSTRAINT "player_data_verifications_registration_verified_by_id_fkey" FOREIGN KEY ("registration_verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Scalar-list invariants are not expressible in the Prisma schema.
ALTER TABLE "players" ALTER COLUMN "secondary_positions" SET NOT NULL;
CREATE FUNCTION "matching_secondary_positions_valid"(primary_position TEXT, positions TEXT[])
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT positions IS NOT NULL
    AND COALESCE(array_ndims(positions), 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM unnest(positions) AS entry(position)
      WHERE position IS NULL
        OR position !~ '^[A-Z][A-Z0-9_]{0,49}$'
        OR position = upper(btrim(primary_position))
    )
    AND cardinality(positions) = (SELECT count(DISTINCT position) FROM unnest(positions) AS entry(position));
$$;
ALTER TABLE "players" ADD CONSTRAINT "player_secondary_positions_valid"
  CHECK ("matching_secondary_positions_valid"("position", "secondary_positions"));

-- All money in these models is EUR; expected salary is EUR/year.
ALTER TABLE "player_market_value_histories" ADD CONSTRAINT "market_value_history_valid"
  CHECK ("market_value" >= 0 AND length(btrim("source")) > 0
    AND "valued_at" <= ("recorded_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
COMMENT ON COLUMN "player_market_value_histories"."market_value" IS 'Market valuation in EUR; not the transfer fee. No synthetic history is backfilled.';

ALTER TABLE "matching_inputs" ADD CONSTRAINT "matching_input_money_valid"
  CHECK (("estimated_fee" IS NULL OR "estimated_fee" >= 0)
    AND ("expected_salary_per_year" IS NULL OR "expected_salary_per_year" >= 0)
    AND ("estimated_fee" IS NOT NULL OR "expected_salary_per_year" IS NOT NULL));
ALTER TABLE "matching_inputs" ADD CONSTRAINT "matching_input_sources_valid"
  CHECK (
    (("estimated_fee" IS NULL AND "fee_source" IS NULL)
      OR ("estimated_fee" IS NOT NULL AND "fee_source" IS NOT NULL AND length(btrim("fee_source")) > 0))
    AND (("expected_salary_per_year" IS NULL AND "salary_source" IS NULL)
      OR ("expected_salary_per_year" IS NOT NULL AND "salary_source" IS NOT NULL AND length(btrim("salary_source")) > 0))
    AND "updated_at" >= "created_at"
  );
COMMENT ON COLUMN "matching_inputs"."estimated_fee" IS 'Expected fee in EUR for this candidate and requirement. NULL means unknown; zero means an explicitly estimated free transfer.';
COMMENT ON COLUMN "matching_inputs"."expected_salary_per_year" IS 'Expected salary for the proposed contract, EUR/year; not the existing contract salary.';

-- No verification row (or an empty row) means UNKNOWN, never confirmed healthy/free.
ALTER TABLE "player_data_verifications" ADD CONSTRAINT "injury_coverage_verification_valid"
  CHECK (
    ("injury_covered_from" IS NULL AND "injury_covered_through" IS NULL
      AND "injury_verified_at" IS NULL AND "injury_verified_by_id" IS NULL AND "injury_source" IS NULL)
    OR
    ("injury_covered_from" IS NOT NULL AND "injury_covered_through" IS NOT NULL
      AND "injury_verified_at" IS NOT NULL AND "injury_verified_by_id" IS NOT NULL
      AND "injury_source" IS NOT NULL AND length(btrim("injury_source")) > 0
      AND "injury_covered_from" <= "injury_covered_through"
      AND "injury_covered_through" <= ("injury_verified_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
  );
ALTER TABLE "player_data_verifications" ADD CONSTRAINT "registration_verification_valid"
  CHECK (
    ("registration_status" = 'UNKNOWN' AND "registration_as_of" IS NULL
      AND "registration_verified_at" IS NULL AND "registration_verified_by_id" IS NULL AND "registration_source" IS NULL)
    OR
    ("registration_status" <> 'UNKNOWN' AND "registration_as_of" IS NOT NULL
      AND "registration_verified_at" IS NOT NULL AND "registration_verified_by_id" IS NOT NULL
      AND "registration_source" IS NOT NULL AND length(btrim("registration_source")) > 0
      AND "registration_as_of" <= ("registration_verified_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
  );

COMMIT;
