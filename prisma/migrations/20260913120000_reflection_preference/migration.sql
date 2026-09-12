-- CreateEnum
CREATE TYPE "HypothesisVisibility" AS ENUM ('HIDDEN', 'ON_REQUEST', 'SHOWN');

-- CreateEnum
CREATE TYPE "InterventionLevel" AS ENUM ('MINIMAL', 'STANDARD');

-- CreateEnum
CREATE TYPE "ExplanationDensity" AS ENUM ('BRIEF', 'FULL');

-- CreateTable
CREATE TABLE "reflection_preference" (
    "id" TEXT NOT NULL,
    "hypothesisVisibility" "HypothesisVisibility" NOT NULL,
    "interventionLevel" "InterventionLevel" NOT NULL,
    "explanationDensity" "ExplanationDensity" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reflection_preference_pkey" PRIMARY KEY ("id")
);
