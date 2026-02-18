# Agentic Debug Tools

Error logging, tracking, and a floating debug button (FAB) for Flask applications. Built for AI-assisted development — any agent (Kiro, Cursor, Copilot, Windsurf) can read `AGENTS.md` and integrate this into your project.

## Quick Start (2 lines)

```python
from flask_error_tracker import init_error_tracker

init_error_tracker(app)  # That's it. Debug button + error tracking enabled.
```

Visit `/error-log` for the full dashboard.

## What You Get

- Floating Action Button (FAB) in the lower-right corner with expandable actions: View Log, Reload, Test Error, Dashboard link
- In-memory console + error capture with modal viewer and copy-to-clipboard
- Backend error tracking with SQLite (deduplication, categories, resolution tracking)
- Frontend error collector that auto-captures JS errors, failed fetches, console.error
- AI-friendly debug reports in Markdown — one-click copy for any AI assistant or issue tracker
- Live error stream dashboard with category tabs, stats, and polling

## Installation

### From GitHub (recommended)

```bash
pip install git+https://github.com/HelloDigital-co/agentic-debug-tools.git
```

### From a local clone

```bash
git clone https://github.com/HelloDigital-co/agentic-debug-tools.git
pip install -e ./agentic-debug-tools
```

### Subfolder approach (copy into your project)

Copy the `flask_error_tracker/` directory into your project and import directly. No pip install needed — just make sure `flask` and `pyyaml` are in your requirements.

## Integration

### As a Flask Blueprint (recommended)

```python
from flask import Flask
from flask_error_tracker import init_error_tracker

app = Flask(__name__)
init_error_tracker(app)
```

The debug button and error collector auto-inject into every HTML response. Options:

| `debug_button=` | Behavior |
|---|---|
| `'errors-only'` (default) | Hidden until a JS error occurs |
| `'always'` | Visible on every page |
| `False` | Disabled |

### JS-Only (no Python backend)

Drop the debug button into any HTML page:

```html
<script src="/error-tracker-static/debug-button.js"></script>
```

Optional config:
```html
<script>
window.DEBUG_BUTTON_CONFIG = {
  position: 'bottom-right',
  showTestButton: true,
  showReloadButton: true,
  errorLogUrl: '/error-log',
  alwaysVisible: false,
  maxLogs: 500,
};
</script>
```

### Standalone Microservice

```bash
python app.py --port 5100
```

Other apps POST errors to `/api/log-frontend-error`.

## Logging Errors (Python)

```python
from flask_error_tracker import get_error_db
import traceback

try:
    result = risky_operation()
except Exception as e:
    get_error_db().log_error(
        category='api',
        error_type=type(e).__name__,
        error_message=str(e),
        stack_trace=traceback.format_exc(),
    )
    raise
```

## Public JS API

```javascript
DebugButton.show();           // open the log modal
DebugButton.hide();           // close the log modal
DebugButton.logError(msg, e); // manually log an error
DebugButton.clear();          // clear all logs
DebugButton.getErrorLog();    // get error entries
DebugButton.getConsoleLog();  // get console entries
DebugButton.openFab();        // expand FAB actions
DebugButton.closeFab();       // collapse FAB actions

ErrorCollector.report('CustomError', 'Something broke', { extra: 'data' });
ErrorCollector.flush();       // force-send pending errors to backend
```

## Default Error Categories

`database`, `api`, `frontend`, `server`, `worker`, `test`, `content_processing`

Custom categories auto-register on first use, or define in `config.yaml`:
```yaml
error_logging:
  custom_categories:
    payments: "Payment Processing"
    auth: "Authentication"
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/error-log` | Dashboard |
| GET | `/api/errors` | List errors |
| GET | `/api/errors/<id>` | Error detail |
| GET | `/api/errors/<id>/debug-report` | Markdown debug report |
| POST | `/api/errors/<id>/resolve` | Mark resolved |
| DELETE | `/api/errors/<id>` | Delete |
| POST | `/api/errors/clear-resolved` | Clear resolved |
| GET | `/api/errors/stats` | Stats (for polling) |
| POST | `/api/log-frontend-error` | Receive frontend errors |

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## For AI Agents

See `AGENTS.md` for structured context that any AI coding assistant can consume.

## License

MIT
