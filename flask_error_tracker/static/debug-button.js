/**
 * Debug Button Widget — Flask Error Tracker
 *
 * Floating Action Button (FAB) in the lower-right that captures console logs
 * and JS errors in-memory. Clicking the main button expands sub-actions
 * (Reload, Test Error, View Log) upward. The log modal shows full error +
 * console output with copy-to-clipboard.
 *
 * VISIBILITY MODES:
 *   alwaysVisible: false (default) — FAB hidden, appears only when errors occur
 *   alwaysVisible: true            — FAB always visible on every page
 *
 * Auto-injected by init_error_tracker(app, debug_button='errors-only' | 'always').
 * Can also be included manually via script tag.
 *
 * Config (set BEFORE the script loads):
 *   window.DEBUG_BUTTON_CONFIG = {
 *     maxLogs: 500,
 *     position: 'bottom-right',  // or 'bottom-left'
 *     errorLogUrl: '/error-log',
 *     showTestButton: true,
 *     showReloadButton: true,
 *     alwaysVisible: false,
 *   };
 */
(function () {
  "use strict";
  if (window.__debugButtonLoaded) return;
  window.__debugButtonLoaded = true;

  var cfg = Object.assign({
    maxLogs: 500,
    position: "bottom-right",
    errorLogUrl: "/error-log",
    showTestButton: true,
    showReloadButton: true,
    alwaysVisible: false,
  }, window.DEBUG_BUTTON_CONFIG || {});

  var MAX_LOGS = cfg.maxLogs;
  var errorLog = [];
  var consoleLog = [];
  var errorCount = 0;
  var fabEl = null;
  var uiReady = false;
  var fabOpen = false;

  var _con = { log: console.log, warn: console.warn, error: console.error, info: console.info };

  /* ── Console capture ── */
  function capture(type, args) {
    var msg = Array.from(args).map(function (a) {
      try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); }
      catch (_) { return String(a); }
    }).join(" ");
    consoleLog.push({ time: new Date().toISOString(), type: type, message: msg });
    if (consoleLog.length > MAX_LOGS) consoleLog.shift();
    if (type === "error") logError("console.error: " + msg, null);
  }

  console.log   = function () { capture("log",   arguments); _con.log.apply(console, arguments); };
  console.warn  = function () { capture("warn",  arguments); _con.warn.apply(console, arguments); };
  console.error = function () { capture("error", arguments); _con.error.apply(console, arguments); };
  console.info  = function () { capture("info",  arguments); _con.info.apply(console, arguments); };

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
    showFab();
    updateBadge();
  }

  window.addEventListener("error", function (ev) {
    logError(ev.message || "Uncaught error", ev.error);
  });
  window.addEventListener("unhandledrejection", function (ev) {
    logError("Unhandled promise rejection",
      ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason)));
  });

  function showFab() { if (uiReady && fabEl) fabEl.style.display = ""; }
  function updateBadge() {
    var el = document.getElementById("debug-btn-count");
    if (el) el.textContent = errorCount;
  }

  /* ── CSS ── */
  function injectStyles() {
    var R = cfg.position !== "bottom-left";
    var posKey = R ? "right" : "left";
    var s = document.createElement("style");
    s.textContent =
      /* FAB container — column-reverse so main button is at bottom */
      ".dbg-fab{position:fixed;bottom:20px;" + posKey + ":20px;z-index:99990;" +
        "display:flex;flex-direction:column-reverse;align-items:center;gap:0}" +

      /* Main debug button */
      ".dbg-btn{background:#ef4444;color:#fff;border:none;padding:12px 18px;" +
        "border-radius:50px;cursor:pointer;font-weight:600;font-size:.9rem;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "box-shadow:0 4px 12px rgba(239,68,68,.4);z-index:99991;position:relative;" +
        "transition:background .2s,transform .15s}" +
      ".dbg-btn:hover{background:#dc2626;transform:scale(1.05)}" +
      ".dbg-btn .dbg-count{background:#fff;color:#ef4444;padding:1px 7px;" +
        "border-radius:10px;font-size:.8rem;margin-left:6px}" +

      /* FAB action tray — hidden by default, slides up when .open */
      ".dbg-fab-actions{display:flex;flex-direction:column;align-items:center;" +
        "gap:10px;margin-bottom:12px;pointer-events:none;opacity:0;" +
        "transform:translateY(20px) scale(.8);" +
        "transition:opacity .25s ease,transform .25s ease}" +
      ".dbg-fab.open .dbg-fab-actions{pointer-events:auto;opacity:1;" +
        "transform:translateY(0) scale(1)}" +

      /* Individual action buttons */
      ".dbg-fab-action{padding:8px 14px;border-radius:50px;border:none;cursor:pointer;" +
        "font-weight:600;color:#fff;font-size:.78rem;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "box-shadow:0 3px 10px rgba(0,0,0,.3);white-space:nowrap;" +
        "transition:transform .15s}" +
      ".dbg-fab-action:hover{transform:scale(1.08)}" +
      ".dbg-fab-action.reload{background:#6366f1}" +
      ".dbg-fab-action.test-error{background:#f59e0b}" +
      ".dbg-fab-action.view-log{background:#ef4444}" +
      ".dbg-fab-action.dashboard-link{background:#3b82f6;text-decoration:none;" +
        "display:inline-flex;align-items:center}" +

      /* Modal overlay */
      ".dbg-overlay{display:none;position:fixed;z-index:99999;left:0;top:0;" +
        "width:100%;height:100%;background:rgba(0,0,0,.8)}" +
      ".dbg-overlay.show{display:flex;align-items:center;justify-content:center}" +

      /* Modal */
      ".dbg-modal{background:#1e293b;border-radius:12px;max-width:850px;width:92%;" +
        "max-height:82vh;display:flex;flex-direction:column;border:1px solid #334155;overflow:hidden}" +
      ".dbg-modal-hdr{background:linear-gradient(135deg,#ef4444,#b91c1c);padding:16px 20px;" +
        "display:flex;justify-content:space-between;align-items:center}" +
      ".dbg-modal-hdr h2{color:#fff;font-size:1.15rem;margin:0;font-family:inherit}" +
      ".dbg-modal-hdr button{background:none;border:none;color:#fff;font-size:1.4rem;" +
        "cursor:pointer;padding:4px 8px}" +
      ".dbg-modal-body{flex:1;overflow-y:auto}" +
      ".dbg-log{background:#0f172a;padding:16px;font-family:'Monaco','Menlo','Courier New',monospace;" +
        "font-size:.82rem;color:#e2e8f0;white-space:pre-wrap;word-break:break-word;" +
        "min-height:200px;line-height:1.5}" +

      /* Modal actions bar */
      ".dbg-actions{padding:12px 20px;background:#0f172a;display:flex;gap:10px;" +
        "flex-wrap:wrap;border-top:1px solid #334155}" +
      ".dbg-actions button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;" +
        "font-size:.85rem;font-weight:500;font-family:inherit;transition:background .2s;color:#fff}" +
      ".dbg-copy{background:#8b5cf6}.dbg-copy:hover{background:#7c3aed}" +
      ".dbg-clear{background:#64748b}.dbg-clear:hover{background:#475569}" +

      /* Toast */
      ".dbg-toast{position:fixed;bottom:80px;" + posKey + ":20px;background:#10b981;" +
        "color:#fff;padding:10px 22px;border-radius:8px;font-size:.9rem;font-family:inherit;" +
        "z-index:100000;box-shadow:0 4px 12px rgba(0,0,0,.3);opacity:0;" +
        "transition:opacity .3s;pointer-events:none}" +
      ".dbg-toast.show{opacity:1}";

    document.head.appendChild(s);
  }

  /* ── Build DOM ── */
  function buildUI() {
    /* FAB container */
    fabEl = document.createElement("div");
    fabEl.className = "dbg-fab";
    fabEl.id = "dbg-fab";

    /* Main debug button */
    var btn = document.createElement("button");
    btn.className = "dbg-btn";
    btn.setAttribute("aria-label", "Open debug menu");
    btn.innerHTML = '\uD83D\uDC1B Debug (<span id="debug-btn-count" class="dbg-count">0</span>)';
    btn.onclick = function (e) {
      e.stopPropagation();
      fabOpen = !fabOpen;
      fabEl.classList.toggle("open", fabOpen);
    };

    /* Action tray */
    var actions = document.createElement("div");
    actions.className = "dbg-fab-actions";

    /* View Log action */
    var viewBtn = document.createElement("button");
    viewBtn.className = "dbg-fab-action view-log";
    viewBtn.textContent = "\uD83D\uDCCB View Log";
    viewBtn.onclick = function () { closeFab(); openModal(); };
    actions.appendChild(viewBtn);

    /* Reload action */
    if (cfg.showReloadButton) {
      var reloadBtn = document.createElement("button");
      reloadBtn.className = "dbg-fab-action reload";
      reloadBtn.textContent = "\uD83D\uDD04 Reload";
      reloadBtn.onclick = function () { window.location.reload(); };
      actions.appendChild(reloadBtn);
    }

    /* Test Error action */
    if (cfg.showTestButton) {
      var testBtn = document.createElement("button");
      testBtn.className = "dbg-fab-action test-error";
      testBtn.textContent = "\u26A0\uFE0F Test Error";
      testBtn.onclick = function () { closeFab(); testError(); };
      actions.appendChild(testBtn);
    }

    /* Error Dashboard link */
    if (cfg.errorLogUrl) {
      var link = document.createElement("a");
      link.className = "dbg-fab-action dashboard-link";
      link.href = cfg.errorLogUrl;
      link.textContent = "\uD83D\uDCCA Dashboard";
      actions.appendChild(link);
    }

    fabEl.appendChild(btn);
    fabEl.appendChild(actions);

    if (!cfg.alwaysVisible && errorCount === 0) fabEl.style.display = "none";
    document.body.appendChild(fabEl);

    /* Close FAB when clicking outside */
    document.addEventListener("click", function (e) {
      if (fabOpen && fabEl && !fabEl.contains(e.target)) {
        closeFab();
      }
    });

    /* Toast element */
    var toastEl = document.createElement("div");
    toastEl.className = "dbg-toast";
    toastEl.id = "dbg-toast";
    document.body.appendChild(toastEl);

    /* Modal overlay */
    var ov = document.createElement("div");
    ov.className = "dbg-overlay";
    ov.id = "dbg-overlay";
    ov.onclick = function (e) { if (e.target === ov) closeModal(); };

    var modal = document.createElement("div");
    modal.className = "dbg-modal";

    var hdr = document.createElement("div");
    hdr.className = "dbg-modal-hdr";
    hdr.innerHTML = '<h2>\uD83D\uDC1B Console Log</h2>' +
      '<button aria-label="Close" id="dbg-close-btn">&times;</button>';

    var body = document.createElement("div");
    body.className = "dbg-modal-body";
    var log = document.createElement("div");
    log.className = "dbg-log";
    log.id = "dbg-log-content";
    log.textContent = "No logs yet.";
    body.appendChild(log);

    var modalActions = document.createElement("div");
    modalActions.className = "dbg-actions";

    var copyBtn = document.createElement("button");
    copyBtn.className = "dbg-copy";
    copyBtn.textContent = "\uD83D\uDCCB Copy Logs";
    copyBtn.onclick = copyLogs;
    modalActions.appendChild(copyBtn);

    var clearBtn = document.createElement("button");
    clearBtn.className = "dbg-clear";
    clearBtn.textContent = "\uD83D\uDDD1\uFE0F Clear";
    clearBtn.onclick = clearAll;
    modalActions.appendChild(clearBtn);

    modal.appendChild(hdr);
    modal.appendChild(body);
    modal.appendChild(modalActions);
    ov.appendChild(modal);
    document.body.appendChild(ov);

    document.getElementById("dbg-close-btn").onclick = closeModal;

    uiReady = true;
    updateBadge();
    if (errorCount > 0) showFab();
  }

  function closeFab() {
    fabOpen = false;
    if (fabEl) fabEl.classList.remove("open");
  }

  /* ── Modal actions ── */
  function openModal() {
    var errText = errorLog.map(function (e, i) {
      return "[" + (i + 1) + "] ERROR " + e.timestamp +
        "\nMessage: " + e.message + "\nError: " + e.error +
        "\nStack: " + e.stack + "\nURL: " + e.url;
    }).join("\n" + "=".repeat(70) + "\n");

    var conText = consoleLog.map(function (l, i) {
      return "[" + (i + 1) + "] " + l.type.toUpperCase() + " " + l.time + "\n" + l.message;
    }).join("\n\n");

    var full = "=== ERROR LOG (" + errorLog.length + ") ===\n\n" +
      (errText || "No errors logged.") +
      "\n\n" + "=".repeat(70) + "\n\n=== CONSOLE LOG (" + consoleLog.length + ") ===\n\n" +
      (conText || "No console logs captured.");

    document.getElementById("dbg-log-content").textContent = full;
    document.getElementById("dbg-overlay").classList.add("show");
  }

  function closeModal() {
    document.getElementById("dbg-overlay").classList.remove("show");
  }

  function copyLogs() {
    var text = document.getElementById("dbg-log-content").innerText;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(function () { toast("\uD83D\uDCCB Copied to clipboard"); })
        .catch(fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); toast("\uD83D\uDCCB Copied to clipboard"); }
      catch (_) { toast("\u26A0\uFE0F Copy failed"); }
      document.body.removeChild(ta);
    }
  }

  function clearAll() {
    errorLog = [];
    consoleLog = [];
    errorCount = 0;
    updateBadge();
    document.getElementById("dbg-log-content").textContent = "Logs cleared.";
    if (!cfg.alwaysVisible && fabEl) fabEl.style.display = "none";
    toast("\uD83D\uDDD1\uFE0F Logs cleared");
  }

  function testError() {
    try { throw new Error("Test error from debug button"); }
    catch (e) { logError("Test error triggered", e); }
    toast("\u26A0\uFE0F Test error logged");
  }

  function toast(msg) {
    var t = document.getElementById("dbg-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2000);
  }

  /* ── Keyboard ── */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (document.getElementById("dbg-overlay").classList.contains("show")) {
        closeModal();
      } else {
        closeFab();
      }
    }
  });

  /* ── Init ── */
  function init() { injectStyles(); buildUI(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* ── Public API ── */
  window.DebugButton = {
    show: openModal,
    hide: closeModal,
    logError: logError,
    getErrorLog: function () { return errorLog.slice(); },
    getConsoleLog: function () { return consoleLog.slice(); },
    clear: clearAll,
    openFab: function () { fabOpen = true; if (fabEl) fabEl.classList.add("open"); },
    closeFab: closeFab,
  };
})();
