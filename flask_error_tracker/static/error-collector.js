/**
 * Frontend Error Collector
 * Captures JS errors, console errors, failed fetch requests, and toast errors,
 * then batches them to the backend error log API.
 *
 * Include in any HTML page: <script src="/error-tracker-static/error-collector.js"></script>
 */
(function () {
  "use strict";

  const ERROR_ENDPOINT = "/api/log-frontend-error";
  const MAX_CONSOLE_LOGS = 50;
  const BATCH_INTERVAL = 5000;

  let consoleLogs = [];
  let pendingErrors = [];
  let pageLoadTime = Date.now();

  const originalConsole = {
    log: console.log, warn: console.warn, error: console.error, info: console.info,
  };

  function captureConsoleLog(type, args) {
    const entry = {
      type,
      message: Array.from(args).map(a => { try { return typeof a === "object" ? JSON.stringify(a) : String(a); } catch (e) { return String(a); } }).join(" "),
      timestamp: new Date().toISOString(),
      timeSinceLoad: Date.now() - pageLoadTime,
    };
    consoleLogs.push(entry);
    if (consoleLogs.length > MAX_CONSOLE_LOGS) consoleLogs.shift();
    if (type === "error") reportError({ error_type: "ConsoleError", error_message: entry.message, source: "console.error" });
  }

  console.log = function () { captureConsoleLog("log", arguments); originalConsole.log.apply(console, arguments); };
  console.warn = function () { captureConsoleLog("warn", arguments); originalConsole.warn.apply(console, arguments); };
  console.error = function () { captureConsoleLog("error", arguments); originalConsole.error.apply(console, arguments); };
  console.info = function () { captureConsoleLog("info", arguments); originalConsole.info.apply(console, arguments); };

  window.onerror = function (message, source, lineno, colno, error) {
    reportError({
      error_type: error ? error.name : "JavaScriptError",
      error_message: message,
      source: "window.onerror",
      extra_data: { file: source, line: lineno, column: colno, stack: error ? error.stack : null },
    });
    return false;
  };

  window.addEventListener("unhandledrejection", function (event) {
    reportError({
      error_type: "UnhandledPromiseRejection",
      error_message: event.reason ? String(event.reason) : "Promise rejected",
      source: "unhandledrejection",
      extra_data: { stack: event.reason && event.reason.stack ? event.reason.stack : null },
    });
  });

  const originalFetch = window.fetch;
  window.fetch = function (url, options) {
    return originalFetch.apply(this, arguments).then(response => {
      if (!response.ok && response.status >= 400) {
        response.clone().text().then(body => {
          reportError({
            error_type: `HTTP${response.status}`,
            error_message: `Fetch failed: ${response.status} ${response.statusText}`,
            source: "fetch",
            request_url: typeof url === "string" ? url : url.url,
            http_status: response.status,
            response_body: body.substring(0, 500),
          });
        }).catch(() => {});
      }
      return response;
    }).catch(error => {
      reportError({
        error_type: "FetchError",
        error_message: error.message || "Network request failed",
        source: "fetch",
        request_url: typeof url === "string" ? url : url.url || "unknown",
        extra_data: { stack: error.stack },
      });
      throw error;
    });
  };

  window.captureToastError = function (type, title, message) {
    if (type === "error" || type === "warning") {
      reportError({ error_type: "ToastError", error_message: `${title}: ${message}`, source: "toast", extra_data: { toast_type: type } });
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof window.showToast === "function") {
      const orig = window.showToast;
      window.showToast = function (type, title, message, duration) {
        window.captureToastError(type, title, message);
        return orig.apply(this, arguments);
      };
    }
  });

  function reportError(errorData) {
    pendingErrors.push({
      ...errorData,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      console_logs: consoleLogs.slice(-20),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    if (errorData.error_type === "JavaScriptError" || errorData.error_type === "UnhandledPromiseRejection") flushErrors();
  }

  function flushErrors() {
    if (pendingErrors.length === 0) return;
    const batch = pendingErrors.splice(0, pendingErrors.length);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ERROR_ENDPOINT, JSON.stringify({ errors: batch }));
    } else {
      originalFetch(ERROR_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errors: batch }), keepalive: true,
      }).catch(() => {});
    }
  }

  setInterval(flushErrors, BATCH_INTERVAL);
  window.addEventListener("beforeunload", flushErrors);
  window.addEventListener("pagehide", flushErrors);

  window.ErrorCollector = {
    report: function (type, message, extra) { reportError({ error_type: type, error_message: message, source: "manual", extra_data: extra }); },
    getConsoleLogs: function () { return consoleLogs.slice(); },
    flush: flushErrors,
    getPendingCount: function () { return pendingErrors.length; },
  };

  originalConsole.info("[ErrorCollector] Frontend error tracking active");
})();
