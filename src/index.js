require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const authRouter = require('./routes/auth');
const groupsRouter = require('./routes/groups');
const eventsRouter = require('./routes/events');
const { router: listsRouter } = require('./routes/lists');
const tasksRouter = require('./routes/tasks');
const attachmentsRouter = require('./routes/attachments');
const filesRouter = require('./routes/files');
const requireAuth = require('./middleware/requireAuth');
const { initSocket } = require('./socket');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/events', requireAuth, eventsRouter);
app.use('/api/lists', requireAuth, listsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/attachments', requireAuth, attachmentsRouter);
app.use('/api/files', requireAuth, filesRouter);

// JSON error handler — keeps unexpected errors from leaking stack traces.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173' },
});

initSocket(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`whats-the-plan-be listening on port ${PORT}`);
});
