# What's the Plan — Backend

Express + Socket.io + Prisma (PostgreSQL) API for the What's the Plan app.

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL
npx prisma migrate dev --name init
npm run dev
```

Health check: `GET /api/health`
Socket.io ping/pong: emit `ping`, listen for `pong`.
