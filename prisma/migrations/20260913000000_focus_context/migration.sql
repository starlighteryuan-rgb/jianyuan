-- CreateEnum
CREATE TYPE "FocusSourceKind" AS ENUM ('USER_STATED', 'RECORD_DERIVED');

-- CreateTable
CREATE TABLE "current_focus_context" (
    "id" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "sourceKind" "FocusSourceKind" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "lastMentionedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_focus_context_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "current_focus_context_subjectRef_idx" ON "current_focus_context"("subjectRef");

-- CreateIndex
CREATE INDEX "current_focus_context_endedAt_idx" ON "current_focus_context"("endedAt");

