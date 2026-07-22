-- CreateTable
CREATE TABLE "ListPlacement" (
    "userId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListPlacement_pkey" PRIMARY KEY ("userId","listId")
);

-- AddForeignKey
ALTER TABLE "ListPlacement" ADD CONSTRAINT "ListPlacement_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: per-table convention — Supabase exposes every public table via PostgREST.
ALTER TABLE "ListPlacement" ENABLE ROW LEVEL SECURITY;
