-- CreateEnum
CREATE TYPE "SupportBasis" AS ENUM ('DIRECTIONAL_OBSERVATION', 'COMPATIBILITY_ONLY', 'ABSENCE_OF_CONTRADICTION', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "AnchorPath" AS ENUM ('SUPPORTED_RELATION', 'INDEPENDENT_PATTERNS');

-- CreateTable
CREATE TABLE "hypothesis" (
    "id" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "anchorRefs" TEXT[],
    "anchorPath" "AnchorPath" NOT NULL,
    "supportBasis" "SupportBasis" NOT NULL,
    "supportingRecordRefs" TEXT[],
    "mechanism" TEXT NOT NULL,
    "discriminatingPredictions" TEXT[],
    "alternatives" TEXT[],
    "wouldStrengthen" TEXT[],
    "wouldWeaken" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hypothesis_anchorPath_idx" ON "hypothesis"("anchorPath");

