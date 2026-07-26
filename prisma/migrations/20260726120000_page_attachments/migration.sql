-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "pageId" TEXT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
