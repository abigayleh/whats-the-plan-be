-- Reconciles migration drift: these three columns exist in schema.prisma and in the deployed
-- database, but no migration ever created them, so a database built from migrations alone was
-- missing them and every register/list write failed with P2022.
-- IF NOT EXISTS keeps this a no-op on the already-patched deployed database.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "subtasks" JSONB;

ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "showUnscheduledOnCalendar" BOOLEAN NOT NULL DEFAULT true;
