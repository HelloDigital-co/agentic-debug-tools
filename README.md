# Flask Error Tracker

A unified error logging, tracking, and debugging dashboard for Flask applications.

- **Embeddable**: Drop into any Flask app as a Blueprint
- **Standalone**: Run as its own microservice
- **Frontend capture**: Auto-collects browser JS errors, failed fetches, console errors
- **AI-friendly debug reports**: One-click Markdown export for any AI assistant or issue tracker
- **Live dashboard**: Real-time error stream, category tabs, stats, resolution tracking
- **Configurable categories**: Ships with sensible defaults, add your own

## Quick Start

### As a Blueprint (embed in your Flask app)

```python
from flask import Flask
from flask_error_tracker import init_error_tracker

app = Flask(__name__)
init_error_tracker(app)
```

The debug button auto-injects into every HTML page. By default it's hidden and only appears when JS errors are detected. To make it always visible:

```python
init_error_tracker(app, debug_button='always')
```

Options for `debug_button`:
- `'errors-only'` (default) — hidden until a JS error, console.error, or unhandled rejection occurs
- `'always'` — visible on every page regardless of errors
- `False` — disabled, no auto-injection

Then visit `/error-log` in your app.

### As a Standalone Service

```bash
pip install -e .
python app.py --port 5100
```

Dashboard at `http://localhost:5100/error-log`

## Logging Errors

### Python (backend)

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
        context='Calling payment gateway',
        stack_trace=traceback.format_exc(),
    )
    raise
```

### JavaScript (frontend)

Add to any HTML page:
```html
<script src="/error-tracker-static/error-collector.js"></script>
```

Auto-captures JS errors, failed fetches, console.error, and toast errors. Manual reporting:
```javascript
ErrorCollector.report('CustomError', 'Something broke', { userId: 123 });
```

### Debug Button (floating widget)

Add a self-contained debug button to any page — captures console logs and JS errors in-memory, shows them in a modal, with copy-to-clipboard:
```html
<script src="/error-tracker-static/debug-button.js"></script>
```

A red 🐛 Debug button appears in the lower-right corner with a live error count badge. Click it to view all captured errors and console output. Optional config:
```html
<script>
  window.DEBUG_BUTTON_CONFIG = {
    position: 'bottom-right',   // or 'bottom-left'
    errorLogUrl: '/error-log',  // link to full dashboard (null to hide)
    showTestButton: true,       // show test error button in modal
    maxLogs: 500,               // max log entries to keep
  };
</script>
<script src="/error-tracker-static/debug-button.js"></script>
```

Public API:
```javascript
DebugButton.show();           // open the modal
DebugButton.hide();           // close it
DebugButton.logError(msg, e); // manually log an error
DebugButton.clear();          // clear all logs
DebugButton.getErrorLog();    // get error entries
DebugButton.getConsoleLog();  // get console entries
```

## Default Categories

`database`, `api`, `frontend`, `server`, `worker`, `test`, `content_processing`

Custom categories are auto-registered on first use, or define them in `config.yaml`:
```yaml
error_logging:
  custom_categories:
    payments: "Payment Processing"
    auth: "Authentication"
```

## Configuration

Copy `config.example.yaml` to `config.yaml` and customize. Key options:
- `enabled` — master on/off switch
- `database_path` — where to store the SQLite database
- `categories` — enable/disable individual categories
- `custom_categories` — add project-specific categories

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

## Dashboard Features

- Real-time error statistics
- Category-based filtering tabs
- Error detail modal with full context
- Copy debug report (Markdown) for AI assistants
- Live error stream footer
- Debug floating action buttons: export JSON, copy latest report, send test error
- Mark resolved / delete / clear resolved

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## AI Agent Support

- `AGENTS.md` — universal AI agent context file
- `.kiro/steering/error-logging.md` — Kiro steering rules
- `.kiro/hooks/` — automated hooks for error logging enforcement

## License

MIT

## Multi-Root Workspace (HelloDigital-Site-Recovery-Tools)

This package is used as an editable install in the HelloDigital-Site-Recovery-Tools project. To get full editor support (file tree, diagnostics, code navigation) for both projects simultaneously:

1. Open `BrianKenyon.code-workspace` from the HelloDigital-Site-Recovery-Tools project root
2. Both folders appear in the sidebar — edits to this package take effect immediately

The workspace file lives at:
```
/Users/briankenyon/Development/Active/HelloDigital-Site-Recovery-Tools/BrianKenyon.code-workspace
```
