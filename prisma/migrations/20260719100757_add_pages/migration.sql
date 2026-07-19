-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "icon" TEXT,
    "content" JSONB,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "groupId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Supabase exposes every public-schema table via PostgREST; RLS is the only gate.
-- Prisma connects as `postgres` (BYPASSRLS), so the API layer is unaffected.
ALTER TABLE "Page" ENABLE ROW LEVEL SECURITY;
