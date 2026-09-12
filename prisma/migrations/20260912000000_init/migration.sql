-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EpistemicRole" AS ENUM ('OBSERVED_EVENT', 'OBSERVED_STATE', 'USER_EXPRESSION', 'USER_REPORTED_PATTERN', 'USER_REPORTED_INTERVAL', 'PLATFORM_METADATA', 'EXTERNAL_REFERENCE', 'AI_HYPOTHESIS', 'DIRECTIVE', 'PRODUCT_EVENT');

-- CreateEnum
CREATE TYPE "TimeSemantic" AS ENUM ('EVENT_TIME', 'OBSERVATION_TIME', 'CAPTURE_TIME', 'USER_REPORTED_TIME', 'USER_REPORTED_INTERVAL');

-- CreateEnum
CREATE TYPE "ProvenanceOrigin" AS ENUM ('DIRECTLY_OBSERVED', 'IMPORTED', 'GENERATED', 'USER_REPORTED');

-- CreateEnum
CREATE TYPE "ProvenanceActor" AS ENUM ('USER', 'SYSTEM', 'AI', 'PLATFORM');

-- CreateEnum
CREATE TYPE "LineageRelation" AS ENUM ('DERIVED_FROM', 'RESPONDS_TO', 'REFERENCES', 'REVISES', 'SUPERSEDES', 'SUMMARIZES', 'REFORMATS');

-- CreateEnum
CREATE TYPE "StateTargetType" AS ENUM ('RELATION_CLAIM', 'HYPOTHESIS', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "UserPosition" AS ENUM ('NONE', 'AGREES', 'DISAGREES', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PresentationState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ElicitationMode" AS ENUM ('SPONTANEOUS', 'PROMPTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StimulusType" AS ENUM ('NONE', 'OPEN_QUESTION', 'EVIDENCE_RELATION', 'HYPOTHESIS', 'EXTERNAL_REFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MeaningCommitment" AS ENUM ('TENTATIVE', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "MeaningEffect" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DiscoveryKind" AS ENUM ('RELATION_DISCOVERY', 'HYPOTHESIS_DISCOVERY');

-- CreateEnum
CREATE TYPE "DiscoverySubjectType" AS ENUM ('RELATION_CLAIM', 'HYPOTHESIS');

-- CreateEnum
CREATE TYPE "DirectiveScopeKind" AS ENUM ('TOPIC_TAG', 'SOURCE', 'RELATION_AXIS', 'USER_SELECTED');

-- CreateTable
CREATE TABLE "evidence_unit" (
    "id" TEXT NOT NULL,
    "mintedFromParentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record" (
    "id" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "evidenceUnitId" TEXT NOT NULL,
    "provenanceOrigin" "ProvenanceOrigin" NOT NULL,
    "provenanceActor" "ProvenanceActor" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "timeSemantic" "TimeSemantic" NOT NULL,
    "timeAt" TIMESTAMP(3),
    "intervalFrom" TIMESTAMP(3),
    "intervalTo" TIMESTAMP(3),
    "intervalReportedAs" TEXT,
    "rawExpressionVerbatim" TEXT,
    "rawExpressionLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_epistemic_role" (
    "recordId" TEXT NOT NULL,
    "role" "EpistemicRole" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_epistemic_role_pkey" PRIMARY KEY ("recordId","role")
);

-- CreateTable
CREATE TABLE "lineage_edge" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "relationToParent" "LineageRelation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lineage_edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directive" (
    "id" TEXT NOT NULL,
    "allowAnalysis" BOOLEAN NOT NULL,
    "allowStorage" BOOLEAN NOT NULL,
    "allowPassivePresentation" BOOLEAN NOT NULL,
    "allowProactivePresentation" BOOLEAN NOT NULL,
    "appliesToFutureSimilar" BOOLEAN NOT NULL,
    "scopeKind" "DirectiveScopeKind",
    "scopeValue" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_assignment" (
    "id" TEXT NOT NULL,
    "targetType" "StateTargetType" NOT NULL,
    "targetRef" TEXT NOT NULL,
    "userPosition" "UserPosition" NOT NULL DEFAULT 'NONE',
    "workflowState" "WorkflowState" NOT NULL DEFAULT 'ACTIVE',
    "presentationState" "PresentationState" NOT NULL DEFAULT 'ACTIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery" (
    "id" TEXT NOT NULL,
    "subjectType" "DiscoverySubjectType" NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "discoveryKind" "DiscoveryKind" NOT NULL,
    "stableKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflection_episode" (
    "id" TEXT NOT NULL,
    "elicitationMode" "ElicitationMode" NOT NULL,
    "stimulusType" "StimulusType" NOT NULL,
    "systemFollowupCount" INTEGER NOT NULL DEFAULT 0,
    "stimulusRef" TEXT,
    "targetRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reflection_record" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "meaningCommitment" "MeaningCommitment" NOT NULL,
    "validAtSemantic" "TimeSemantic" NOT NULL,
    "validAtTime" TIMESTAMP(3),
    "currentEffect" "MeaningEffect" NOT NULL DEFAULT 'CURRENT',
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "episodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reflection_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "record_sourceFingerprint_key" ON "record"("sourceFingerprint");

-- CreateIndex
CREATE INDEX "record_evidenceUnitId_idx" ON "record"("evidenceUnitId");

-- CreateIndex
CREATE INDEX "record_epistemic_role_role_idx" ON "record_epistemic_role"("role");

-- CreateIndex
CREATE INDEX "lineage_edge_parentId_idx" ON "lineage_edge"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "lineage_edge_childId_parentId_relationToParent_key" ON "lineage_edge"("childId", "parentId", "relationToParent");

-- CreateIndex
CREATE UNIQUE INDEX "state_assignment_targetType_targetRef_key" ON "state_assignment"("targetType", "targetRef");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_stableKey_key" ON "discovery"("stableKey");

-- CreateIndex
CREATE INDEX "discovery_subjectType_subjectRef_idx" ON "discovery"("subjectType", "subjectRef");

-- CreateIndex
CREATE UNIQUE INDEX "user_reflection_record_supersededById_key" ON "user_reflection_record"("supersededById");

-- CreateIndex
CREATE INDEX "user_reflection_record_recordId_idx" ON "user_reflection_record"("recordId");

-- CreateIndex
CREATE INDEX "user_reflection_record_currentEffect_idx" ON "user_reflection_record"("currentEffect");

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_evidenceUnitId_fkey" FOREIGN KEY ("evidenceUnitId") REFERENCES "evidence_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_epistemic_role" ADD CONSTRAINT "record_epistemic_role_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_edge" ADD CONSTRAINT "lineage_edge_childId_fkey" FOREIGN KEY ("childId") REFERENCES "record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineage_edge" ADD CONSTRAINT "lineage_edge_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reflection_record" ADD CONSTRAINT "user_reflection_record_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reflection_record" ADD CONSTRAINT "user_reflection_record_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "user_reflection_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reflection_record" ADD CONSTRAINT "user_reflection_record_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "reflection_episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

