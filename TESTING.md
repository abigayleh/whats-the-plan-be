# Testing

Vitest + supertest — **139 tests**, no database required.

## Commands

`npm test` (watch), `npm run test:run` (once), `npm run coverage`.

## What's covered

- **Pure `lib/` logic** — recurrence expansion (daily/weekly/biweekly/monthly/
  yearly, intervals, boundaries), serializers (mapping + never leaking
  `passwordHash`/`storedPath`), token sign/verify, subtasks validation, and
  storage path logic. Imported and unit-tested directly.
- **Route validation + auth** — every route's pre-database guards, via supertest
  against `src/app.js`: 401 (missing/invalid/expired token), 400 (bad input), and
  unknown-path 404s.

## What's NOT covered (and why)

Route happy-paths that read or write the database. Vitest can't intercept the
CommonJS Prisma singleton through the app's `require` graph, so those need a real
test database — not yet set up. **Do not** try to `vi.mock` Prisma through a
route; it won't intercept. Add DB-backed integration tests later against a
throwaway Postgres (Docker or a dedicated test database).

## Writing new tests

- `test/<name>.test.js`, using ESM `import`.
- `test/setup.js` sets dummy env (`DATABASE_URL`, JWT secrets) so modules
  construct without real infra.
- Import the app with `import app from '../src/app.js'` — never start the server.
- Sign auth tokens with `jwt.sign({ sub }, process.env.JWT_ACCESS_SECRET)`.
- Only assert paths that return before a Prisma call.