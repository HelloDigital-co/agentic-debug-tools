# Integration Guide

Step-by-step instructions for adding Agentic Debug Tools to any Flask project.

## 1. Install

```bash
pip install git+https://github.com/HelloDigital-co/agentic-debug-tools.git
```

Or add to `requirements.txt`:
```
git+https://github.com/HelloDigital-co/agentic-debug-tools.git
```

## 2. Add to your Flask app

Find where your Flask app is created (usually `app = Flask(__name__)`) and add:

```python
from flask_error_tracker import init_error_tracker

app = Flask(__name__)
init_error_tracker(app)
```

This auto-injects the debug button and error collector into every HTML page.

## 3. Add error logging to try/except blocks

Search for `except` in your codebase. For each try/except block, add:

```python
from flask_error_tracker import get_error_db
import traceback

try:
    # existing code
except Exception as e:
    get_error_db().log_error(
        category='server',          # or 'api', 'database', 'frontend', etc.
        error_type=type(e).__name__,
        error_message=str(e),
        context='Description of what was happening',
        stack_trace=traceback.format_exc(),
    )
    raise  # re-raise or handle as appropriate
```

## 4. Verify

1. Start your Flask app
2. Visit any page — you should see a red 🐛 Debug button in the lower-right
3. Click it to expand actions (View Log, Reload, Test Error)
4. Click "Test Error" to verify the system works
5. Visit `/error-log` for the full dashboard

## Options

```python
# Debug button always visible (not just on errors)
init_error_tracker(app, debug_button='always')

# No debug button (backend tracking only)
init_error_tracker(app, debug_button=False)

# Custom URL prefix
init_error_tracker(app, url_prefix='/debug')
# Dashboard at /debug/error-log, API at /debug/api/errors

# Disable Flask error handler (if you have your own)
init_error_tracker(app, catch_flask_errors=False)
```

## JS-Only (no Flask backend)

If you just want the floating debug button without backend tracking, copy
`flask_error_tracker/static/debug-button.js` into your project and add:

```html
<script src="/path/to/debug-button.js"></script>
```

This gives you in-memory error capture, console log viewer, and copy-to-clipboard
with zero backend dependencies.

---

## Next.js / React Integration (HashtagPLUS Pattern)

For Next.js apps using the debug tracker as a sidecar microservice, the recommended pattern is a `DeveloperWidget` React component that:

- Polls `/api/health` and `/api/health/db` (relative paths — works behind any proxy)
- Polls `NEXT_PUBLIC_DEBUG_TRACKER_URL/api/errors/stats` for unresolved error count
- Shows a FAB in the lower-left with service status, error counts, and quick actions
- Links directly to the debug tracker dashboard

### Setup

1. Set the env var pointing to your debug tracker:
```bash
# apps/web/.env.local (dev)
NEXT_PUBLIC_DEBUG_TRACKER_URL=http://localhost:5100

# Production (via nginx proxy at /debug)
NEXT_PUBLIC_DEBUG_TRACKER_URL=https://yourdomain.com/debug
```

2. Add the component to your root layout:
```tsx
// app/layout.tsx
import DeveloperWidget from '@/components/DeveloperWidget'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <DeveloperWidget />
      </body>
    </html>
  )
}
```

3. The component source lives at `apps/web/components/DeveloperWidget.tsx` in the HashtagPLUS repo. Copy it into your project and adjust the admin panel links to match your routes.

### Nginx proxy for production

Route `/debug` to the debug-tracker container so it's accessible through your main domain:

```nginx
location /debug {
    proxy_pass http://hashtagplus-debug-tracker:5100/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
}

location /debug/ {
    proxy_pass http://hashtagplus-debug-tracker:5100/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
}
```

### Docker (pre-baked image)

Avoid running `pip install` on every container start — use a Dockerfile instead:

```dockerfile
FROM python:3.11-slim
WORKDIR /sidecar
RUN pip install --no-cache-dir git+https://github.com/HelloDigital-co/agentic-debug-tools.git
COPY start.py .
ENV PORT=5100
EXPOSE 5100
CMD ["python", "start.py"]
```

```yaml
# docker-compose.yml
debug-tracker:
  build:
    context: ./services/debug-tracker
    dockerfile: Dockerfile
  volumes:
    - debug-data:/data
  environment:
    - DB_PATH=/data/error_log.db
    - PORT=5100
```
