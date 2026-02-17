---
inclusion: always
---

# Error Logging Requirements

## Critical Rule for All Code

All code in this project MUST implement verbose error logging to the centralized error database.

### Error Categories

Default categories: `database`, `api`, `frontend`, `server`, `worker`, `test`, `content_processing`

Custom categories are auto-registered on first use or defined in `config.yaml`.

### Required Error Information

Every logged error MUST include:
1. **Category** — one of the registered categories
2. **Error Type** — exception class name or error code
3. **Error Message** — human-readable description
4. **Context** — what operation was being performed
5. **Stack Trace** — full traceback when available

### Implementation Pattern

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
        context='Performing API call to external service',
        stack_trace=traceback.format_exc(),
        extra_data={'endpoint': url, 'method': 'POST'}
    )
    raise
```

### Category-Specific Fields

- **frontend**: `page_url`, `console_logs`, `extra_data` (user_agent, viewport), `source`
- **server**: `request_url`, `http_status`, `stack_trace`, `extra_data` (method, headers)
- **api**: `request_url`, `request_params`, `http_status`, `response_body`, `domain`
- **database**: `context`, `extra_data` (table, params)
- **worker**: `job_id`, `domain`, `context`
- **test**: `page_url`, `screenshot_path`, `console_logs`, `run_id`, `suite`, `test_id`, `test_name`

### Console Output

Errors are automatically printed to console when `log_to_console: true`:
```
❌ [API] HTTPError: 429 Too Many Requests
```

### Frontend Error Collection

Include the error collector in HTML pages:
```html
<script src="/error-tracker-static/error-collector.js"></script>
```

Auto-captures: `window.onerror`, `unhandledrejection`, `console.error()`, failed `fetch()`, toast errors.

Manual reporting:
```javascript
ErrorCollector.report('CustomError', 'Something went wrong', { context: 'user action' });
```

### Flask Error Handler

`init_error_tracker(app, catch_flask_errors=True)` automatically registers a global error handler that logs unhandled exceptions to the `server` category.

### Enforcement

No try/except block should silently swallow errors. Every exception must either:
1. Be logged to the error database with full context
2. Be explicitly re-raised after logging
3. Have a comment explaining why logging is not needed (rare)
