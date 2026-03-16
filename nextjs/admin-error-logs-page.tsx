'use client';

/**
 * Admin Error Logs Page — copy into your Next.js project
 *
 * Place at: app/admin/error-logs/page.tsx
 *
 * Calls GET /api/admin/error-logs (open on localhost, admin-protected on prod).
 * No auth guard on dev — any developer can view.
 * On prod, wrap ErrorLogsPageContent with your own auth guard component.
 *
 * Adapt PROD_DOMAINS to match your production domain(s).
 */

import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, Search, CheckCircle, Download } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level?: 'error' | 'warn' | 'info';
  message?: string;
  stack?: string;
  file?: string;
  category?: string;
  source?: string;
  resolved?: boolean;
  errorId?: string;
  title?: string;
  description?: string;
  stackTrace?: string;
}

// ── Adapt to your production domain(s) ────────────────────────────────────
const PROD_DOMAINS = ['yourdomain.com'];

const CATEGORIES = ['all', 'frontend', 'backend', 'database', 'worker', 'server', 'api', 'test'];
const LEVELS = ['all', 'error', 'warn', 'info'];

function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  return !PROD_DOMAINS.some((d) => window.location.hostname.includes(d));
}

function ErrorLogsPageContent() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ total: number; unresolved: number; byCategory: Record<string, number> } | null>(null);

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/error-logs?limit=100');
      if (res.ok) {
        const data = await res.json();
        const errors = data.data?.errors || data.logs || [];
        setLogs(errors);
        if (data.data?.summary) setSummary(data.data.summary);
      } else {
        setFetchError(`Failed to load logs: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      setFetchError('Failed to load logs. Check that the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs
    .filter((l) => levelFilter === 'all' || (l.level || 'error') === levelFilter)
    .filter((l) => categoryFilter === 'all' || (l.category || 'frontend') === categoryFilter)
    .filter((l) => {
      if (!search) return true;
      return [l.message, l.title, l.description, l.stack, l.stackTrace, l.category]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    });

  const levelColor = (level?: string) => {
    if (level === 'warn') return 'bg-yellow-100 text-yellow-800';
    if (level === 'info') return 'bg-blue-100 text-blue-800';
    return 'bg-red-100 text-red-800';
  };

  const catColor = (cat?: string) => {
    const map: Record<string, string> = {
      frontend: 'bg-blue-100 text-blue-700', backend: 'bg-purple-100 text-purple-700',
      database: 'bg-orange-100 text-orange-700', worker: 'bg-green-100 text-green-700',
      server: 'bg-gray-100 text-gray-700', api: 'bg-indigo-100 text-indigo-700',
    };
    return map[cat || ''] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Error Logs</h1>
                <p className="text-sm text-gray-600">
                  {logs.length} entries{summary ? ` · ${summary.unresolved ?? 0} unresolved` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <a href="/api/admin/error-logs/export?format=json"
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">
                <Download className="w-4 h-4" /> Export
              </a>
              <button onClick={loadLogs}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>
          </div>
          {summary?.byCategory && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(summary.byCategory).map(([cat, count]) => (
                <span key={cat} className={`text-xs px-2 py-1 rounded-full font-medium ${catColor(cat)}`}>
                  {cat}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 w-16">Level:</span>
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevelFilter(l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${levelFilter === l ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 w-16">Category:</span>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
        </div>

        {/* Logs */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">Loading logs...</p>
          </div>
        ) : fetchError ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-red-200">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-600 font-medium">{fetchError}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((log, i) => (
              <div key={log.errorId || i} className={`bg-white rounded-lg shadow-sm border p-4 ${log.resolved ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${levelColor(log.level)}`}>
                      {(log.level || 'error').toUpperCase()}
                    </span>
                    {log.category && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${catColor(log.category)}`}>{log.category}</span>
                    )}
                    {log.source && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{log.source}</span>
                    )}
                    {log.resolved && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" /> resolved
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-900 font-mono break-words">
                  {log.message || log.title || log.description || '(no message)'}
                </p>
                {log.file && <p className="text-xs text-gray-500 font-mono mt-1 truncate">{log.file}</p>}
                {(log.stack || log.stackTrace) && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">Stack trace</summary>
                    <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                      {log.stack || log.stackTrace}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">{logs.length > 0 ? 'No logs match your filters' : 'No logs found'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ErrorLogsPage() {
  const [isDev, setIsDev] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setIsDev(isDevEnvironment());
    setChecked(true);
  }, []);

  if (!checked) return null;

  // On dev: open to all developers
  if (isDev) return <ErrorLogsPageContent />;

  // On prod: wrap with your own auth guard, e.g.:
  // return <AdminAuthGuard><ErrorLogsPageContent /></AdminAuthGuard>;
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-600">Add your auth guard here for production access.</p>
    </div>
  );
}
