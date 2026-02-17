# Flask Error Tracker — AI Agent Context

This file provides context for AI coding assistants (Kiro, Cursor, Copilot, Windsurf, etc.) working on this project.

## Project Overview

Flask Error Tracker is a unified error logging, tracking, and debugging system for Flask applications. It can be used as an embeddable Flask Blueprint or a standalone microservice.

## Architecture

### Core Components

| Component | Path | Purpose |
|-----------|------|---------|
| ErrorDatabase | `flask_error_tracker/database.py` | SQLite-backed error storage with deduplication, categories, stats |
| Blueprint | `flask_error_tracker/blueprint.py` | Flask Blueprint with dashboard + REST API routes |
| Dashboard | `flask_error_tracker/templates/error_log.html` | Real-time error viewer with live log, modals, debug report copy |
| Error Collector | `flask_error_tracker/static/error-collector.js` | Frontend JS that auto-captures browser errors and sends to API |
| Standalone App | `app.py` | Runs the tracker as an independent Flask server |

### Database Schema

Two tables in SQLite:

- `errors` — Deduplicated error entries (hash, category, type, message, occurrence count, resolved status)
- `error_occurrences` — Individual occurrences with full context (stack trace, request URL, console logs, etc.)

### Default Error Categories

`database`, `api`, `frontend`, `server`, `worker`, `test`, `content_processing`

Custom categories are auto-registered when first used, or can be defined in `config.yaml` under `custom_categories`.

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/error-log` | Dashboard HTML page |
| GET | `/api/errors` | List errors (filterable by category) |
| GET | `/api/errors/<id>` | Error detail with occurrences |
| GET | `/api/errors/<id>/debug-report` | Markdown debug report for AI/issue trackers |
| POST | `/api/errors/<id>/resolve` | Mark error resolved |
| DELETE | `/api/errors/<id>` | Delete error |
| POST | `/api/errors/clear-resolved` | Clear all resolved errors |
| GET | `/api/errors/stats` | Statistics for live polling |
| POST | `/api/log-frontend-error` | Receive batched frontend errors |

### Integration Patterns

**As a Blueprint (embed in existing Flask app):**
```python
from flask_error_tracker import init_error_tracker
init_error_tracker(app)
```

**As a standalone service:**
```bash
python app.py --port 5100
```

**Frontend error collection (add to any HTML page):**
```html
<script src="/error-tracker-static/error-collector.js"></script>
```

## Error Logging Convention

Every try/except block should log to the error database:

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

## Debug Report Generation

The `generate_debug_report()` method produces a Markdown report suitable for pasting into any AI assistant or issue tracker. It includes error details, stack traces, context, request info, and category-specific fields.

## Configuration

See `config.example.yaml` for all options. Key settings:
- `error_logging.enabled` — master on/off switch
- `error_logging.categories` — enable/disable per category
- `error_logging.custom_categories` — define project-specific categories
- `error_logging.database_path` — SQLite file location

## Testing

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## File Organization Rules

- All Python source lives in `flask_error_tracker/`
- Templates in `flask_error_tracker/templates/`
- Static assets in `flask_error_tracker/static/`
- Tests in `tests/`
- No scripts in the project root except `app.py`
