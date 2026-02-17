"""Tests for Flask Error Tracker"""

import json
import tempfile
import os
import pytest
from flask import Flask
from flask_error_tracker import ErrorDatabase, init_error_tracker, get_error_db, DEFAULT_CATEGORIES
from flask_error_tracker.database import reset_error_db


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset the singleton between tests"""
    reset_error_db()
    yield
    reset_error_db()


@pytest.fixture
def db(tmp_path):
    """Create a fresh ErrorDatabase for each test"""
    return ErrorDatabase(db_path=str(tmp_path / "test_errors.db"))


@pytest.fixture
def app(db):
    """Create a Flask app with error tracker"""
    app = Flask(__name__)
    app.config['TESTING'] = True
    init_error_tracker(app, error_db=db, catch_flask_errors=True)

    @app.route('/boom')
    def boom():
        raise ValueError("Test explosion")

    return app


@pytest.fixture
def client(app):
    return app.test_client()


class TestErrorDatabase:
    def test_log_error(self, db):
        eid = db.log_error(category='database', error_type='TestError', error_message='Something broke')
        assert eid > 0

    def test_deduplication(self, db):
        eid1 = db.log_error(category='api', error_type='Timeout', error_message='Request timed out')
        eid2 = db.log_error(category='api', error_type='Timeout', error_message='Request timed out')
        assert eid1 == eid2
        detail = db.get_error_detail(eid1)
        assert detail['occurrence_count'] == 2

    def test_get_errors(self, db):
        db.log_error(category='database', error_type='E1', error_message='msg1')
        db.log_error(category='api', error_type='E2', error_message='msg2')
        all_errors = db.get_errors()
        assert len(all_errors) == 2
        db_errors = db.get_errors(category='database')
        assert len(db_errors) == 1

    def test_mark_resolved(self, db):
        eid = db.log_error(category='test', error_type='E', error_message='m')
        assert db.mark_resolved(eid, notes='Fixed it')
        detail = db.get_error_detail(eid)
        assert detail['resolved'] == 1
        assert detail['resolution_notes'] == 'Fixed it'

    def test_delete_error(self, db):
        eid = db.log_error(category='test', error_type='E', error_message='m')
        assert db.delete_error(eid)
        assert db.get_error_detail(eid) is None

    def test_clear_resolved(self, db):
        eid = db.log_error(category='test', error_type='E', error_message='m')
        db.mark_resolved(eid)
        cleared = db.clear_resolved()
        assert cleared == 1

    def test_stats(self, db):
        db.log_error(category='database', error_type='E1', error_message='m1')
        db.log_error(category='api', error_type='E2', error_message='m2')
        stats = db.get_stats()
        assert stats['total_errors'] == 2
        assert stats['unresolved_errors'] == 2

    def test_debug_report(self, db):
        eid = db.log_error(category='api', error_type='HTTPError', error_message='404 Not Found',
                           context='Fetching user data', request_url='https://api.example.com/users')
        report = db.generate_debug_report(eid)
        assert '## Error Debug Report' in report
        assert 'HTTPError' in report
        assert '404 Not Found' in report

    def test_custom_categories(self, db):
        db.log_error(category='payments', error_type='ChargeError', error_message='Card declined')
        assert 'payments' in db.categories
        errors = db.get_errors(category='payments')
        assert len(errors) == 1

    def test_disabled_category(self, db):
        db.category_config['test'] = False
        eid = db.log_error(category='test', error_type='E', error_message='m')
        assert eid == -1

    def test_default_categories_present(self, db):
        for cat in DEFAULT_CATEGORIES:
            assert cat in db.categories


class TestBlueprint:
    def test_dashboard_loads(self, client):
        resp = client.get('/error-log')
        assert resp.status_code == 200
        assert b'Error Log' in resp.data

    def test_api_errors(self, client, db):
        db.log_error(category='api', error_type='E', error_message='m')
        resp = client.get('/api/errors')
        data = json.loads(resp.data)
        assert data['success']
        assert len(data['errors']) == 1

    def test_api_error_detail(self, client, db):
        eid = db.log_error(category='api', error_type='E', error_message='m')
        resp = client.get(f'/api/errors/{eid}')
        data = json.loads(resp.data)
        assert data['success']
        assert data['error']['error_type'] == 'E'

    def test_api_resolve(self, client, db):
        eid = db.log_error(category='api', error_type='E', error_message='m')
        resp = client.post(f'/api/errors/{eid}/resolve', json={'notes': 'done'})
        assert json.loads(resp.data)['success']

    def test_api_delete(self, client, db):
        eid = db.log_error(category='api', error_type='E', error_message='m')
        resp = client.delete(f'/api/errors/{eid}')
        assert json.loads(resp.data)['success']

    def test_api_stats(self, client, db):
        db.log_error(category='api', error_type='E', error_message='m')
        resp = client.get('/api/errors/stats')
        data = json.loads(resp.data)
        assert data['total_errors'] == 1

    def test_api_debug_report(self, client, db):
        eid = db.log_error(category='api', error_type='E', error_message='m')
        resp = client.get(f'/api/errors/{eid}/debug-report')
        data = json.loads(resp.data)
        assert '## Error Debug Report' in data['debug_code']

    def test_frontend_error_logging(self, client):
        resp = client.post('/api/log-frontend-error', json={
            'errors': [{'error_type': 'TypeError', 'error_message': 'null is not an object'}]
        })
        data = json.loads(resp.data)
        assert data['logged'] == 1

    def test_flask_error_handler(self, client, db):
        resp = client.get('/boom')
        assert resp.status_code == 500
        errors = db.get_errors(category='server')
        assert len(errors) == 1
        assert 'Test explosion' in errors[0]['error_message']

    def test_clear_resolved(self, client, db):
        eid = db.log_error(category='api', error_type='E', error_message='m')
        db.mark_resolved(eid)
        resp = client.post('/api/errors/clear-resolved')
        data = json.loads(resp.data)
        assert data['cleared'] == 1
