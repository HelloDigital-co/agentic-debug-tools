"""
Flask Error Tracker
A unified error logging, tracking, and debugging system for Flask applications.

Can be used as:
1. An embeddable Flask Blueprint: app.register_blueprint(create_blueprint(config))
2. A standalone Flask microservice: python app.py
"""

__version__ = "1.0.0"

from .database import ErrorDatabase, get_error_db, DEFAULT_CATEGORIES
from .blueprint import create_blueprint, init_error_tracker

__all__ = [
    "ErrorDatabase",
    "get_error_db",
    "create_blueprint",
    "init_error_tracker",
    "DEFAULT_CATEGORIES",
]
