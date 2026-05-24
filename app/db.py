from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector

from app.config import get_settings


@contextmanager
def get_conn():
    settings = get_settings()
    with psycopg.connect(settings.database_url) as conn:
        register_vector(conn)
        yield conn
