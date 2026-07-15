-- AlterTable
ALTER TABLE "List" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceRule" JSONB,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "scheduledStart" TIMESTAMP(3),
ADD COLUMN     "subtasks" JSONB;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

