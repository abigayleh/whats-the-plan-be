// Dummy env so modules that read it at import (Prisma client, JWT secrets) construct without a
// real database or real secrets. Tests mock Prisma, so no connection is ever made. Uses ||= so a
// real .env (if present) still wins locally.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.CORS_ORIGIN ||= 'http://localhost:5173';