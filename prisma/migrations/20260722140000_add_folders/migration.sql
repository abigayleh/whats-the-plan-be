-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ListPlacement" ADD COLUMN "folderId" TEXT;

-- AddForeignKey
ALTER TABLE "ListPlacement" ADD CONSTRAINT "ListPlacement_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: per-table convention — Supabase exposes every public table via PostgREST.
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
