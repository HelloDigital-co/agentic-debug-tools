/**
 * Public Error Ingest Routes — copy into your Express project
 * POST /api/errors/log — no auth required, any user/visitor can submit errors
 *
 * Register in app.js:
 *   const publicErrorIngestRoutes = require('./routes/public-error-ingest.routes');
 *   app.use('/api/errors', publicErrorIngestRoutes);
 */

const express = require('express');
const router = express.Router();
const errorLogsController = require('../controllers/error-logs.controller');

/**
 * POST /api/errors/log
 * Accepts frontend/browser errors from DeveloperWidget (unauthenticated)
 * Body: { logs: Array<{ level, message, stack?, timestamp, file? }>, source?, url? }
 */
router.post('/log', errorLogsController.logFrontendErrors);

module.exports = router;
