-- AlterTable
ALTER TABLE "Itinerary" ADD COLUMN "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "List" ADD COLUMN "itineraryId" TEXT;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "Itinerary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
