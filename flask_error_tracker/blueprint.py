"""
Flask Blueprint for the Error Tracker.
Register this blueprint in any Flask app to add error tracking routes.
"""

import traceback
from flask import Blueprint, render_template, request, jsonify
from .database import ErrorDatabase, get_error_db


def create_blueprint(error_db: ErrorDatabase = None, url_prefix: str = '') -> Blueprint:
    """
    Create the error tracker Flask Blueprint.

    Args:
        error_db: An ErrorDatabase instance. Uses singleton if not provided.
        url_prefix: URL prefix for all routes (e.g. '/errors').

    Returns:
        A Flask Blueprint ready to register.
    """
    bp = Blueprint(
        'error_tracker',
        __name__,
        template_folder='templates',
        static_folder='static',
        static_url_path='/error-tracker-static',
    )

    def db() -> ErrorDatabase:
        return error_db or get_error_db()

    # ── Dashboard ──

    @bp.route('/error-log')
    def error_log_page():
        """Error log dashboard"""
        error_database = db()
        stats = error_database.get_stats()
        errors = error_database.get_errors(limit=100)
        return render_template('error_log.html', stats=stats, errors=errors)

    # ── API: List / Filter ──

    @bp.route('/api/errors')
    def get_errors_api():
        category = request.args.get('category')
        include_resolved = request.args.get('include_resolved', 'false').lower() == 'true'
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
        error_database = db()
        errors = error_database.get_errors(
            category=category if category != 'all' else None,
            include_resolved=include_resolved, limit=limit, offset=offset,
        )
        stats = error_database.get_stats()
        return jsonify({'success': True, 'errors': errors, 'stats': stats,
                        'categories': error_database.categories})

    # ── API: Detail ──

    @bp.route('/api/errors/<int:error_id>')
    def get_error_detail_api(error_id):
        error = db().get_error_detail(error_id)
        if not error:
            return jsonify({'success': False, 'error': 'Error not found'}), 404
        return jsonify({'success': True, 'error': error})

    # ── API: Debug Report ──

    @bp.route('/api/errors/<int:error_id>/debug-report')
    def get_debug_report_api(error_id):
        occurrence_id = request.args.get('occurrence_id', type=int)
        report = db().generate_debug_report(error_id, occurrence_id)
        return jsonify({'success': True, 'debug_code': report})

    # ── API: Add Note (without resolving) ──

    @bp.route('/api/errors/<int:error_id>/note', methods=['POST'])
    def add_note_api(error_id):
        data = request.get_json() or {}
        note = data.get('note', '').strip()
        if not note:
            return jsonify({'success': False, 'error': 'Note is required'}), 400
        success = db().add_note(error_id, note)
        return jsonify({'success': success})

    # ── API: Resolve ──

    @bp.route('/api/errors/<int:error_id>/resolve', methods=['POST'])
    def resolve_error_api(error_id):
        data = request.get_json() or {}
        success = db().mark_resolved(error_id, data.get('notes'))
        return jsonify({'success': success})

    # ── API: Delete ──

    @bp.route('/api/errors/<int:error_id>', methods=['DELETE'])
    def delete_error_api(error_id):
        return jsonify({'success': db().delete_error(error_id)})

    # ── API: Clear Resolved ──

    @bp.route('/api/errors/clear-resolved', methods=['POST'])
    def clear_resolved_api():
        return jsonify({'success': True, 'cleared': db().clear_resolved()})

    # ── API: Stats (for live polling) ──

    @bp.route('/api/errors/stats')
    def get_stats_api():
        return jsonify(db().get_stats())

    # ── API: Receive Backend Errors ──

    @bp.route('/api/log-error', methods=['POST'])
    def log_backend_error():
        data = request.get_json() or {}
        try:
            db().log_error(
                category=data.get('category', 'server'),
                error_type=data.get('error_type', 'Error'),
                error_message=data.get('error_message', 'Unknown error'),
                context=data.get('context'),
                stack_trace=data.get('stack_trace'),
                request_url=data.get('extra_data', {}).get('url'),
                http_status=data.get('extra_data', {}).get('status'),
                extra_data=data.get('extra_data'),
            )
            return jsonify({'success': True})
        except Exception:
            return jsonify({'success': False}), 500

    # ── API: Receive Frontend Errors ──

    @bp.route('/api/log-frontend-error', methods=['POST'])
    def log_frontend_error():
        data = request.get_json() or {}
        errors = data.get('errors', [])
        error_database = db()
        logged = 0
        for err in errors:
            try:
                error_database.log_error(
                    category='frontend',
                    error_type=err.get('error_type', 'FrontendError'),
                    error_message=err.get('error_message', 'Unknown error'),
                    source=err.get('source'),
                    page_url=err.get('page_url'),
                    console_logs=err.get('console_logs'),
                    request_url=err.get('request_url'),
                    http_status=err.get('http_status'),
                    response_body=err.get('response_body'),
                    extra_data={
                        'user_agent': err.get('user_agent'),
                        'viewport': err.get('viewport'),
                        'stack': err.get('extra_data', {}).get('stack'),
                    }
                )
                logged += 1
            except Exception:
                pass
        return jsonify({'success': True, 'logged': logged})

    return bp


def init_error_tracker(app, error_db: ErrorDatabase = None, url_prefix: str = '',
                       catch_flask_errors: bool = True, debug_button: str = 'errors-only'):
    """
    One-call setup: registers the blueprint and optionally installs a global
    Flask error handler that logs unhandled exceptions.

    Args:
        app: The Flask application.
        error_db: An ErrorDatabase instance. Uses singleton if not provided.
        url_prefix: URL prefix for all error tracker routes.
        catch_flask_errors: If True, registers a global errorhandler(Exception).
        debug_button: Controls the floating debug button on every HTML page.
            'errors-only' (default) — hidden, appears only when JS errors are detected.
            'always'                — visible on every page regardless of errors.
            False / None            — disabled, no auto-injection.

    Returns:
        The registered Blueprint.
    """
    bp = create_blueprint(error_db=error_db, url_prefix=url_prefix)
    app.register_blueprint(bp, url_prefix=url_prefix)

    if catch_flask_errors:
        @app.errorhandler(Exception)
        def _handle_exception(e):
            db = error_db or get_error_db()
            db.log_error(
                category='server',
                error_type=type(e).__name__,
                error_message=str(e),
                context=f'{request.method} {request.path}',
                stack_trace=traceback.format_exc(),
                request_url=request.url,
                http_status=500,
                extra_data={
                    'method': request.method,
                    'args': dict(request.args),
                    'remote_addr': request.remote_addr,
                }
            )
            return jsonify({'error': 'Internal server error'}), 500

    # ── Auto-inject debug button + error collector into every HTML response ──
    if debug_button:
        always_visible = 'true' if debug_button == 'always' else 'false'
        static_prefix = url_prefix.rstrip('/') + '/error-tracker-static'

        _snippet = (
            f'\n<script>window.DEBUG_BUTTON_CONFIG={{alwaysVisible:{always_visible},'
            f'errorLogUrl:"{url_prefix.rstrip("/")}/error-log"}};</script>'
            f'\n<script src="{static_prefix}/error-collector.js"></script>'
            f'\n<script src="{static_prefix}/debug-button.js"></script>\n'
        )
        _snippet_bytes = _snippet.encode('utf-8')
        _close_body = b'</body>'

        @app.after_request
        def _inject_debug_button(response):
            # Only inject into HTML responses that contain </body>
            if (response.content_type
                    and 'text/html' in response.content_type
                    and response.status_code < 400
                    and not response.direct_passthrough):
                try:
                    data = response.get_data()
                    if _close_body in data:
                        response.set_data(data.replace(_close_body, _snippet_bytes + _close_body, 1))
                except Exception:
                    pass  # Never break the response
            return response

    return bp
