-- CreateTable
CREATE TABLE "clubs" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "league" VARCHAR(100) NOT NULL,
    "founded_year" INTEGER NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);
