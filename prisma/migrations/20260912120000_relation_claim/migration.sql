-- CreateEnum
CREATE TYPE "EvidenceSupportLevel" AS ENUM ('WEAK', 'OBSERVED', 'SUPPORTED', 'STRONG');

-- CreateEnum
CREATE TYPE "EvidenceDimension" AS ENUM ('STRUCTURAL_STRENGTH', 'INDEPENDENT_SUPPORT', 'TEMPORAL_ADEQUACY', 'SPECIFICITY_BASELINE_CONTRAST', 'COUNTEREVIDENCE_BALANCE', 'EVIDENCE_FIDELITY');

-- CreateEnum
CREATE TYPE "DimensionScoreStatus" AS ENUM ('SCORED', 'UNAVAILABLE', 'NEEDS_RETRY');

-- CreateTable
CREATE TABLE "relation_claim" (
    "id" TEXT NOT NULL,
    "axisQuestion" TEXT NOT NULL,
    "axisDimension" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "assertsTemporalOrdering" BOOLEAN NOT NULL DEFAULT false,
    "numericScore" INTEGER,
    "supportLevel" "EvidenceSupportLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relation_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relation_claim_record" (
    "claimId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "relation_claim_record_pkey" PRIMARY KEY ("claimId","recordId")
);

-- CreateTable
CREATE TABLE "relation_claim_dimension" (
    "claimId" TEXT NOT NULL,
    "dimension" "EvidenceDimension" NOT NULL,
    "status" "DimensionScoreStatus" NOT NULL,
    "score" INTEGER,
    "reason" TEXT NOT NULL,

    CONSTRAINT "relation_claim_dimension_pkey" PRIMARY KEY ("claimId","dimension")
);

-- CreateIndex
CREATE INDEX "relation_claim_supportLevel_idx" ON "relation_claim"("supportLevel");

-- CreateIndex
CREATE INDEX "relation_claim_relationType_idx" ON "relation_claim"("relationType");

-- CreateIndex
CREATE INDEX "relation_claim_record_recordId_idx" ON "relation_claim_record"("recordId");

-- AddForeignKey
ALTER TABLE "relation_claim_record" ADD CONSTRAINT "relation_claim_record_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "relation_claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relation_claim_dimension" ADD CONSTRAINT "relation_claim_dimension_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "relation_claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

