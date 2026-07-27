-- AlterTable
ALTER TABLE "Itinerary" ALTER COLUMN "startDate" DROP NOT NULL,
                        ALTER COLUMN "endDate" DROP NOT NULL,
                        ADD COLUMN "dayCount" INTEGER,
                        ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;