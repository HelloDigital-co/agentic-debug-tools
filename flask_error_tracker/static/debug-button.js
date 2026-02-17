/**
 * Debug Button Widget — Flask Error Tracker
 *
 * A self-contained floating debug button (lower-right corner) that captures
 * console logs and JS errors in-memory, displays them in a modal, and lets
 * users copy the full log to clipboard.
 *
 * Inspired by the OpenClaw-Jarvis debug button pattern.
 *
 * Usage — add to any HTML page:
 *   <script src="/error-tracker-static/debug-button.js"></script>
 *
 * Optional config (set BEFORE the script loads):
 *   window.DEBUG_BUTTON_CONFIG = {
 *     maxLogs: 500,          // max log entries to keep (default 500)
 *     position: 'bottom-right', // 'bottom-right' | 'bottom-left' (default 'bottom-right')
 *     errorLogUrl: '/error-log', // link to full error dashboard (null to hide)
 *     showTestButton: true,  // show "Test Error" button inside modal (default true)
 *   };
 */
(function () {
  "use strict";

  /* ── Config ── */
  const cfg = Object.assign({
    maxLogs: 500,
    position: "bottom-right",
    errorLogUrl: "/error-log",
    showTestButton: true,
  }, window.DEBUG_BUTTON_CONFIG || {});

  const MAX_LOGS = cfg.maxLogs;

  /* ── State ── */
  let errorLog = [];
  let consoleLog = [];
  let errorCount = 0;

  /* ── Preserve originals ── */
  const _console = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };


  /* ── Console capture ── */
  function capture(type, args) {
    const message = Array.from(args).map(function (a) {
      try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); }
      catch (_) { return String(a); }
    }).join(" ");

    consoleLog.push({ time: new Date().toISOString(), type: type, message: message });
    if (consoleLog.length > MAX_LOGS) consoleLog.shift();
  }

  console.log   = function () { capture("log",   arguments); _console.log.apply(console, arguments); };
  console.warn  = function () { capture("warn",  arguments); _console.warn.apply(console, arguments); };
  console.error = function () { capture("error", arguments); _console.error.apply(console, arguments); };
  console.info  = function () { capture("info",  arguments); _console.info.apply(console, arguments); };

  /* ── Error capture ── */
  function logError(message, error) {
    errorLog.push({
      timestamp: new Date().toISOString(),
      message: message,
      error: error ? error.toString() : "Unknown error",
      stack: error && error.stack ? error.stack : "No stack trace",
      url: window.location.href,
    });
    if (errorLog.length > MAX_LOGS) errorLog.shift();
    errorCount = errorLog.length;
    updateBadge();
  }

  window.addEventListener("error", function (event) {
    logError(event.message || "Uncaught error", event.error);
  });

  window.addEventListener("unhandledrejection", function (event) {
    logError("Unhandled promise rejection", event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });

  /* ── Badge update ── */
  function updateBadge() {
    var el = document.getElementById("debug-btn-count");
    if (el) el.textContent = errorCount;
  }


  /* ── Inject CSS ── */
  function injectStyles() {
    var isRight = cfg.position !== "bottom-left";
    var style = document.createElement("style");
    style.textContent = [
      ".dbg-btn{position:fixed;bottom:20px;" + (isRight ? "right:20px" : "left:20px") + ";background:#ef4444;color:#fff;border:none;padding:12px 18px;border-radius:50px;cursor:pointer;font-weight:600;font-size:.9rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 12px rgba(239,68,68,.4);z-index:99990;transition:background .2s,transform .15s}",
      ".dbg-btn:hover{background:#dc2626;transform:scale(1.05)}",
      ".dbg-btn .dbg-count{background:#fff;color:#ef4444;padding:1px 7px;border-radius:10px;font-size:.8rem;margin-left:6px}",
      ".dbg-overlay{display:none;position:fixed;z-index:99999;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.8)}",
      ".dbg-overlay.show{display:flex;align-items:center;justify-content:center}",
      ".dbg-modal{background:#1e293b;border-radius:12px;padding:0;max-width:850px;width:92%;max-height:82vh;display:flex;flex-direction:column;border:1px solid #334155;overflow:hidden}",
      ".dbg-modal-hdr{background:linear-gradient(135deg,#ef4444 0%,#b91c1c 100%);padding:16px 20px;display:flex;justify-content:space-between;align-items:center}",
      ".dbg-modal-hdr h2{color:#fff;font-size:1.15rem;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}",
      ".dbg-modal-hdr button{background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;padding:4px 8px;line-height:1}",
      ".dbg-modal-body{flex:1;overflow-y:auto;padding:0}",
      ".dbg-log{background:#0f172a;border:none;padding:16px;font-family:'Monaco','Menlo','Courier New',monospace;font-size:.82rem;color:#e2e8f0;white-space:pre-wrap;word-break:break-word;min-height:200px;line-height:1.5}",
      ".dbg-modal-actions{padding:12px 20px;background:#0f172a;display:flex;gap:10px;flex-wrap:wrap;border-top:1px solid #334155}",
      ".dbg-modal-actions button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:.85rem;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transition:background .2s}",
      ".dbg-btn-copy{background:#8b5cf6;color:#fff}.dbg-btn-copy:hover{background:#7c3aed}",
      ".dbg-btn-clear{background:#64748b;color:#fff}.dbg-btn-clear:hover{background:#475569}",
      ".dbg-btn-test{background:#f59e0b;color:#fff}.dbg-btn-test:hover{background:#d97706}",
      ".dbg-btn-link{background:#3b82f6;color:#fff;text-decoration:none;display:inline-flex;align-items:center}.dbg-btn-link:hover{background:#2563eb}",
      ".dbg-toast{position:fixed;bottom:80px;" + (isRight ? "right:20px" : "left:20px") + ";background:#10b981;color:#fff;padding:10px 22px;border-radius:8px;font-size:.9rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;z-index:100000;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:0;transition:opacity .3s;pointer-events:none}",
      ".dbg-toast.show{opacity:1}",
    ].join("\n");
    document.head.appendChild(style);
  }


  /* ── Build DOM ── */
  function buildUI() {
    /* Button */
    var btn = document.createElement("button");
    btn.className = "dbg-btn";
    btn.setAttribute("aria-label", "Open debug console");
    btn.innerHTML = '🐛 Debug (<span id="debug-btn-count" class="dbg-count">0</span>)';
    btn.onclick = showModal;
    document.body.appendChild(btn);

    /* Toast */
    var toast = document.createElement("div");
    toast.className = "dbg-toast";
    toast.id = "dbg-toast";
    document.body.appendChild(toast);

    /* Modal overlay */
    var overlay = document.createElement("div");
    overlay.className = "dbg-overlay";
    overlay.id = "dbg-overlay";
    overlay.onclick = function (e) { if (e.target === overlay) hideModal(); };

    var modal = document.createElement("div");
    modal.className = "dbg-modal";

    /* Header */
    var hdr = document.createElement("div");
    hdr.className = "dbg-modal-hdr";
    hdr.innerHTML = '<h2>🐛 Console Log</h2><button onclick="document.getElementById(\'dbg-overlay\').classList.remove(\'show\')" aria-label="Close">&times;</button>';

    /* Body */
    var body = document.createElement("div");
    body.className = "dbg-modal-body";
    var log = document.createElement("div");
    log.className = "dbg-log";
    log.id = "dbg-log-content";
    log.textContent = "No logs yet.";
    body.appendChild(log);

    /* Actions */
    var actions = document.createElement("div");
    actions.className = "dbg-modal-actions";

    var copyBtn = document.createElement("button");
    copyBtn.className = "dbg-btn-copy";
    copyBtn.textContent = "📋 Copy Logs";
    copyBtn.onclick = copyLogs;
    actions.appendChild(copyBtn);

    var clearBtn = document.createElement("button");
    clearBtn.className = "dbg-btn-clear";
    clearBtn.textContent = "🗑️ Clear";
    clearBtn.onclick = clearLogs;
    actions.appendChild(clearBtn);

    if (cfg.showTestButton) {
      var testBtn = document.createElement("button");
      testBtn.className = "dbg-btn-test";
      testBtn.textContent = "⚠️ Test Error";
      testBtn.onclick = testError;
      actions.appendChild(testBtn);
    }

    if (cfg.errorLogUrl) {
      var link = document.createElement("a");
      link.className = "dbg-btn-link";
      link.href = cfg.errorLogUrl;
      link.textContent = "📊 Error Dashboard";
      actions.appendChild(link);
    }

    modal.appendChild(hdr);
    modal.appendChild(body);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }


  /* ── Modal actions ── */
  function showModal() {
    var errorText = errorLog.map(function (e, i) {
      return "[" + (i + 1) + "] ERROR " + e.timestamp +
        "\nMessage: " + e.message +
        "\nError: " + e.error +
        "\nStack: " + e.stack +
        "\nURL: " + e.url;
    }).join("\n" + "=".repeat(70) + "\n");

    var consoleText = consoleLog.map(function (l, i) {
      return "[" + (i + 1) + "] " + l.type.toUpperCase() + " " + l.time + "\n" + l.message;
    }).join("\n\n");

    var full = "=== ERROR LOG (" + errorLog.length + " entries) ===\n\n" +
      (errorText || "No errors logged.") +
      "\n\n" + "=".repeat(70) + "\n\n=== CONSOLE LOG (" + consoleLog.length + " entries) ===\n\n" +
      (consoleText || "No console logs captured.");

    var el = document.getElementById("dbg-log-content");
    if (el) el.textContent = full;
    document.getElementById("dbg-overlay").classList.add("show");
  }

  function hideModal() {
    document.getElementById("dbg-overlay").classList.remove("show");
  }

  function copyLogs() {
    var text = document.getElementById("dbg-log-content").innerText;
    /* Clipboard with textarea fallback for HTTP contexts */
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { showToast("📋 Copied to clipboard"); }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); showToast("📋 Copied to clipboard"); }
      catch (_) { showToast("⚠️ Copy failed — use Ctrl+A in the log"); }
      document.body.removeChild(ta);
    }
  }

  function clearLogs() {
    errorLog = [];
    consoleLog = [];
    errorCount = 0;
    updateBadge();
    var el = document.getElementById("dbg-log-content");
    if (el) el.textContent = "Logs cleared.";
    showToast("🗑️ Logs cleared");
  }

  function testError() {
    try { throw new Error("Test error from debug button"); }
    catch (e) { logError("Test error triggered", e); }
    showToast("⚠️ Test error logged — check the count");
  }

  function showToast(msg) {
    var t = document.getElementById("dbg-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2000);
  }

  /* ── Keyboard shortcut ── */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideModal();
  });

  /* ── Init on DOM ready ── */
  function init() {
    injectStyles();
    buildUI();
    updateBadge();
    _console.info("[DebugButton] Debug button active — click 🐛 in the corner");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ── Public API ── */
  window.DebugButton = {
    show: showModal,
    hide: hideModal,
    logError: logError,
    getErrorLog: function () { return errorLog.slice(); },
    getConsoleLog: function () { return consoleLog.slice(); },
    clear: clearLogs,
  };

})();
