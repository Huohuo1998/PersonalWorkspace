import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

# Only an explicitly named test database may be reset. Never touch the dev/production DB.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://workspace@127.0.0.1:5432/workspace_test"
)
if not TEST_DATABASE_URL.rstrip("/").endswith("/workspace_test"):
    raise RuntimeError("Use a dedicated workspace_test database")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
from app.db import Base, engine, SessionLocal
from app.main import app


@pytest.fixture(autouse=True)
def isolated_database():
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        tables = ",".join(
            '"' + t.name + '"' for t in reversed(Base.metadata.sorted_tables)
        )
        connection.execute(text("TRUNCATE " + tables + " CASCADE"))
    yield


def new_client(email=None):
    client = TestClient(app)
    client.get("/api/v1/auth/csrf")
    client.headers["X-CSRF-Token"] = client.cookies.get("pw_csrf")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email or str(uuid.uuid4()) + "@example.com",
            "password": "test-only-long-password",
            "name": "测试用户",
        },
    )
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = client.cookies.get("pw_csrf")
    return client


@pytest.fixture
def client():
    return new_client()


def post(client, path, data, key=None):
    return client.post(
        "/api/v1" + path,
        json=data,
        headers={"Idempotency-Key": key or str(uuid.uuid4())},
    )


def account(client, name="现金", type="ASSET", opening="0"):
    r = post(
        client,
        "/finance/accounts",
        {"name": name, "type": type, "opening_balance": opening},
    )
    assert r.status_code == 201, r.text
    return r.json()


def tx(client, type, amount, account_id, **kwargs):
    accounts = client.get("/api/v1/finance/accounts").json()
    p = {
        "type": type,
        "amount": amount,
        "account_id": account_id,
        "occurred_on": "2026-10-13",
        "category": "餐饮",
        "expected_versions": {a["id"]: a["version"] for a in accounts},
        "confirmed_warnings": True,
        **kwargs,
    }
    r = post(client, "/finance/transactions", p)
    assert r.status_code == 201, r.text
    return r.json()
