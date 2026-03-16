'use client';

/**
 * DeveloperWidget — Unified debug FAB (bottom-right)
 *
 * Express-native pattern: no Flask sidecar. The Express backend IS the error tracker.
 *
 * Hidden until errors are detected (console intercept).
 * Two tabs:
 *   Services  — health status of frontend / backend / db / debug-tracker (= backend)
 *   Console   — in-browser console capture (errors, warnings, logs)
 *
 * Auth rules:
 *   - POST /api/errors/log  — unauthenticated, any user can submit
 *   - "Error Logs" link     — shown to everyone on localhost/dev, admins-only on prod
 *
 * Canonical source: Plugins/Agentic-Debug-Tools-20260218/DeveloperWidget.tsx
 * Copy to project:  cp Plugins/Agentic-Debug-Tools-20260218/DeveloperWidget.tsx apps/web/components/DeveloperWidget.tsx
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bug,
  X,
  RefreshCw,
  Zap,
  Monitor,
  Database,
  Wifi,
  ExternalLink,
  Send,
  ChevronDown,
  Copy,
  Check,
  Activity,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface ConsoleEntry {
  time: string;
  type: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

interface CapturedError {
  timestamp: string;
  message: string;
  stack: string;
  url: string;
}

type Tab = 'services' | 'console';
type ServiceStatus = 'online' | 'offline' | 'checking...';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CONSOLE_ENTRIES = 200;

// Production domains — admin-only for error log access
const PROD_DOMAINS = ['hashtagplus.com', 'htpl.us'];

// ── Helpers ────────────────────────────────────────────────────────────────

function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return !PROD_DOMAINS.some((d) => host.includes(d));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DeveloperWidget() {
  const [isClient, setIsClient] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('services');
  const [isDev, setIsDev] = useState(true);
  // isAdmin: passed as prop or resolved via your auth context.
  // In Next.js projects, replace this with useSimpleAuth() or your own hook.
  const [isAdmin, setIsAdmin] = useState(false);

  // Visibility — hidden until something goes wrong
  const [visible, setVisible] = useState(false);

  // Service health
  const [services, setServices] = useState<Record<string, ServiceStatus>>({
    frontend: 'checking...',
    backend: 'checking...',
    database: 'checking...',
    debugTracker: 'checking...',
  });

  // In-browser console capture
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [capturedErrors, setCapturedErrors] = useState<CapturedError[]>([]);
  const consoleRef = useRef<ConsoleEntry[]>([]);
  const errorsRef = useRef<CapturedError[]>([]);

  // UI state
  const [copied, setCopied] = useState(false);
  const [postedToLog, setPostedToLog] = useState(false);
  const [postStatus, setPostStatus] = useState('');

  // ── Hydration ──────────────────────────────────────────────────────────

  useEffect(() => {
    setIsClient(true);
    setIsDev(isDevEnvironment());
  }, []);

  // ── Console intercept (runs once on mount) ─────────────────────────────

  useEffect(() => {
    if (!isClient) return;

    const orig = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };

    function capture(type: ConsoleEntry['type'], args: unknown[]) {
      const message = args
        .map((a) => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        })
        .join(' ');

      const entry: ConsoleEntry = { time: new Date().toLocaleTimeString(), type, message };
      consoleRef.current = [entry, ...consoleRef.current].slice(0, MAX_CONSOLE_ENTRIES);
      setConsoleEntries([...consoleRef.current]);

      if (type === 'error') setVisible(true);
    }

    console.log   = (...args: unknown[]) => { capture('log',   args); orig.log.apply(console, args); };
    console.warn  = (...args: unknown[]) => { capture('warn',  args); orig.warn.apply(console, args); };
    console.error = (...args: unknown[]) => { capture('error', args); orig.error.apply(console, args); };
    console.info  = (...args: unknown[]) => { capture('info',  args); orig.info.apply(console, args); };

    const onError = (ev: ErrorEvent) => {
      const entry: CapturedError = {
        timestamp: new Date().toISOString(),
        message: ev.message || 'Uncaught error',
        stack: ev.error?.stack || 'No stack trace',
        url: window.location.href,
      };
      errorsRef.current = [entry, ...errorsRef.current].slice(0, MAX_CONSOLE_ENTRIES);
      setCapturedErrors([...errorsRef.current]);
      setVisible(true);
      // Auto-post to backend immediately
      postErrorsToBackend([entry]);
    };

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      const err = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
      const entry: CapturedError = {
        timestamp: new Date().toISOString(),
        message: 'Unhandled promise rejection: ' + err.message,
        stack: err.stack || 'No stack trace',
        url: window.location.href,
      };
      errorsRef.current = [entry, ...errorsRef.current].slice(0, MAX_CONSOLE_ENTRIES);
      setCapturedErrors([...errorsRef.current]);
      setVisible(true);
      // Auto-post to backend immediately
      postErrorsToBackend([entry]);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);

    return () => {
      console.log   = orig.log;
      console.warn  = orig.warn;
      console.error = orig.error;
      console.info  = orig.info;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, [isClient]);

  // ── Service health polling ─────────────────────────────────────────────
  // "Debug Tracker" = Express backend health. If backend is online, tracker is online.

  const checkServices = useCallback(async () => {
    if (!isClient) return;

    const [backendRes, dbRes] = await Promise.allSettled([
      fetch('/api/health', { signal: AbortSignal.timeout(2500) }),
      fetch('/api/health/db', { signal: AbortSignal.timeout(2500) }),
    ]);

    const backendOk = backendRes.status === 'fulfilled' && backendRes.value.ok;
    const dbOk = dbRes.status === 'fulfilled' && dbRes.value.ok;

    setServices({
      frontend: 'online',
      backend: backendOk ? 'online' : 'offline',
      database: dbOk ? 'online' : 'offline',
      // Debug Tracker = backend health (Express IS the error tracker)
      debugTracker: backendOk ? 'online' : 'offline',
    });
  }, [isClient]);

  useEffect(() => {
    checkServices();
    const id = setInterval(checkServices, 8000);
    return () => clearInterval(id);
  }, [checkServices]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleClearCache = async () => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      await fetch('/api/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: null }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* ignore */ }
    setTimeout(() => {
      window.location.href = window.location.href.split('?')[0] + '?_refresh=' + Date.now();
    }, 300);
  };

  // Post errors to the public ingest endpoint (no auth required)
  const postErrorsToBackend = async (errors: CapturedError[]) => {
    if (errors.length === 0) return;
    try {
      await fetch('/api/errors/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: errors.map((err) => ({
            level: 'error',
            message: err.message,
            stack: err.stack,
            timestamp: err.timestamp,
            file: err.url,
          })),
          source: 'debug-widget',
          url: window.location.href,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* fire-and-forget */ }
  };

  const handlePostToErrorLog = async () => {
    const errorLogs = [
      ...capturedErrors.map((err) => ({
        level: 'error' as const,
        message: err.message,
        stack: err.stack,
        timestamp: err.timestamp,
        file: err.url,
      })),
      ...consoleEntries
        .filter((e) => e.type === 'error' || e.type === 'warn')
        .map((e) => ({
          level: e.type === 'error' ? ('error' as const) : ('warn' as const),
          message: e.message,
          timestamp: new Date().toISOString(),
          file: window.location.href,
        })),
    ];

    if (errorLogs.length === 0) return;

    setPostStatus('Posting...');
    try {
      const res = await fetch('/api/errors/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: errorLogs, source: 'debug-widget', url: window.location.href }),
        signal: AbortSignal.timeout(5000),
      });
      setPostStatus(res.ok ? '✓ Posted' : '✗ Failed');
      if (res.ok) {
        setPostedToLog(true);
        setTimeout(() => setPostedToLog(false), 3000);
      }
    } catch {
      setPostStatus('✗ Network error');
    }
    setTimeout(() => setPostStatus(''), 3000);
  };

  const handleCopyForAI = async () => {
    const lines: string[] = [
      '=== HashtagPLUS Debug Info ===',
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      '',
    ];

    if (capturedErrors.length > 0) {
      lines.push(`=== JS Errors (${capturedErrors.length}) ===`);
      capturedErrors.forEach((err, i) => {
        lines.push(`[${i + 1}] ${err.message}`);
        lines.push(`    Stack: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
      });
      lines.push('');
    }

    const errors = consoleEntries.filter((e) => e.type === 'error');
    const warns = consoleEntries.filter((e) => e.type === 'warn');
    if (errors.length > 0) {
      lines.push(`=== Console Errors (${errors.length}) ===`);
      errors.forEach((e) => lines.push(`[${e.time}] ${e.message.slice(0, 300)}`));
      lines.push('');
    }
    if (warns.length > 0) {
      lines.push(`=== Console Warnings (${warns.length}) ===`);
      warns.forEach((e) => lines.push(`[${e.time}] ${e.message.slice(0, 200)}`));
      lines.push('');
    }

    lines.push('=== Service Status ===');
    Object.entries(services).forEach(([k, v]) => lines.push(`${k}: ${v}`));

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Derived counts ─────────────────────────────────────────────────────

  const browserErrorCount = capturedErrors.length;
  const consoleErrorCount = consoleEntries.filter((e) => e.type === 'error').length;
  const totalBadge = browserErrorCount;

  // ── Render helpers ─────────────────────────────────────────────────────

  const dot = (s: ServiceStatus) => (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        s === 'online' ? 'bg-green-500' : s === 'checking...' ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'
      }`}
    />
  );

  const tabClass = (t: Tab) =>
    `flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
      activeTab === t
        ? 'bg-gray-800 text-white'
        : 'text-gray-400 hover:text-gray-200'
    }`;

  if (!isClient || !visible) return null;

  return (
    <div className="relative flex-shrink-0">
      {/* ── Expanded panel — floats upward above the FAB ── */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-80 max-h-[520px] flex flex-col overflow-hidden text-white z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold">Debug Tools</span>
              {totalBadge > 0 && (
                <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {totalBadge}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white p-1 rounded"
              aria-label="Close debug panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700">
            <button className={tabClass('services')} onClick={() => setActiveTab('services')}>
              Services
            </button>
            <button className={tabClass('console')} onClick={() => setActiveTab('console')}>
              Console {consoleErrorCount > 0 && <span className="ml-1 text-red-400">({consoleErrorCount})</span>}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* ── Services tab ── */}
            {activeTab === 'services' && (
              <div className="p-3 space-y-3">
                {/* Health status */}
                <div className="space-y-1.5">
                  {(
                    [
                      { icon: Monitor, label: 'Frontend', key: 'frontend' },
                      { icon: Wifi, label: 'Backend API', key: 'backend' },
                      { icon: Database, label: 'Database', key: 'database' },
                      { icon: Activity, label: 'Debug Tracker', key: 'debugTracker' },
                    ] as const
                  ).map(({ icon: Icon, label, key }) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <Icon className="w-3 h-3" />
                        <span>{label}</span>
                        {key === 'debugTracker' && (
                          <span className="text-gray-600 text-[10px]">(= backend)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {dot(services[key])}
                        <span className={services[key] === 'online' ? 'text-green-400' : services[key] === 'checking...' ? 'text-yellow-400' : 'text-red-400'}>
                          {services[key]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                  >
                    <RefreshCw className="w-3 h-3" /> Reload
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-800 hover:bg-purple-700 rounded text-xs"
                  >
                    <Zap className="w-3 h-3" /> Clear Cache
                  </button>
                  {/* Error Logs link: /dev/error-logs on localhost, /admin/error-logs on prod (admin only) */}
                  {(isDev || isAdmin) && (
                    <button
                      onClick={() => window.open(isDev ? '/dev/error-logs' : '/admin/error-logs', '_blank')}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-800 hover:bg-red-700 rounded text-xs"
                    >
                      <ExternalLink className="w-3 h-3" /> Error Logs
                    </button>
                  )}
                </div>

                {/* Error summary */}
                {browserErrorCount > 0 && (
                  <div className="bg-red-950 border border-red-800 rounded p-2 text-xs">
                    <p className="text-red-400 font-semibold">{browserErrorCount} JS error{browserErrorCount !== 1 ? 's' : ''} captured</p>
                    <p className="text-gray-400 mt-0.5">Switch to Console tab to view details</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Console tab ── */}
            {activeTab === 'console' && (
              <div className="p-3 space-y-2">
                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyForAI}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-800 hover:bg-blue-700 rounded text-xs"
                    title="Copy all console errors and debug info to clipboard for pasting to AI"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy for AI'}
                  </button>
                  <button
                    onClick={handlePostToErrorLog}
                    disabled={browserErrorCount + consoleErrorCount === 0}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs"
                    title="Post all errors to backend error log"
                  >
                    {postedToLog ? <Check className="w-3 h-3 text-green-400" /> : <Send className="w-3 h-3" />}
                    {postedToLog ? 'Posted!' : postStatus || 'Post to Log'}
                  </button>
                  {(isDev || isAdmin) && (
                    <button
                      onClick={() => window.open(isDev ? '/dev/error-logs' : '/admin/error-logs', '_blank')}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                    >
                      <ExternalLink className="w-3 h-3" /> View Logs
                    </button>
                  )}
                </div>

                {/* Captured JS errors */}
                {capturedErrors.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-red-400 block mb-1">
                      JS Errors ({capturedErrors.length}) — auto-posted to backend
                    </span>
                    <div className="space-y-1.5">
                      {capturedErrors.slice(0, 5).map((err, i) => (
                        <div key={i} className="bg-red-950 border border-red-800 rounded p-2 text-xs">
                          <p className="text-red-300 break-words">{err.message.slice(0, 120)}</p>
                          <p className="text-gray-500 mt-0.5 font-mono text-[10px] truncate">{err.stack.split('\n')[1]}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Console log stream */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-400">
                      Console ({consoleEntries.length})
                    </span>
                    <button
                      onClick={() => {
                        consoleRef.current = [];
                        errorsRef.current = [];
                        setConsoleEntries([]);
                        setCapturedErrors([]);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-400"
                    >
                      Clear
                    </button>
                  </div>
                  {consoleEntries.length === 0 ? (
                    <p className="text-xs text-gray-600">No console output captured yet.</p>
                  ) : (
                    <div className="space-y-0.5 font-mono text-[11px] max-h-64 overflow-y-auto">
                      {consoleEntries.map((entry, i) => (
                        <div
                          key={i}
                          className={`flex gap-1.5 ${
                            entry.type === 'error'
                              ? 'text-red-400'
                              : entry.type === 'warn'
                              ? 'text-yellow-400'
                              : 'text-gray-400'
                          }`}
                        >
                          <span className="text-gray-600 shrink-0">{entry.time}</span>
                          <span className="uppercase text-[10px] shrink-0 w-8">{entry.type}</span>
                          <span className="break-all">{entry.message.slice(0, 200)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative bg-gray-900 hover:bg-gray-800 border border-gray-700 text-white rounded-full p-3.5 shadow-xl transition-all hover:scale-105 active:scale-95"
        aria-label="Toggle debug tools"
        title="Debug Tools"
      >
        {isOpen ? <ChevronDown className="w-5 h-5" /> : <Bug className="w-5 h-5" />}
        {totalBadge > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>
    </div>
  );
}
