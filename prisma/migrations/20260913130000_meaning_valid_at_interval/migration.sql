-- AlterTable
--
-- ENGINEERING_CONTRACT §25 — user meaning is time-indexed, and `validAtTime` is
-- a full TimeAssertion: a meaning may be valid over a user-reported interval
-- ("这半年"), not only at a point. The init migration created only the point
-- columns, so the interval bounds and the user's own wording would be silently
-- dropped on persist — and §12 forbids reconstructing them by fabricating
-- precision.
--
-- All three are NULLABLE: a point-semantics meaning leaves them null, and every
-- existing row stays valid.
ALTER TABLE "user_reflection_record" ADD COLUMN     "validAtIntervalFrom" TIMESTAMP(3),
ADD COLUMN     "validAtIntervalTo" TIMESTAMP(3),
ADD COLUMN     "validAtIntervalReportedAs" TEXT;
