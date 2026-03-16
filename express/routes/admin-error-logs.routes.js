/**
 * Admin Error Logs Routes
 *
 * Public ingest: POST /api/errors/log  — no auth, any user/visitor can submit
 * Admin read:    GET  /api/admin/error-logs — admin-only on prod, open on dev/localhost
 *
 * Copy to: services/api/src/routes/admin-error-logs.routes.js
 * Register in app.js:
 *   app.use('/api/errors', publicErrorIngestRoutes);          // public, no auth
 *   app.use('/api/admin/error-logs', adminErrorLogsRoutes);   // admin-protected on prod
 */

const express = require('express');
const router = express.Router();
const errorLogsController = require('../controllers/error-logs.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * Dev-mode bypass — on localhost skip admin auth so any developer can view logs.
 * On production domains, require admin JWT.
 *
 * Adapt PROD_DOMAINS to match your own production hostnames.
 */
const PROD_DOMAINS = ['hashtagplus.com', 'htpl.us']; // ← change for your project

function devOrAdminOnly(req, res, next) {
  const host = req.headers.host || '';
  const origin = req.headers.origin || '';
  const isProd = PROD_DOMAINS.some(d => host.includes(d) || origin.includes(d));
  if (!isProd) return next();
  authenticateToken(req, res, () => requireAdmin(req, res, next));
}

/** POST /api/admin/error-logs — accept errors from debug widget (no auth) */
router.post('/', errorLogsController.logFrontendErrors);

/** GET /api/admin/error-logs/stats — widget health check (no auth) */
router.get('/stats', errorLogsController.getErrorStats);

/** GET /api/admin/error-logs — admin-only on prod */
router.get('/', devOrAdminOnly, errorLogsController.getErrorLogs);

router.get('/summary', devOrAdminOnly, errorLogsController.getErrorSummary);
router.get('/trends',  devOrAdminOnly, errorLogsController.getErrorTrends);
router.get('/export',  devOrAdminOnly, errorLogsController.exportErrorLogs);
router.get('/debug',   devOrAdminOnly, errorLogsController.debugFileSystem);
router.get('/:errorId', devOrAdminOnly, errorLogsController.getErrorById);
router.patch('/:errorId/resolve', devOrAdminOnly, errorLogsController.resolveError);

module.exports = router;
