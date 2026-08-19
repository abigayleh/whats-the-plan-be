require('./instrument');

// Handing out verification tokens over the API is a test-only affordance, so it must never be
// enabled against a real database.
if (process.env.E2E_EXPOSE_VERIFY_TOKEN === '1'
  && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to start: E2E_EXPOSE_VERIFY_TOKEN=1 with a non-local DATABASE_URL.');
  process.exit(1);
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