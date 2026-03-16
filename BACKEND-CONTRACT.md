# Backend Contract

Language-agnostic spec for the two endpoints the DeveloperWidget and error-collector.js need.
Implement these in any backend (Express, Django, Rails, Laravel, Go, etc.) and the frontend tools work unchanged.

---

## Endpoints Required

### 1. `POST /api/errors/log` — Public ingest (no auth)

Any browser visitor can POST to this. No authentication required.

**Request body** (JSON):
```json
{
  "logs": [
    {
      "level": "error",
      "message": "Uncaught TypeError: Cannot read properties of undefined",
      "stack": "TypeError: ...\n    at Component (app.js:42)",
      "timestamp": "2026-02-23T10:00:00.000Z",
      "file": "https://example.com/dashboard"
    }
  ],
  "source": "debug-widget",
  "url": "https://example.com/dashboard"
}
```

**Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `logs` | array | yes | One or more log entries |
| `logs[].level` | string | no | `error`, `warn`, `info` — defaults to `error` |
| `logs[].message` | string | yes | Human-readable error message |
| `logs[].stack` | string | no | Stack trace |
| `logs[].timestamp` | string | no | ISO 8601 — defaults to server time |
| `logs[].file` | string | no | Page URL where error occurred |
| `source` | string | no | Origin identifier e.g. `debug-widget` |
| `url` | string | no | Current page URL |

**Response** (200):
```json
{ "success": true, "logged": 1 }
```

**Response** (400 — no logs):
```json
{ "success": false, "error": "No logs provided" }
```

---

### 2. `GET /api/admin/error-logs` — Admin read

Returns stored error logs. On localhost/dev this can be open; on production require admin auth.

**Query params** (all optional):
| Param | Type | Notes |
|-------|------|-------|
| `limit` | number | Max entries to return, default 50 |
| `page` | number | Pagination, default 1 |
| `category` | string | Filter by category |
| `level` | string | Filter by level |
| `resolved` | boolean | Filter by resolved status |
| `search` | string | Full-text search |
| `startDate` | string | ISO 8601 date filter |
| `endDate` | string | ISO 8601 date filter |

**Response** (200):
```json
{
  "success": true,
  "data": {
    "errors": [
      {
        "timestamp": "2026-02-23T10:00:00.000Z",
        "level": "error",
        "message": "Uncaught TypeError: ...",
        "stack": "TypeError: ...",
        "file": "https://example.com/dashboard",
        "source": "debug-widget",
        "category": "frontend",
        "resolved": false,
        "errorId": "optional-unique-id"
      }
    ],
    "summary": {
      "total": 42,
      "resolved": 10,
      "unresolved": 32,
      "byCategory": { "frontend": 30, "backend": 12 }
    }
  },
  "logs": []
}
```

> Note: The admin page reads `data.data.errors` first, then falls back to `data.logs`. Return either shape.

---

### 3. `GET /api/admin/error-logs/stats` — Widget health check (no auth)

Used by DeveloperWidget to show "Debug Tracker: online/offline" status.

**Response** (200):
```json
{
  "success": true,
  "unresolved_errors": 5,
  "total_errors": 42,
  "by_category": [
    { "category": "frontend", "count": 30 },
    { "category": "backend", "count": 12 }
  ]
}
```

---

## Auth Pattern

The recommended pattern — open on dev, admin-only on prod:

```
if (host is localhost or non-production domain):
    allow through without auth
else:
    require admin authentication
```

Adapt to your framework's middleware/guard system.

---

## Log Storage

The Express reference implementation writes JSON files to `logs/startup-errors/`:

```
logs/startup-errors/
├── frontend-errors-YYYY-MM-DD.json   ← browser errors from DeveloperWidget
└── error-YYYY-MM-DD.json             ← backend/startup errors
```

You can use any storage backend — database, files, external service — as long as the API contract above is met.

---

## Implementation Examples

| Stack | Files |
|-------|-------|
| Express / Node.js | `express/controllers/error-logs.controller.js` + `express/routes/` |
| Next.js frontend | `nextjs/admin/error-logs/page.tsx` |
| Flask (original) | `flask_error_tracker/` (see upstream README) |
| Django | Implement the 3 endpoints above in a Django view — no template provided yet |
| Rails | Implement the 3 endpoints above in a Rails controller — no template provided yet |
| Laravel | Implement the 3 endpoints above in a Laravel controller — no template provided yet |

---

## Minimal Implementation (any language)

If you just need the ingest endpoint to get the widget working, this is the minimum:

```python
# Django example — minimal ingest
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json, os, datetime

@csrf_exempt
def log_errors(request):
    if request.method != 'POST':
        return JsonResponse({'success': False}, status=405)
    body = json.loads(request.body)
    logs = body.get('logs', [])
    if not logs:
        return JsonResponse({'success': False, 'error': 'No logs provided'}, status=400)
    # Write to file (or your DB)
    today = datetime.date.today().isoformat()
    os.makedirs('logs', exist_ok=True)
    with open(f'logs/frontend-errors-{today}.json', 'a') as f:
        for log in logs:
            f.write(json.dumps(log) + '\n')
    return JsonResponse({'success': True, 'logged': len(logs)})
```

```ruby
# Rails example — minimal ingest
class ErrorLogsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:ingest]

  def ingest
    logs = params[:logs] || []
    return render json: { success: false, error: 'No logs provided' }, status: 400 if logs.empty?
    File.open("log/frontend-errors-#{Date.today}.log", 'a') do |f|
      logs.each { |log| f.puts log.to_json }
    end
    render json: { success: true, logged: logs.length }
  end
end
```

```go
// Go example — minimal ingest
func logErrors(w http.ResponseWriter, r *http.Request) {
    var body struct { Logs []map[string]interface{} `json:"logs"` }
    json.NewDecoder(r.Body).Decode(&body)
    if len(body.Logs) == 0 {
        http.Error(w, `{"success":false,"error":"No logs provided"}`, 400)
        return
    }
    // append to file or write to DB
    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintf(w, `{"success":true,"logged":%d}`, len(body.Logs))
}
```
