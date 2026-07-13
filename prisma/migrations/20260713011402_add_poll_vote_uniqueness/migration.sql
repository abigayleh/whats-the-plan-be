-- DropIndex
DROP INDEX "PollVote_pollOptionId_userId_key";

-- AlterTable
ALTER TABLE "PollVote" ADD COLUMN     "pollId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

