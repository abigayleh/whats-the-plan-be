# What's the Plan — Backend

The API for **What's the Plan**, a collaborative planning app where users form groups (friend crews, roommates, trip squads, teams) and share a calendar, lists, tasks, polls, and itineraries — with real-time updates over WebSockets.

Built with **Express 5**, **Prisma** (PostgreSQL / Supabase), **Socket.io**, and **JWT** auth.

> The React frontend lives in a separate repo (`whats-the-plan-fe`).

---

## Features

- **Auth** — register/login with JWT access + refresh tokens, email verification (via Resend)
- **Groups** — create, invite by code, join/leave, member roles (member/admin)
- **Calendar** — events with recurrence, multi-group filtering, itinerary banners
- **Lists & tasks** — group-scoped or private, subtasks, due dates, assignment
- **Attachments** — file/photo uploads on tasks (local filesystem, S3-swappable)
- **Polls** — group-scoped, one vote per user, live results
- **Itineraries** — multi-day trips with linked child events and notes pages
- **Geocoding** — proxied through the backend to avoid CORS
- **Real-time** — Socket.io rooms per user and group, emitting live mutation events

---

## Getting started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (the project targets Supabase)

### Setup

```bash
npm install
cp .env.example .env    # fill in the values below
npx prisma migrate dev  # apply migrations + generate the client
npm run dev             # start with hot reload (nodemon)
```

The server listens on `PORT` (default `4000`). Health check: `GET /api/health`.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Supabase connection (port 6543) — used at runtime |
| `DIRECT_URL` | Direct connection (port 5432) — used by Prisma Migrate |
| `PORT` | Server port (default `4000`) |
| `CORS_ORIGIN` | Allowed frontend origin (default `http://localhost:5173`) |
| `JWT_ACCESS_SECRET` | Signing secret for short-lived access tokens |
| `JWT_REFRESH_SECRET` | Signing secret for refresh tokens |
| `RESEND_API_KEY` | Resend key for outbound email (optional — skipped if unset) |
| `RESEND_FROM_EMAIL` | From address for emails |
| `ADMIN_NOTIFICATION_EMAIL` | Where new-signup notices are sent |

`.env` is gitignored — never commit real secrets. See `.env.example` for the template.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the server with nodemon (hot reload) |
| `npm start` | Start the server (production) |
| `npm run prisma:generate` | Regenerate the Prisma client |
| `npm run prisma:migrate` | Create + apply a dev migration |

---

## Project structure

```
src/
  index.js            # Express app, route mounts, error handler, server boot
  routes/             # one router per resource (auth, groups, events, lists, …)
  middleware/         # requireAuth (JWT), groupAuth (membership checks)
  lib/                # prisma client, tokens, email, storage, serializers, access helpers
  socket/             # Socket.io setup + room management
prisma/
  schema.prisma       # data model
  migrations/         # SQL migrations (each new table must enable RLS — see note)
```

## API overview

All routes are under `/api`. Everything except `/api/auth/*` and `/api/health` requires a
`Bearer` access token.

| Prefix | Resource |
|---|---|
| `/api/auth` | register, login, refresh, logout, email verification |
| `/api/users` | profile / user lookup |
| `/api/groups` | groups, invites, membership, roles |
| `/api/events` | calendar events (with recurrence) |
| `/api/lists` · `/api/tasks` | lists, tasks, subtasks |
| `/api/attachments` · `/api/files` | uploads and file serving |
| `/api/groups/:groupId/polls` · `/api/polls` | polls and voting |
| `/api/itineraries` · `/api/pages` | itineraries and their notes pages |
| `/api/geocode` | Nominatim geocoding proxy |

### Auth model

Every mutating route decodes the JWT server-side and checks ownership/membership — the
client-supplied `userId` is never trusted. App-level checks are defence-in-depth: because
Supabase auto-exposes tables via PostgREST, **every new table must also enable Row Level
Security** (`ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;`) so it can't be reached
directly. Prisma connects as `postgres` (which bypasses RLS), so no policies are needed.

### Real-time

Socket.io authenticates the JWT on connect, then joins the socket to `user:{id}` and a
`group:{id}` room per membership. Mutations emit events (`event:created`, `task:updated`,
`poll:vote`, …) to the relevant rooms. (A `conversation:{id}` room helper exists for the
planned chat feature but isn't wired yet.)
