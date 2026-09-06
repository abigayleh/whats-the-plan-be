-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill: to-dos already done have no completion date, so date them from the migration.
-- The sweep only deletes a week after this, which is the grace period for that guess.
UPDATE "Task" SET "completedAt" = NOW()
WHERE "status" = 'DONE' AND "recurrenceRule" IS NULL;
