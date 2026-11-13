-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "nationality" VARCHAR(100) NOT NULL,
    "position" VARCHAR(50) NOT NULL,
    "market_value" DECIMAL(15,2) NOT NULL,
    "height" INTEGER NOT NULL,
    "preferred_foot" VARCHAR(10) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);
