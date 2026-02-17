#!/usr/bin/env python3
"""
Flask Error Tracker — Standalone Server

Run this to use the error tracker as an independent microservice.
Other apps can POST errors to /api/log-frontend-error or use the Python client.

Usage:
    python app.py                    # default port 5100
    python app.py --port 8080        # custom port
    python app.py --db errors.db     # custom database path
"""

import argparse
from flask import Flask
from flask_error_tracker import init_error_tracker, ErrorDatabase


def create_app(db_path: str = None, config_path: str = None) -> Flask:
    app = Flask(__name__)
    error_db = ErrorDatabase(db_path=db_path, config_path=config_path) if db_path else None
    init_error_tracker(app, error_db=error_db, catch_flask_errors=True)

    @app.route('/')
    def index():
        return '<meta http-equiv="refresh" content="0;url=/error-log">'

    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Flask Error Tracker — Standalone Server')
    parser.add_argument('--port', type=int, default=5100, help='Port to run on (default: 5100)')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to (default: 0.0.0.0)')
    parser.add_argument('--db', default=None, help='Path to SQLite database file')
    parser.add_argument('--config', default=None, help='Path to config.yaml')
    parser.add_argument('--no-debug', action='store_true', help='Disable Flask debug mode')
    args = parser.parse_args()

    app = create_app(db_path=args.db, config_path=args.config)
    print(f"🚀 Flask Error Tracker starting on http://{args.host}:{args.port}")
    print(f"   📊 Dashboard: http://localhost:{args.port}/error-log")
    print(f"   📡 API: http://localhost:{args.port}/api/errors")
    app.run(host=args.host, port=args.port, debug=not args.no_debug)
