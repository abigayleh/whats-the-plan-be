require('./instrument');

const LOCAL_DB = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/;
const localDb = () => LOCAL_DB.test(process.env.DATABASE_URL || '');

// Handing out verification tokens over the API is a test-only affordance, so it must never be
// enabled against a real database.
if (process.env.E2E_EXPOSE_VERIFY_TOKEN === '1' && !localDb()) {
  console.error('Refusing to start: E2E_EXPOSE_VERIFY_TOKEN=1 with a non-local DATABASE_URL.');
  process.exit(1);
}

// A remote database with local-disk attachments is the combination that breaks silently: the
// rows outlive every release, the files do not. Warn rather than refuse — it is a legitimate
// state while migrating a deployment over.
if (!require('./lib/storage').isRemote() && !localDb()) {
  console.warn(
    'SUPABASE_URL/SUPABASE_SERVICE_KEY/SUPABASE_STORAGE_BUCKET not all set: attachments are '
    + 'written to ./uploads, which a deployed host loses on every release. See README → '
    + 'Attachment storage.',
  );
}

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initSocket } = require('./socket');

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173' },
});

initSocket(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`whats-the-plan-be listening on port ${PORT}`);
});