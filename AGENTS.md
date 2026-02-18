# Agentic Debug Tools — AI Agent Context

This file is for AI coding assistants (Kiro, Cursor, Copilot, Windsurf, etc.). Read this to integrate the debug tools into a Flask project.

## Quick Integration (do this first)

### Step 1: Install

```bash
# From GitHub
pip install git+https://github.com/HelloDigital-co/agentic-debug-tools.git

# Or from a local subfolder
pip install -e ./Agentic-Debug-Tools-20260218
```

### Step 2: Add to Flask app

```python
from flask_error_tracker import init_error_tracker

# Add this after creating your Flask app
init_error_tracker(app)
```

That's it. Every HTML page now gets:
- A floating debug button (FAB) in the lower-right corner
- Automatic JS error capture (window.onerror, unhandled rejections, console.error, failed fetches)
- Backend error logging with SQLite storage
- A dashboard at `/error-log`

### Step 3: Add error logging to existing try/except blocks

```python
from flask_error_tracker import get_error_db
import traceback

try:
    result = some_operation()
except Exception as e:
    get_error_db().log_error(
        category='api',
        error_type=type(e).__name__,
        error_message=str(e),
        context='What was being attempted',
        stack_trace=traceback.format_exc(),
    )
    raise
```

## Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| ErrorDatabase | `flask_error_tracker/database.py` | SQLite error storage with deduplication, categories, stats |
| Blueprint | `flask_error_tracker/blueprint.py` | Flask Blueprint with dashboard + REST API |
| Dashboard | `flask_error_tracker/templates/error_log.html` | Real-time error viewer with live log, modals, debug reports |
| Error Collector | `flask_error_tracker/static/error-collector.js` | Auto-captures browser errors and sends to backend API |
| Debug Button | `flask_error_tracker/static/debug-button.js` | FAB widget — click to expand: View Log, Reload, Test Error |
| Standalone App | `app.py` | Runs the tracker as an independent Flask server |

## init_error_tracker() Options

```python
init_error_tracker(
    app,
    error_db=None,              # Custom ErrorDatabase instance (uses singleton if None)
    url_prefix='',              # URL prefix for all routes
    catch_flask_errors=True,    # Register global Flask error handler
    debug_button='errors-only', # 'errors-only' | 'always' | False
)
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/error-log` | Dashboard HTML |
| GET | `/api/errors` | List errors (filter by `?category=`) |
| GET | `/api/errors/<id>` | Error detail with occurrences |
| GET | `/api/errors/<id>/debug-report` | Markdown report for AI/issue trackers |
| POST | `/api/errors/<id>/resolve` | Mark resolved |
| DELETE | `/api/errors/<id>` | Delete |
| POST | `/api/errors/clear-resolved` | Clear resolved |
| GET | `/api/errors/stats` | Stats (for polling) |
| POST | `/api/log-frontend-error` | Receive frontend errors (JSON batch) |

## Error Categories

Default: `database`, `api`, `frontend`, `server`, `worker`, `test`, `content_processing`

Custom categories auto-register on first use. Define in `config.yaml`:
```yaml
error_logging:
  custom_categories:
    payments: "Payment Processing"
```

## JS-Only Usage (no Python backend)

```html
<script src="/error-tracker-static/debug-button.js"></script>
```

Config via `window.DEBUG_BUTTON_CONFIG`:
- `position`: `'bottom-right'` or `'bottom-left'`
- `showTestButton`: `true/false`
- `showReloadButton`: `true/false`
- `errorLogUrl`: URL to dashboard (or `null`)
- `alwaysVisible`: `true/false`
- `maxLogs`: max entries to keep (default 500)

Public API: `window.DebugButton.show()`, `.hide()`, `.logError(msg, err)`, `.clear()`, `.openFab()`, `.closeFab()`

## Database Schema

- `errors` — deduplicated entries (hash, category, type, message, count, resolved)
- `error_occurrences` — individual occurrences (stack trace, request URL, console logs, etc.)

## File Organization

- Python package: `flask_error_tracker/`
- Templates: `flask_error_tracker/templates/`
- Static JS: `flask_error_tracker/static/`
- Tests: `tests/`
- Standalone server: `app.py`

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```
