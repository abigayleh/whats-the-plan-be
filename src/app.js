const express = require('express');
const cors = require('cors');
const { router: authRouter } = require('./routes/auth');
const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const { router: eventsRouter } = require('./routes/events');
const { router: listsRouter } = require('./routes/lists');
const tasksRouter = require('./routes/tasks');
const attachmentsRouter = require('./routes/attachments');
const filesRouter = require('./routes/files');
const { pollsRouter, groupPollsRouter } = require('./routes/polls');
const itinerariesRouter = require('./routes/itineraries');
const geocodeRouter = require('./routes/geocode');
const { router: pagesRouter } = require('./routes/pages');
const requireAuth = require('./middleware/requireAuth');

// Builds the Express app (routes + middleware) with no server or socket attached, so tests
// can drive it via supertest. index.js wraps this in an HTTP server + Socket.io and listens.
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/events', requireAuth, eventsRouter);
app.use('/api/lists', requireAuth, listsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/attachments', requireAuth, attachmentsRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/groups/:groupId/polls', requireAuth, groupPollsRouter);
app.use('/api/polls', requireAuth, pollsRouter);
app.use('/api/itineraries', requireAuth, itinerariesRouter);
app.use('/api/geocode', requireAuth, geocodeRouter);
app.use('/api/pages', requireAuth, pagesRouter);

// JSON error handler — keeps unexpected errors from leaking stack traces.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;