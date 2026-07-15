-- Supabase exposes every public-schema table via PostgREST; RLS is the only gate.
-- No policies are defined, so the anon/authenticated roles get nothing. Prisma
-- connects as `postgres`, which has BYPASSRLS, so the API layer is unaffected.
-- NOTE: this is per-table — every new model needs a line added here.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Group" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InviteCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Itinerary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "List" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Poll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PollOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PollVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table also lands in the public schema.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
