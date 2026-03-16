/**
 * Error Logs Controller — Express / Node.js
 *
 * Stores errors as JSON files under logs/startup-errors/.
 * No database required — works out of the box with zero dependencies beyond Node built-ins.
 *
 * Copy to: services/api/src/controllers/error-logs.controller.js
 *
 * Log file locations (relative to project root):
 *   logs/startup-errors/frontend-errors-YYYY-MM-DD.json  ← browser errors from DeveloperWidget
 *   logs/startup-errors/error-YYYY-MM-DD.json            ← backend/startup errors
 */

const fs = require('fs').promises;
const path = require('path');

class ErrorLogsController {
  constructor() {
    // Resolve project root — works whether you run from project root or services/api/
    let projectRoot = process.cwd();
    if (projectRoot.endsWith('services/api')) {
      projectRoot = path.resolve(projectRoot, '..', '..');
    }
    this.logDir = path.join(projectRoot, 'logs', 'startup-errors');
  }

  /**
   * POST /api/errors/log  (public, no auth)
   * POST /api/admin/error-logs  (also accepted here for widget compatibility)
   *
   * Body: { logs: Array<{ level, message, stack?, timestamp, file? }>, source?, url? }
   */
  async logFrontendErrors(req, res) {
    try {
      const { logs = [], source = 'frontend', url = '' } = req.body;
      if (!Array.isArray(logs) || logs.length === 0) {
        return res.status(400).json({ success: false, error: 'No logs provided' });
      }

      await fs.mkdir(this.logDir, { recursive: true });

      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `frontend-errors-${today}.json`);

      let existing = [];
      try {
        existing = JSON.parse(await fs.readFile(logFile, 'utf8'));
      } catch { /* file doesn't exist yet */ }

      const entries = logs.map((log) => ({
        timestamp: log.timestamp || new Date().toISOString(),
        level: log.level || 'error',
        message: log.message || 'Unknown error',
        stack: log.stack || null,
        file: log.file || url,
        source,
        category: 'frontend',
      }));

      await fs.writeFile(logFile, JSON.stringify([...existing, ...entries], null, 2));
      res.json({ success: true, logged: entries.length });
    } catch (error) {
      console.error('[ErrorLogsController] logFrontendErrors failed:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/admin/error-logs/stats  (public, no auth — used by widget health check)
   * Returns: { unresolved_errors, total_errors, by_category }
   */
  async getErrorStats(req, res) {
    try {
      const files = await this._getLogFiles();
      let all = [];
      for (const f of files) {
        try { all = all.concat(JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'))); }
        catch { /* skip */ }
      }
      const byCategory = {};
      all.forEach(e => { const c = e.category || 'frontend'; byCategory[c] = (byCategory[c] || 0) + 1; });
      res.json({
        success: true,
        unresolved_errors: all.filter(e => !e.resolved).length,
        total_errors: all.length,
        by_category: Object.entries(byCategory).map(([category, count]) => ({ category, count })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/admin/error-logs  (admin-only on prod)
   * Query params: page, limit, category, resolved, search, startDate, endDate
   * Returns: { success, logs, pagination, summary }
   */
  async getErrorLogs(req, res) {
    try {
      const { page = 1, limit = 50, category, resolved, search, startDate, endDate } = req.query;

      const files = await this._getLogFiles();
      let all = [];
      for (const f of files) {
        try { all = all.concat(JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'))); }
        catch { /* skip */ }
      }

      let filtered = all;
      if (category)   filtered = filtered.filter(e => e.category === category);
      if (resolved !== undefined) filtered = filtered.filter(e => e.resolved === (resolved === 'true'));
      if (startDate)  filtered = filtered.filter(e => new Date(e.timestamp) >= new Date(startDate));
      if (endDate)    filtered = filtered.filter(e => new Date(e.timestamp) <= new Date(endDate));
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(e =>
          [e.message, e.title, e.description, e.category, e.stack].filter(Boolean).join(' ').toLowerCase().includes(q)
        );
      }

      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + parseInt(limit));
      const summary = this._summary(all);

      res.json({
        success: true,
        data: { errors: paginated, summary },
        logs: paginated, // flat alias for compatibility
        pagination: { page: +page, limit: +limit, total: filtered.length },
      });
    } catch (error) {
      console.error('[ErrorLogsController] getErrorLogs failed:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** GET /api/admin/error-logs/summary */
  async getErrorSummary(req, res) {
    try {
      const files = await this._getLogFiles();
      let all = [];
      for (const f of files) {
        try { all = all.concat(JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'))); }
        catch { /* skip */ }
      }
      res.json({ success: true, data: this._summary(all) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** GET /api/admin/error-logs/:errorId */
  async getErrorById(req, res) {
    try {
      const files = await this._getLogFiles();
      for (const f of files) {
        try {
          const errors = JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'));
          const found = errors.find(e => e.errorId === req.params.errorId);
          if (found) return res.json({ success: true, data: found });
        } catch { /* skip */ }
      }
      res.status(404).json({ success: false, error: 'Error not found' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** PATCH /api/admin/error-logs/:errorId/resolve */
  async resolveError(req, res) {
    try {
      const { errorId } = req.params;
      const files = await this._getLogFiles();
      for (const f of files) {
        const filePath = path.join(this.logDir, f);
        try {
          const errors = JSON.parse(await fs.readFile(filePath, 'utf8'));
          const idx = errors.findIndex(e => e.errorId === errorId);
          if (idx !== -1) {
            errors[idx].resolved = true;
            errors[idx].resolvedAt = new Date().toISOString();
            errors[idx].resolvedBy = req.body?.resolvedBy || 'admin';
            await fs.writeFile(filePath, JSON.stringify(errors, null, 2));
            return res.json({ success: true, data: errors[idx] });
          }
        } catch { /* skip */ }
      }
      res.status(404).json({ success: false, error: 'Error not found' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** GET /api/admin/error-logs/trends */
  async getErrorTrends(req, res) {
    try {
      const days = parseInt(req.query.days || 7);
      const files = await this._getLogFiles();
      let all = [];
      for (const f of files) {
        try { all = all.concat(JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'))); }
        catch { /* skip */ }
      }
      const daily = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const day = all.filter(e => e.timestamp?.startsWith(ds));
        daily.push({ date: ds, total: day.length, resolved: day.filter(e => e.resolved).length });
      }
      res.json({ success: true, data: { daily, totalErrors: all.length } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** GET /api/admin/error-logs/export?format=json|csv */
  async exportErrorLogs(req, res) {
    try {
      const format = (req.query.format || 'json').toLowerCase();
      const files = await this._getLogFiles();
      let all = [];
      for (const f of files) {
        try { all = all.concat(JSON.parse(await fs.readFile(path.join(this.logDir, f), 'utf8'))); }
        catch { /* skip */ }
      }
      all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const date = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        const headers = ['timestamp', 'level', 'category', 'message', 'file', 'resolved'];
        const rows = all.map(e => headers.map(h => `"${String(e[h] || '').replace(/"/g, '""')}"`).join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="error-logs-${date}.csv"`);
        return res.send([headers.join(','), ...rows].join('\n'));
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="error-logs-${date}.json"`);
      res.json({ exportedAt: new Date().toISOString(), total: all.length, errors: all });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** GET /api/admin/error-logs/debug */
  async debugFileSystem(req, res) {
    try {
      let files = [];
      try { files = await fs.readdir(this.logDir); } catch { /* dir missing */ }
      res.json({ success: true, debug: { logDir: this.logDir, cwd: process.cwd(), files } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  async _getLogFiles() {
    try {
      const files = await fs.readdir(this.logDir);
      return files.filter(f => (f.startsWith('error-') || f.startsWith('frontend-errors-')) && f.endsWith('.json'));
    } catch { return []; }
  }

  _summary(errors) {
    const byCategory = {};
    errors.forEach(e => { const c = e.category || 'frontend'; byCategory[c] = (byCategory[c] || 0) + 1; });
    return {
      total: errors.length,
      resolved: errors.filter(e => e.resolved).length,
      unresolved: errors.filter(e => !e.resolved).length,
      byCategory,
    };
  }
}

const ctrl = new ErrorLogsController();
module.exports = {
  logFrontendErrors: (req, res) => ctrl.logFrontendErrors(req, res),
  getErrorStats:     (req, res) => ctrl.getErrorStats(req, res),
  getErrorLogs:      (req, res) => ctrl.getErrorLogs(req, res),
  getErrorSummary:   (req, res) => ctrl.getErrorSummary(req, res),
  getErrorById:      (req, res) => ctrl.getErrorById(req, res),
  resolveError:      (req, res) => ctrl.resolveError(req, res),
  getErrorTrends:    (req, res) => ctrl.getErrorTrends(req, res),
  exportErrorLogs:   (req, res) => ctrl.exportErrorLogs(req, res),
  debugFileSystem:   (req, res) => ctrl.debugFileSystem(req, res),
};
