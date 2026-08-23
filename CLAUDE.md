# PlanTogether — Claude Code Project Brief

## Working agreement

Claude merges finished work to `master` itself in this repo — that is what the tracked
`.claude/allow-merge-to-base` marker enables. The flow stays: branch in its own worktree,
rebase onto current `master`, `merge --ff-only`, then remove the worktree and delete the
branch. Pushing `master` is still blocked, so a merge lands locally until it is pushed by
hand.

---

## Project Overview

A general-purpose collaborative planning app. Users create and join named **Groups** (friend groups, roommates, trip crews, work teams — anything). Each group gets a shared calendar, lists, tasks, polls, and itineraries. Users can also chat 1-on-1 or in multi-person threads with anyone they share a group with. Everything is either private to the user, or scoped to a specific group.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express + Socket.io |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens) |
| ORM | Prisma |
| Styling | SASS (SCSS) |
| File Storage | Supabase Storage (local-filesystem fallback for dev/E2E) |
| Real-time | Socket.io |

---

## Core Concepts

### Users
- Register with username + password
- A user has their own **personal space**: private events, private lists, private tasks
- A user can belong to **multiple groups** simultaneously
- Social graph is derived from group membership — no separate friends list needed. If you share a group with someone, you can chat with them.

### Groups
- A group is a named space (e.g. "Barcelona Trip", "House 42", "Book Club")
- Created by any user; creator becomes the first admin
- Members + admins model: multiple admins allowed
- Only admins can invite, remove members, or promote/demote admins
- Invite via shareable code/link (revocable, optionally expirable)
- A user can leave a group at any time

### Visibility Model
Every piece of content (event, list, task, poll, itinerary) has a `scope`:
- `PRIVATE` — only the creator sees it
- `GROUP:{groupId}` — all members of that group see it

Implemented as two nullable columns on each model: `groupId` (FK) + a `isPrivate` boolean, or simply: if `groupId` is null, it's private.

---

## Calendar

### Multi-Group Calendar
- Sidebar shows **group toggles** (like Google Calendar) — personal + one entry per group
- User can select any combination; selected groups' events are layered and color-coded
- Default: all groups visible

### Views
- **Monthly** — event chips per day, itinerary banners spanning date ranges
- **Weekly** — columns per day, time blocks
- **Daily** — single day, time slot detail

### Events
- Title, description, start/end datetime, color label
- Scope: private or a specific group
- Optional `itineraryId` FK (child of an itinerary)
- Recurring: daily / weekly / monthly / yearly — expanded on read, not pre-materialized

### Task → Calendar Integration
- Tasks with a due date appear on calendar as chips
- 📅 Scheduled: has due date, incomplete, not overdue
- ⚠️ Overdue: due date passed, not done
- ✅ Done

---

## Lists & Tasks

### Lists
- Created by a user, scoped to: private or a specific group
- A list belongs to exactly one scope — choose on creation
- Built-in system list: **"Assigned to Me"** — read-only, auto-populated across all visible tasks

### Tasks
- Belong to a list (inherit the list's scope)
- Fields: title, description, status (todo / in-progress / done), due date (optional), assigned user (optional)
- Assigned user must be a member of the group the list belongs to (or self, if private)
- Up to 5 photos + 5 files attached per task
- Tasks with due dates surface on calendar

---

## Attachments

Shared upload infrastructure used by tasks and chat messages.

- Files saved to `/uploads/{userId}/{entityType}/{entityId}/{filename}`
- Served via `/api/files/:id`
- Max 5 photos + 5 files per task (enforced in API layer)
- To move to S3: swap write/read logic in attachment service only — schema unchanged

```prisma
model Attachment {
  id         String   @id @default(uuid())
  filename   String
  storedPath String
  mimeType   String
  sizeBytes  Int
  uploadedBy String
  taskId     String?
  task       Task?    @relation(fields: [taskId], references: [id])
  messageId  String?
  message    Message? @relation(fields: [messageId], references: [id])
  createdAt  DateTime @default(now())
}
```

---

## Polls

- Any group member can create a poll scoped to that group
- Fields: question, options (1–N), optional expiry datetime
- One vote per user per poll (enforced at DB level)
- Live vote results via WebSocket

---

## Itineraries

- A named trip that is either **planned** (both `startDate` + `endDate`) or **to be planned** (a `dayCount`, both dates null) — never a partial pair. Validation lives in `src/lib/itinerarySchedule.js`
- Manually ordered via `sortOrder` (shared by everyone who can see it, not per-user); list queries order by `sortOrder` then `createdAt`
- Scoped to a group (or private). `PATCH /:id` can change the scope; that re-scopes the itinerary's list, events and polls in one transaction (`src/lib/itineraryScope.js`) and is refused with `ITINERARY_HAS_POLLS` when going personal while polls exist
- Child events link back via `Event.itineraryId`
- Calendar renders itinerary as a multi-day banner; child events appear as normal chips, color-matched

Future extensions (no schema changes needed):
- Packing list: reuse List model with an `itineraryId` FK
- Budget tracking tab

---

## Chat

### Conversation Model
A `Conversation` is the core chat primitive — it handles both DMs and group chats uniformly.

- **DM**: a conversation with exactly 2 participants (no group association)
- **Group chat**: a conversation associated with a group, with N participants (all members, or a subset)
- Conversations have a name (auto-generated for DMs: the other person's username; named for group chats)
- Users can only start a conversation with people they share at least one group with

### Messages
- Text content + optional attachments (reuses Attachment model)
- Optional `embed` JSON field for sharing a list or document: `{ type: 'list' | 'itinerary', refId: '...' }`
- Delivered in real-time via WebSocket
- `GET /api/conversations/:id/messages?before=&limit=` for paginated history on scroll

---

## WebSockets (Socket.io)

Wired from day one.

### Rooms
| Room | Who joins |
|---|---|
| `user:{userId}` | The user themselves (personal notifications) |
| `group:{groupId}` | All members of that group |
| `conversation:{conversationId}` | All participants in that chat |

### Events (server → client)
| Event | Trigger |
|---|---|
| `event:created/updated/deleted` | Calendar event mutation |
| `task:created/updated/deleted` | Task mutation |
| `list:created/updated` | List mutation |
| `poll:created` / `poll:vote` | Poll activity |
| `itinerary:created/updated` | Itinerary mutation |
| `chat:message` | New message in a conversation |
| `conversation:created` | New DM or group chat started |
| `group:member-joined/left` | Membership change |

### Auth
- Validate JWT in Socket.io middleware on `connection` — reject unauthenticated sockets before room join

---

## Database Schema (Prisma)

```prisma
model User {
  id             String          @id @default(uuid())
  username       String          @unique
  passwordHash   String
  memberships    GroupMember[]
  conversations  ConversationParticipant[]
  createdAt      DateTime        @default(now())
}

model Group {
  id            String        @id @default(uuid())
  name          String
  members       GroupMember[]
  inviteCodes   InviteCode[]
  events        Event[]
  lists         List[]
  polls         Poll[]
  itineraries   Itinerary[]
  conversations Conversation[]
  createdAt     DateTime      @default(now())
}

model GroupMember {
  userId    String
  groupId   String
  role      Role     @default(MEMBER)
  user      User     @relation(fields: [userId], references: [id])
  group     Group    @relation(fields: [groupId], references: [id])
  joinedAt  DateTime @default(now())
  @@id([userId, groupId])
}

model InviteCode {
  id        String    @id @default(uuid())
  code      String    @unique
  groupId   String
  group     Group     @relation(fields: [groupId], references: [id])
  expiresAt DateTime?
  revoked   Boolean   @default(false)
  createdAt DateTime  @default(now())
}

model Event {
  id             String     @id @default(uuid())
  title          String
  description    String?
  startAt        DateTime
  endAt          DateTime
  colorLabel     String?
  createdById    String
  groupId        String?    // null = private
  group          Group?     @relation(fields: [groupId], references: [id])
  recurrenceRule Json?      // { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number }
  itineraryId    String?
  itinerary      Itinerary? @relation(fields: [itineraryId], references: [id])
  createdAt      DateTime   @default(now())
}

model Itinerary {
  id          String   @id @default(uuid())
  title       String
  destination String?
  description String?
  startDate   DateTime
  endDate     DateTime
  colorLabel  String?
  createdById String
  groupId     String?
  group       Group?   @relation(fields: [groupId], references: [id])
  events      Event[]
  createdAt   DateTime @default(now())
}

model List {
  id          String   @id @default(uuid())
  name        String
  ownerId     String
  groupId     String?  // null = private
  group       Group?   @relation(fields: [groupId], references: [id])
  isSystem    Boolean  @default(false)
  tasks       Task[]
  createdAt   DateTime @default(now())
}

model Task {
  id           String       @id @default(uuid())
  listId       String
  list         List         @relation(fields: [listId], references: [id])
  title        String
  description  String?
  status       TaskStatus   @default(TODO)
  dueDate      DateTime?
  assignedToId String?
  createdById  String
  attachments  Attachment[]
  createdAt    DateTime     @default(now())
}

model Attachment {
  id         String    @id @default(uuid())
  filename   String
  storedPath String
  mimeType   String
  sizeBytes  Int
  uploadedBy String
  taskId     String?
  task       Task?     @relation(fields: [taskId], references: [id])
  messageId  String?
  message    Message?  @relation(fields: [messageId], references: [id])
  createdAt  DateTime  @default(now())
}

model Poll {
  id          String       @id @default(uuid())
  question    String
  groupId     String
  group       Group        @relation(fields: [groupId], references: [id])
  createdById String
  expiresAt   DateTime?
  options     PollOption[]
  createdAt   DateTime     @default(now())
}

model PollOption {
  id     String     @id @default(uuid())
  pollId String
  poll   Poll       @relation(fields: [pollId], references: [id])
  text   String
  votes  PollVote[]
}

model PollVote {
  id           String     @id @default(uuid())
  pollOptionId String
  pollOption   PollOption @relation(fields: [pollOptionId], references: [id])
  userId       String
  createdAt    DateTime   @default(now())
  @@unique([pollOptionId, userId])
}

model Conversation {
  id           String                   @id @default(uuid())
  name         String?                  // null for DMs (derive from participants)
  groupId      String?                  // null for DMs
  group        Group?                   @relation(fields: [groupId], references: [id])
  participants ConversationParticipant[]
  messages     Message[]
  createdAt    DateTime                 @default(now())
}

model ConversationParticipant {
  userId         String
  conversationId String
  user           User         @relation(fields: [userId], references: [id])
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  @@id([userId, conversationId])
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderId       String
  text           String?
  embed          Json?        // { type: 'list'|'itinerary', refId: '...' }
  attachments    Attachment[]
  createdAt      DateTime     @default(now())
}

enum Role       { MEMBER ADMIN }
enum TaskStatus { TODO IN_PROGRESS DONE }
```

---

## API Routes (Express)

### Auth
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Groups
```
GET    /api/groups                        # all groups the user belongs to
POST   /api/groups                        # create group
GET    /api/groups/:id
PATCH  /api/groups/:id                    # (admin)
DELETE /api/groups/:id                    # (admin)
POST   /api/groups/:id/invite             # generate invite code (admin)
DELETE /api/groups/:id/invite/:code       # revoke (admin)
POST   /api/groups/join/:code             # join via invite
DELETE /api/groups/:id/members/:userId    # remove member (admin)
PATCH  /api/groups/:id/members/:userId    # change role (admin)
POST   /api/groups/:id/leave              # leave group; returns 403 LAST_ADMIN if sole admin
DELETE /api/groups/:id                    # delete group + cascade (admin, or sole admin leaving)
```

### Events
```
GET    /api/events?start=&end=&groups=    # comma-separated groupIds + personal
POST   /api/events
PATCH  /api/events/:id
DELETE /api/events/:id
```

### Itineraries
```
GET    /api/itineraries
POST   /api/itineraries
PATCH  /api/itineraries/order             # { ids: [...] } → sortOrder by array index
PATCH  /api/itineraries/:id
DELETE /api/itineraries/:id
GET    /api/itineraries/:id/events
POST   /api/itineraries/:id/events
```

### Lists & Tasks
```
GET    /api/lists?groupId=                # filter by group or omit for all visible
POST   /api/lists
PATCH  /api/lists/:id
DELETE /api/lists/:id
GET    /api/lists/:listId/tasks
POST   /api/lists/:listId/tasks
PATCH  /api/lists/:listId/tasks/:id
DELETE /api/lists/:listId/tasks/:id
GET    /api/tasks/assigned-to-me
GET    /api/tasks/calendar?start=&end=
```

### Attachments
```
POST   /api/attachments
DELETE /api/attachments/:id
GET    /api/files/:id
```

### Polls
```
GET    /api/groups/:groupId/polls
POST   /api/groups/:groupId/polls
GET    /api/polls/:id
DELETE /api/polls/:id
POST   /api/polls/:id/vote
```

### Conversations & Chat
```
GET    /api/conversations                          # all convos for user
POST   /api/conversations                          # start DM or group chat
GET    /api/conversations/:id
GET    /api/conversations/:id/messages?before=&limit=
```
(sending messages is via WebSocket only)

---

## Frontend Structure

```
src/
  components/
    calendar/
      CalendarMonthly.jsx
      CalendarWeekly.jsx
      CalendarDaily.jsx
      GroupToggleSidebar.jsx      # checkboxes to show/hide group layers
      EventChip.jsx
      ItineraryBanner.jsx
      EventModal.jsx
    lists/
      ListSidebar.jsx
      TaskRow.jsx
      TaskDetailPanel.jsx
      AttachmentUploader.jsx
    polls/
      PollCard.jsx
      PollCreate.jsx
    itineraries/
      ItineraryCard.jsx
      ItineraryDetail.jsx
    chat/
      ConversationList.jsx
      ChatWindow.jsx
      ChatMessage.jsx
      ChatInput.jsx
      ChatEmbed.jsx
      NewConversationModal.jsx    # pick people from shared groups
    groups/
      GroupCard.jsx
      GroupSettingsPanel.jsx
      MemberList.jsx
      InviteModal.jsx
    layout/
      AppShell.jsx
      Header.jsx
  pages/
    LoginPage.jsx
    RegisterPage.jsx
    CalendarPage.jsx
    ListsPage.jsx
    PollsPage.jsx
    ChatPage.jsx
    GroupsPage.jsx
    GroupSettingsPage.jsx
  hooks/
    useAuth.js
    useGroups.js
    useEvents.js
    useTasks.js
    usePolls.js
    useChat.js
    useSocket.js
  api/
    client.js
    auth.js
    events.js
    lists.js
    tasks.js
    groups.js
    polls.js
    itineraries.js
    attachments.js
    conversations.js
  styles/
    abstracts/
      _variables.scss             # colors, spacing, breakpoints, typography tokens
      _mixins.scss
      _functions.scss
    base/
      _reset.scss
      _typography.scss
    components/                   # one partial per component
    layout/
      _appshell.scss
      _header.scss
    pages/
    main.scss                     # imports everything
    authStore.js
    groupStore.js               # active groups + toggle state for calendar
    chatStore.js                # conversation list + per-convo message log
  socket/
    socketClient.js
    handlers.js
```

---

## Suggested Build Order for Claude Code

1. **Project scaffold** — Vite React + Express + Prisma + PostgreSQL + Socket.io wired (ping/pong test)
2. **Auth** — register, login, JWT middleware, refresh token
3. **Groups core** — create, invite code, join, leave, member management, roles
4. **WebSocket rooms** — user joins `user:{id}` + `group:{id}` for each group on login
5. **Calendar backend** — event CRUD, multi-group filter, recurrence expansion; emit socket events
6. **Calendar frontend** — GroupToggleSidebar + monthly view; weekly + daily; event modal; socket invalidation
7. **Lists backend** — list + task CRUD, group scoping, assignment validation
8. **Lists frontend** — sidebar, task rows, task detail panel
9. **Attachments** — upload endpoint, file serving, AttachmentUploader component; wire to tasks
10. **Calendar × Tasks integration** — due date chips + status icons
11. **Polls** — backend + frontend + live updates via socket
12. **Itineraries** — backend + calendar banner + child event linking
13. **Conversations backend** — Conversation + Message models, DM vs group chat logic, history endpoint
14. **Chat frontend** — ConversationList, ChatWindow, real-time via socket, embed support
15. **Groups settings page** — invite management, member roles UI
16. **Push notifications scaffold** — stub Web Push + service worker; non-blocking

---

## Design Decisions & Notes

- **Leaving a group**: a user's created content (events, lists, tasks) in a group is orphaned — kept in DB but only visible to remaining members. The creator loses access.
- **Last admin leaving**: if the leaving user is the only remaining admin, block the leave and return a `403` with reason `LAST_ADMIN`. The frontend should detect this before the API call — on clicking "Leave Group", check if the user is the sole admin and show a warning modal: *"You're the only admin. Promote another member to admin before leaving, or leave anyway to permanently delete this group."* If they confirm deletion, call `DELETE /api/groups/:id` instead of the leave endpoint, which cascades and removes all group content. If another admin exists, leaving proceeds silently with no warning.
- **"Who can I chat with?"** — derived at runtime: fetch all users who share at least one group with the current user. No separate contacts table needed.
- **New conversation modal**: shows a people-picker filtered to shared-group members. Selecting 1 person = DM; selecting 2+ = group chat (optionally named).
- **Group calendar colors**: assign a color per group membership record (`GroupMember.color`), used consistently across calendar chips, sidebar toggles, and itinerary banners.
- **SASS structure**: use the 7-1 pattern (`abstracts/`, `base/`, `components/`, `layout/`, `pages/`, `themes/`, `vendors/`) with a single `main.scss` entry point. Define design tokens (colors, spacing, breakpoints, typography) as SCSS variables in `abstracts/_variables.scss` so they're easy to retheme later.
- **File storage swap**: change write/read logic in attachment service only — DB schema and API routes are unchanged.
- **Poll scope**: polls are always group-scoped (no private polls — doesn't make sense to poll yourself).
- **Sub-groups**: dropped for now. Can be reintroduced as member tags/labels without schema changes beyond a `Tag` join table.
- **RLS on new models**: Supabase auto-exposes every `public` table via PostgREST, and RLS is the only gate. **Any migration that adds a table must also `ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;`** — Prisma won't do it, and the Supabase linter only warns after the table is live. No policies are needed: authorization lives in Express, and Prisma connects as `postgres` (which has `BYPASSRLS`), so RLS-with-no-policies blocks PostgREST without touching the API. See `migrations/20260715140339_enable_rls`.
