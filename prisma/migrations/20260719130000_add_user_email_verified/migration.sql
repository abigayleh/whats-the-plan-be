-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather everyone who signed up before verification existed, so they aren't locked out.
-- The DEFAULT false still applies to new signups going forward.
UPDATE "User" SET "emailVerified" = true;
