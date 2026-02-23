# HashtagPLUS Change Suggestions for Agentic Debug Tools

**Upstream repo**: https://github.com/HelloDigital-co/agentic-debug-tools  
**Purpose**: Track change ideas and suggestions to contribute back via PR

---

## How to Submit a PR

1. Fork https://github.com/HelloDigital-co/agentic-debug-tools on GitHub
2. Clone your fork locally
3. Apply the changes listed below
4. Open a PR to the upstream repo

---

## Suggested Changes

### README documents bare array POST but API requires wrapped object
**File**: `flask_error_tracker/blueprint.py`, `README.md`
**Type**: bug / documentation fix
**Description**: The README example shows posting a bare JSON array to `/api/log-frontend-error`, but the endpoint does `data.get('errors', [])` which requires `{"errors": [...]}`. Sending a bare array causes a 500 `'list' object has no attribute 'get'` error. Either the endpoint should handle both formats, or the README should be corrected.
**Code sketch**:
```python
# Fix option 1: handle both formats in blueprint.py
data = request.get_json() or {}
errors = data if isinstance(data, list) else data.get('errors', [])

# Fix option 2: update README to show correct format
# {"errors": [{"error_type": "...", "error_message": "...", "page_url": "..."}]}
```

### Field names inconsistent between README and actual API
**File**: `README.md`, `flask_error_tracker/blueprint.py`
**Type**: documentation fix
**Description**: README shows `type`, `message`, `url` as field names in POST body examples, but the blueprint reads `error_type`, `error_message`, `page_url`. Causes silent failures (logged=0) when using README examples.
**Correct fields**: `error_type`, `error_message`, `page_url`, `source`, `console_logs`, `user_agent`, `viewport`

### Template

```
### [Short title]
**File**: path/to/file.py
**Type**: bug fix | enhancement | new feature
**Description**: What you want to change and why
**Code sketch** (optional):
```python
# example of what the change might look like
```
```

---

## Submitted PRs

<!-- Move items here once you've opened a PR -->

---

## Rejected / Won't Do

<!-- Move items here if upstream declines or you decide against it -->

### React/Next.js DeveloperWidget component
**File**: new file `flask_error_tracker/static/DeveloperWidget.tsx` (or docs example)
**Type**: new feature / enhancement
**Description**: HashtagPLUS ships a `DeveloperWidget` React component that wraps the debug tracker API into a floating panel for Next.js apps. It polls `/api/errors/stats` for unresolved error count, shows service health (frontend/backend/db/tracker), and links to the dashboard. Could be contributed upstream as an official React integration example or optional npm package.
**Key features**:
- Polls `NEXT_PUBLIC_DEBUG_TRACKER_URL/api/errors/stats` every 5s
- Shows unresolved error badge on FAB
- Service health dots (online/offline/checking)
- Links to `/error-log` dashboard
- Draggable, persists position in localStorage
- Uses relative API paths (`/api/health`) so it works behind any proxy
**Source**: `apps/web/components/DeveloperWidget.tsx` in HashtagPLUS-MVP-Alpha repo

### Added /api/log-error endpoint for backend/server error forwarding
**File**: `flask_error_tracker/blueprint.py`
**Type**: new feature
**Description**: Added `POST /api/log-error` endpoint to receive errors forwarded from non-Python backends (e.g. Node.js/Express). Accepts `category`, `error_type`, `error_message`, `context`, `stack_trace`, `extra_data`. Complements the existing `/api/log-frontend-error` endpoint. Enables the Express `errorHandler.js` middleware to forward unhandled errors to the tracker sidecar.

### Configurable ERROR_ENDPOINT in error-collector.js
**File**: `flask_error_tracker/static/error-collector.js`
**Type**: enhancement
**Description**: `error-collector.js` now reads `window.__ERROR_COLLECTOR_ENDPOINT` before falling back to the relative `/api/log-frontend-error`. This allows Next.js and other non-Flask frontends to point the collector at the tracker sidecar URL (e.g. `https://domain.com/debug/api/log-frontend-error`) without modifying the script.
