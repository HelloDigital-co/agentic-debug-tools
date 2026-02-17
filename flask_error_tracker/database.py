"""
Unified Error Database
Stores and manages application errors across configurable categories.

Default categories: database, api, frontend, server, worker, test, content_processing
Custom categories can be added via configuration.
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import hashlib
import yaml


DEFAULT_CATEGORIES = {
    'database': 'Database',
    'api': 'API',
    'frontend': 'Frontend/Browser',
    'server': 'Server',
    'worker': 'Background Worker',
    'test': 'Tests',
    'content_processing': 'Content Processing',
}


def load_error_config(config_path: str = None) -> Dict:
    """Load error logging configuration from config.yaml"""
    search_paths = []
    if config_path:
        search_paths.append(Path(config_path))
    search_paths.extend([
        Path.cwd() / 'config.yaml',
        Path.cwd() / 'config' / 'config.yaml',
    ])

    for path in search_paths:
        if path.exists():
            try:
                with open(path, 'r') as f:
                    config = yaml.safe_load(f) or {}
                    return config.get('error_logging', {})
            except Exception:
                pass

    return {
        'enabled': True,
        'database_path': 'data/error_log.db',
        'log_to_console': True,
        'categories': {},
    }


class ErrorDatabase:
    """Unified SQLite database for storing all application errors"""

    def __init__(self, db_path: str = None, config_path: str = None,
                 categories: Dict[str, str] = None):
        self.config = load_error_config(config_path)
        self.enabled = self.config.get('enabled', True)
        self.log_to_console = self.config.get('log_to_console', True)
        self.category_config = self.config.get('categories', {})

        # Merge default + config-defined + constructor-provided categories
        self.categories = dict(DEFAULT_CATEGORIES)
        config_cats = self.config.get('custom_categories', {})
        if config_cats:
            self.categories.update(config_cats)
        if categories:
            self.categories.update(categories)

        if db_path:
            self.db_path = Path(db_path)
        else:
            self.db_path = Path(self.config.get('database_path', 'data/error_log.db'))

        if self.enabled:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            self._init_db()

    def is_category_enabled(self, category: str) -> bool:
        """Check if a specific category is enabled for logging"""
        if not self.enabled:
            return False
        return self.category_config.get(category, True)

    def _init_db(self):
        """Initialize the error database schema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS errors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_hash TEXT NOT NULL,
                    category TEXT NOT NULL,
                    error_type TEXT,
                    error_message TEXT,
                    first_occurred TEXT NOT NULL,
                    last_occurred TEXT NOT NULL,
                    occurrence_count INTEGER DEFAULT 1,
                    resolved INTEGER DEFAULT 0,
                    resolution_notes TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            conn.execute('''
                CREATE TABLE IF NOT EXISTS error_occurrences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    category TEXT NOT NULL,
                    source TEXT,
                    context TEXT,
                    stack_trace TEXT,
                    page_url TEXT,
                    screenshot_path TEXT,
                    console_logs TEXT,
                    network_errors TEXT,
                    request_url TEXT,
                    request_params TEXT,
                    http_status INTEGER,
                    response_body TEXT,
                    domain TEXT,
                    job_id INTEGER,
                    run_id TEXT,
                    suite TEXT,
                    test_id TEXT,
                    test_name TEXT,
                    extra_data TEXT,
                    FOREIGN KEY (error_id) REFERENCES errors(id)
                )
            ''')

            conn.execute('CREATE INDEX IF NOT EXISTS idx_errors_category ON errors(category)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_errors_hash ON errors(error_hash)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_occurrences_error_id ON error_occurrences(error_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_occurrences_timestamp ON error_occurrences(timestamp)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_occurrences_category ON error_occurrences(category)')
            conn.commit()

    def _generate_error_hash(self, category: str, error_type: str, error_message: str) -> str:
        """Generate a hash to identify unique errors for deduplication"""
        normalized = f"{category}:{error_type}:{error_message[:200]}"
        return hashlib.md5(normalized.encode()).hexdigest()

    def log_error(
        self,
        category: str,
        error_type: str,
        error_message: str,
        source: str = None,
        context: str = None,
        stack_trace: str = None,
        page_url: str = None,
        screenshot_path: str = None,
        console_logs: list = None,
        network_errors: list = None,
        request_url: str = None,
        request_params: dict = None,
        http_status: int = None,
        response_body: str = None,
        domain: str = None,
        job_id: int = None,
        run_id: str = None,
        suite: str = None,
        test_id: str = None,
        test_name: str = None,
        extra_data: dict = None
    ) -> int:
        """Log an error occurrence. Deduplicates by incrementing count for matching errors."""
        if not self.is_category_enabled(category):
            return -1

        # Auto-register unknown categories
        if category not in self.categories:
            self.categories[category] = category.replace('_', ' ').title()

        if self.log_to_console:
            print(f"❌ [{category.upper()}] {error_type}: {error_message[:100]}")

        timestamp = datetime.now().isoformat()
        error_hash = self._generate_error_hash(category, error_type, error_message)

        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            existing = conn.execute(
                "SELECT id, occurrence_count FROM errors WHERE error_hash = ? AND resolved = 0",
                (error_hash,)
            ).fetchone()

            if existing:
                error_id = existing['id']
                conn.execute(
                    'UPDATE errors SET last_occurred = ?, occurrence_count = occurrence_count + 1 WHERE id = ?',
                    (timestamp, error_id)
                )
            else:
                cursor = conn.execute(
                    '''INSERT INTO errors (error_hash, category, error_type, error_message,
                       first_occurred, last_occurred, occurrence_count)
                       VALUES (?, ?, ?, ?, ?, ?, 1)''',
                    (error_hash, category, error_type, error_message, timestamp, timestamp)
                )
                error_id = cursor.lastrowid

            conn.execute('''
                INSERT INTO error_occurrences (
                    error_id, timestamp, category, source, context, stack_trace,
                    page_url, screenshot_path, console_logs, network_errors,
                    request_url, request_params, http_status, response_body,
                    domain, job_id, run_id, suite, test_id, test_name, extra_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                error_id, timestamp, category, source, context, stack_trace,
                page_url, screenshot_path,
                json.dumps(console_logs) if console_logs else None,
                json.dumps(network_errors) if network_errors else None,
                request_url,
                json.dumps(request_params) if request_params else None,
                http_status, response_body, domain, job_id, run_id, suite, test_id, test_name,
                json.dumps(extra_data) if extra_data else None
            ))
            conn.commit()
            return error_id

    def get_errors(self, category: str = None, include_resolved: bool = False,
                   limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get errors with optional category filter"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            query = "SELECT * FROM errors WHERE 1=1"
            params = []
            if category:
                query += " AND category = ?"
                params.append(category)
            if not include_resolved:
                query += " AND resolved = 0"
            query += " ORDER BY last_occurred DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def get_error_detail(self, error_id: int) -> Optional[Dict]:
        """Get detailed error info including all occurrences"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            error = conn.execute("SELECT * FROM errors WHERE id = ?", (error_id,)).fetchone()
            if not error:
                return None
            occurrences = conn.execute(
                'SELECT * FROM error_occurrences WHERE error_id = ? ORDER BY timestamp DESC LIMIT 50',
                (error_id,)
            ).fetchall()
            return {
                **dict(error),
                'occurrences': [dict(o) for o in occurrences],
                'category_label': self.categories.get(error['category'], error['category'])
            }

    def get_occurrence(self, occurrence_id: int) -> Optional[Dict]:
        """Get a specific occurrence"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM error_occurrences WHERE id = ?", (occurrence_id,)).fetchone()
            return dict(row) if row else None

    def mark_resolved(self, error_id: int, notes: str = None) -> bool:
        """Mark an error as resolved"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "UPDATE errors SET resolved = 1, resolution_notes = ? WHERE id = ?",
                (notes, error_id)
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_error(self, error_id: int) -> bool:
        """Delete an error and its occurrences"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM error_occurrences WHERE error_id = ?", (error_id,))
            cursor = conn.execute("DELETE FROM errors WHERE id = ?", (error_id,))
            conn.commit()
            return cursor.rowcount > 0

    def clear_resolved(self) -> int:
        """Clear all resolved errors"""
        with sqlite3.connect(self.db_path) as conn:
            resolved_ids = [row[0] for row in conn.execute(
                "SELECT id FROM errors WHERE resolved = 1"
            ).fetchall()]
            if resolved_ids:
                placeholders = ','.join('?' * len(resolved_ids))
                conn.execute(f"DELETE FROM error_occurrences WHERE error_id IN ({placeholders})", resolved_ids)
                cursor = conn.execute("DELETE FROM errors WHERE resolved = 1")
                conn.commit()
                return cursor.rowcount
            return 0

    def get_stats(self) -> Dict:
        """Get error statistics by category"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            total = conn.execute("SELECT COUNT(*) as count FROM errors").fetchone()['count']
            unresolved = conn.execute(
                "SELECT COUNT(*) as count FROM errors WHERE resolved = 0"
            ).fetchone()['count']
            by_category = conn.execute('''
                SELECT category, COUNT(*) as count, SUM(occurrence_count) as total_occurrences
                FROM errors WHERE resolved = 0
                GROUP BY category ORDER BY total_occurrences DESC
            ''').fetchall()
            frequent = conn.execute('''
                SELECT id, category, error_type, error_message,
                       occurrence_count, first_occurred, last_occurred
                FROM errors WHERE resolved = 0
                ORDER BY occurrence_count DESC LIMIT 10
            ''').fetchall()
            return {
                'total_errors': total,
                'unresolved_errors': unresolved,
                'resolved_errors': total - unresolved,
                'by_category': [
                    {**dict(row), 'category_label': self.categories.get(row['category'], row['category'])}
                    for row in by_category
                ],
                'most_frequent': [dict(row) for row in frequent],
                'categories': self.categories,
            }

    def generate_debug_report(self, error_id: int, occurrence_id: int = None) -> str:
        """Generate a Markdown debug report suitable for any AI assistant or issue tracker."""
        error = self.get_error_detail(error_id)
        if not error:
            return f"Error ID {error_id} not found"

        if occurrence_id:
            occurrence = self.get_occurrence(occurrence_id)
        elif error['occurrences']:
            occurrence = error['occurrences'][0]
        else:
            occurrence = {}

        extra_data = json.loads(occurrence.get('extra_data') or '{}')
        console_logs = json.loads(occurrence.get('console_logs') or '[]')

        report = f"""## Error Debug Report

**Error ID**: {error_id}
**Category**: {error['category_label']} (`{error['category']}`)
**Occurrences**: {error['occurrence_count']} times

### Timeline
- **First Occurred**: {error['first_occurred']}
- **Last Occurred**: {error['last_occurred']}

### Error Details
- **Type**: `{error['error_type']}`
- **Message**:
```
{error['error_message']}
```

### Context
{occurrence.get('context') or 'No context provided'}

### Stack Trace
```
{occurrence.get('stack_trace') or 'No stack trace available'}
```
"""
        if occurrence.get('request_url'):
            report += f"\n### Request\n- **URL**: {occurrence['request_url']}\n"
            if occurrence.get('http_status'):
                report += f"- **HTTP Status**: {occurrence['http_status']}\n"
            if occurrence.get('response_body'):
                report += f"\n```\n{occurrence['response_body'][:500]}\n```\n"

        if occurrence.get('page_url'):
            report += f"\n### Page URL\n{occurrence['page_url']}\n"

        if console_logs:
            console_errors = [l for l in console_logs if l.get('type') == 'error']
            if console_errors:
                report += f"\n### Console Errors ({len(console_errors)})\n```\n"
                report += '\n'.join([f"[{l.get('type')}] {l.get('text', l.get('message', ''))}" for l in console_errors[:10]])
                report += "\n```\n"

        if extra_data:
            report += f"\n### Extra Data\n```json\n{json.dumps(extra_data, indent=2)}\n```\n"

        # Test-specific fields
        if occurrence.get('test_id'):
            report += f"\n### Test Details\n"
            report += f"- **Test**: `{occurrence.get('test_id')}` — {occurrence.get('test_name')}\n"
            report += f"- **Suite**: {occurrence.get('suite')}\n"
            report += f"- **Run ID**: {occurrence.get('run_id')}\n"

        report += f"\n---\n*This error has occurred {error['occurrence_count']} time(s). Please investigate and suggest a fix.*\n"
        return report


# Singleton
_error_db: Optional[ErrorDatabase] = None


def get_error_db(db_path: str = None, config_path: str = None,
                 categories: Dict[str, str] = None) -> ErrorDatabase:
    """Get or create the singleton ErrorDatabase instance"""
    global _error_db
    if _error_db is None:
        _error_db = ErrorDatabase(db_path=db_path, config_path=config_path, categories=categories)
    return _error_db


def reset_error_db():
    """Reset the singleton (useful for testing)"""
    global _error_db
    _error_db = None
