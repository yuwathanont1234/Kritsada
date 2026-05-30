import io
import os
from contextlib import contextmanager

# Settings have required fields; populate dummies before any app import.
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:5432/db")
os.environ.setdefault("EMBED_FUNCTION_URL", "http://embed.test/functions/v1/embed-image")
os.environ.setdefault("EMBED_FUNCTION_SECRET", "test-secret")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")

import numpy as np
import pytest
from PIL import Image


def make_png(size=(64, 64), color=(120, 90, 60)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


class FakeCursor:
    def __init__(self, rows=None, one=None):
        self._rows = rows or []
        self._one = one
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._one

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def commit(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def conn_factory(cursor: FakeCursor):
    @contextmanager
    def _cm():
        yield FakeConn(cursor)

    return _cm


@contextmanager
def null_conn():
    yield None


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
