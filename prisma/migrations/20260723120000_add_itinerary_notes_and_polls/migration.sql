-- AlterTable
ALTER TABLE "Itinerary" ADD COLUMN "content" JSONB;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "itineraryId" TEXT;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary"("id") ON DELETE CASCADE ON UPDATE CASCADE;