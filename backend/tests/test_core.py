from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4
import pytest
from sqlalchemy import select, text
from app.db import SessionLocal
from app.models import Account, Movement, WorkoutSession, UserSession, now
from conftest import post, account, tx, new_client


def test_auth_isolation_csrf_and_logout(client):
    task = post(client, "/tasks", {"title": "私人任务"}).json()
    other = new_client()
    assert other.get("/api/v1/tasks/" + task["id"]).status_code == 404
    assert (
        other.patch(
            "/api/v1/tasks/" + task["id"],
            json={"status": "COMPLETED", "expected_version": 1},
        ).status_code
        == 404
    )
    assert other.get("/api/v1/tasks").json() == []
    bad = client.post(
        "/api/v1/tasks", json={"title": "bad"}, headers={"X-CSRF-Token": "bad"}
    )
    assert bad.status_code == 403
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/me").status_code == 401


def test_password_hash_cookie_flags_and_validation(client):
    from app.models import User

    with SessionLocal() as db:
        u = db.scalar(select(User))
        assert u.password_hash.startswith("$argon2id$")
    assert "password_hash" not in client.get("/api/v1/me").text
    secret = "too-short"
    r = client.post("/api/v1/auth/login", json={"email": "bad", "password": secret})
    assert r.status_code == 422 and secret not in r.text


def test_title_only_and_scheduled_today(client):
    t = post(client, "/tasks", {"title": "只有标题"}).json()
    assert t["inbox"] and t["status"] == "TODO" and t["due_at"] is None
    today = client.get("/api/v1/dashboard").json()["day"]
    r = client.post("/api/v1/tasks/" + t["id"] + "/schedule-today?expected_version=1")
    assert r.status_code == 200 and r.json()["due_at"] is None
    assert t["id"] in [
        x["id"] for x in client.get("/api/v1/tasks?view=today&day=" + today).json()
    ]
    assert (
        client.patch(
            "/api/v1/tasks/" + t["id"], json={"expected_version": 1, "title": "stale"}
        ).status_code
        == 409
    )


def test_due_overdue_and_event_separation(client):
    post(client, "/tasks", {"title": "今天截止", "due_at": "2026-10-13"})
    overdue = post(client, "/tasks", {"title": "逾期", "due_at": "2026-10-12"}).json()
    e = post(
        client,
        "/events",
        {
            "title": "会议",
            "start_at": "2026-10-13T10:00:00+08:00",
            "end_at": "2026-10-13T11:00:00+08:00",
        },
    ).json()
    d = client.get("/api/v1/dashboard?day=2026-10-13").json()
    assert len(d["tasks"]) == 1 and len(d["overdue"]) == 1 and len(d["events"]) == 1
    assert "status" not in e
    assert client.get("/api/v1/tasks/" + overdue["id"]).json()["due_at"] == "2026-10-12"


def test_project_organization_does_not_change_status(client):
    p = post(client, "/projects", {"name": "生活"}).json()
    t = post(client, "/tasks", {"title": "整理", "status": "IN_PROGRESS"}).json()
    r = client.patch(
        "/api/v1/tasks/" + t["id"],
        json={"expected_version": 1, "project_id": p["id"], "inbox": False},
    )
    assert r.json()["status"] == "IN_PROGRESS"
    other = new_client()
    assert (
        post(other, "/tasks", {"title": "bad", "project_id": p["id"]}).status_code
        == 404
    )


def test_recurring_instance_history(client):
    template = post(
        client,
        "/tasks",
        {"title": "每日阅读", "scheduled_date": "2026-10-13", "recurrence": "DAILY"},
    ).json()
    instances = client.get("/api/v1/tasks").json()
    assert len(instances) == 90
    first = instances[0]
    client.patch(
        "/api/v1/tasks/" + first["id"],
        json={
            "expected_version": 1,
            "scheduled_date": "2026-10-15",
            "status": "COMPLETED",
        },
    )
    assert (
        client.get("/api/v1/tasks/" + template["id"]).json()["scheduled_date"]
        == "2026-10-13"
    )
    assert client.get("/api/v1/tasks/" + instances[1]["id"]).json()["status"] == "TODO"


def test_task_completion_creates_no_domain_facts(client):
    t = post(client, "/tasks", {"title": "训练/记账/吃饭"}).json()
    client.patch(
        "/api/v1/tasks/" + t["id"], json={"expected_version": 1, "status": "COMPLETED"}
    )
    for path in ("/finance/transactions", "/fitness/sessions", "/diet/meal-records"):
        assert client.get("/api/v1" + path).json() == []


def test_financial_transfer_atomic_and_no_income_expense(client):
    a = account(client, opening="1000")
    b = account(client, "银行")
    before = client.get("/api/v1/finance/summary?month=2026-10").json()
    tx(client, "TRANSFER", "100", a["id"], destination_id=b["id"])
    values = client.get("/api/v1/finance/accounts").json()
    assert [Decimal(v["balance"]) for v in values] == [Decimal("900"), Decimal("100")]
    after = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert (
        after["net_assets"] == before["net_assets"]
        and Decimal(after["expense"]) == 0
        and Decimal(after["income"]) == 0
    )
    with SessionLocal() as db:
        assert len(db.scalars(select(Movement)).all()) == 3


def test_financial_version_conflict_and_rollback(client):
    a = account(client, opening="100")
    b = account(client, "银行")
    p = {
        "type": "TRANSFER",
        "amount": "20",
        "account_id": a["id"],
        "destination_id": b["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: a["version"], b["id"]: b["version"]},
    }
    tx(client, "EXPENSE", "10", a["id"])
    r = post(client, "/finance/transactions", p)
    assert r.status_code == 409
    assert len(client.get("/api/v1/finance/transactions").json()) == 2
    assert Decimal(client.get("/api/v1/finance/accounts").json()[1]["balance"]) == 0


def test_negative_assets_require_review_then_preserve_fact(client):
    a = account(client, opening="50")
    p = {
        "type": "EXPENSE",
        "amount": "80",
        "account_id": a["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: a["version"]},
    }
    preview = post(client, "/finance/preview", p).json()
    assert Decimal(preview["effects"][0]["after"]) == -30 and preview["warnings"]
    assert post(client, "/finance/transactions", p).status_code == 409
    p["confirmed_warnings"] = True
    assert post(client, "/finance/transactions", p).status_code == 201
    assert Decimal(client.get("/api/v1/finance/accounts").json()[0]["balance"]) == -30
    s = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert Decimal(s["expense"]) == 80 and Decimal(s["income"]) == 0


def test_credit_overpayment_and_net_assets(client):
    bank = account(client, opening="1000")
    card = account(client, "信用卡", "CREDIT")
    tx(client, "EXPENSE", "500", card["id"])
    before = client.get("/api/v1/finance/summary?month=2026-10").json()
    tx(client, "REPAYMENT", "600", bank["id"], destination_id=card["id"])
    after = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert Decimal(after["debt"]) == 0 and Decimal(after["overpayment"]) == 100
    assert (
        after["net_assets"] == before["net_assets"] and Decimal(after["expense"]) == 500
    )
    tx(client, "EXPENSE", "30", card["id"])
    tx(client, "CREDIT_WITHDRAWAL", "50", card["id"], destination_id=bank["id"])
    s = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert (
        Decimal(s["overpayment"]) == 20
        and Decimal(s["expense"]) == 530
        and Decimal(s["income"]) == 0
    )


def test_cross_month_refund_destination_cap_and_idempotency(client):
    cash = account(client)
    card = account(client, "信用卡", "CREDIT")
    purchase = tx(client, "EXPENSE", "320", card["id"], occurred_on="2026-09-20")[
        "transaction"
    ]
    a = client.get("/api/v1/finance/accounts").json()[0]
    p = {
        "type": "REFUND",
        "amount": "100",
        "account_id": cash["id"],
        "original_id": purchase["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: a["version"]},
    }
    k = str(uuid4())
    r = post(client, "/finance/transactions", p, k)
    assert r.status_code == 201
    # Simulate lost success response: recover the original operation, then same key replay.
    operation = client.get("/api/v1/operations/" + k).json()
    assert operation["status"] == "SUCCESS"
    assert post(client, "/finance/transactions", p, k).json() == r.json()
    accounts = client.get("/api/v1/finance/accounts").json()
    assert (
        Decimal(accounts[0]["balance"]) == 100 and Decimal(accounts[1]["debt"]) == 320
    )
    assert (
        Decimal(client.get("/api/v1/finance/summary?month=2026-10").json()["expense"])
        == -100
    )
    assert (
        Decimal(client.get("/api/v1/finance/summary?month=2026-09").json()["expense"])
        == 320
    )
    p["amount"] = "221"
    p["expected_versions"] = {accounts[0]["id"]: accounts[0]["version"]}
    assert post(client, "/finance/transactions", p).status_code == 409
    assert post(client, "/finance/transactions", p, k).status_code == 409
    other = new_client()
    assert other.get("/api/v1/operations/" + k).json()["status"] == "UNKNOWN"


def test_refund_to_credit_adjusts_only_destination(client):
    cash = account(client, opening="100")
    card = account(client, "卡", "CREDIT")
    purchase = tx(client, "EXPENSE", "20", cash["id"])["transaction"]
    tx(client, "REFUND", "10", card["id"], original_id=purchase["id"])
    a = client.get("/api/v1/finance/accounts").json()
    assert Decimal(a[0]["balance"]) == 80 and Decimal(a[1]["overpayment"]) == 10


def test_decimal_precision_and_audited_adjustment(client):
    a = account(client, opening="0.30")
    tx(client, "EXPENSE", "0.10", a["id"])
    tx(
        client,
        "ADJUSTMENT",
        "0.05",
        a["id"],
        description="对账差额",
        adjustment_direction="INCREASE",
    )
    assert Decimal(
        client.get("/api/v1/finance/accounts").json()[0]["balance"]
    ) == Decimal("0.25")
    s = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert Decimal(s["expense"]) == Decimal("0.10") and Decimal(s["income"]) == 0
    assert any(
        e["action"] == "FINANCE_ADJUSTMENT"
        for e in client.get("/api/v1/finance/audit").json()
    )
    p = {
        "type": "EXPENSE",
        "amount": "0.001",
        "account_id": a["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: 3},
    }
    assert post(client, "/finance/transactions", p).status_code == 422


def test_budget_zero_and_goals_not_extra_assets(client):
    a = account(client, opening="100")
    assert client.get("/api/v1/finance/budgets?month=2026-10").json() == []
    assert (
        client.put(
            "/api/v1/finance/budgets", json={"month": "2026-10", "amount": "0"}
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/v1/finance/budgets",
            json={"month": "2026-10", "category": "餐饮", "amount": "10"},
        ).status_code
        == 200
    )
    s = client.get("/api/v1/finance/summary?month=2026-10").json()
    assert len(s["budgets"]) == 2 and Decimal(s["net_assets"]) == 100
    p = {"name": "旅行", "account_id": a["id"], "target_amount": "500"}
    assert post(client, "/finance/savings-goals", p).status_code == 201
    assert post(client, "/finance/savings-goals", p).status_code == 409
    assert (
        Decimal(
            client.get("/api/v1/finance/summary?month=2026-10").json()["net_assets"]
        )
        == 100
    )


def test_workout_single_active_constraint_conflict_and_recovery(client):
    s = post(client, "/fitness/sessions", {"name": "力量"}).json()
    assert post(client, "/fitness/sessions", {"name": "另一训练"}).status_code == 409
    w = post(
        client,
        "/fitness/sessions/" + s["id"] + "/sets",
        {"exercise": "深蹲", "reps": 5},
    ).json()
    p = {
        "exercise": "深蹲",
        "reps": 10,
        "weight": "20",
        "completed": True,
        "expected_version": 1,
    }
    r = client.patch("/api/v1/fitness/sessions/" + s["id"] + "/sets/" + w["id"], json=p)
    assert r.status_code == 200
    assert (
        client.patch(
            "/api/v1/fitness/sessions/" + s["id"] + "/sets/" + w["id"], json=p
        ).status_code
        == 409
    )
    saved = client.get("/api/v1/fitness/sessions/active").json()
    assert saved["sets"][0]["reps"] == 10 and saved["sets"][0]["version"] == 2
    with pytest.raises(Exception):
        with SessionLocal.begin() as db:
            db.add(WorkoutSession(user_id=s["user_id"], name="db-constraint"))


def test_workout_template_actual_one_of_three_pause_abort(client):
    template = post(
        client,
        "/fitness/entries/template",
        {"name": "模板", "exercises": ["深蹲"], "sets": 3},
    ).json()
    s = post(client, "/fitness/sessions", {"template_id": template["id"]}).json()
    assert len(s["sets"]) == 3
    w = s["sets"][0]
    client.patch(
        "/api/v1/fitness/sessions/" + s["id"] + "/sets/" + w["id"],
        json={
            "exercise": "深蹲",
            "weight": "10",
            "reps": 8,
            "completed": True,
            "expected_version": 1,
        },
    )
    s = client.get("/api/v1/fitness/sessions/active").json()
    paused = post(
        client,
        "/fitness/sessions/" + s["id"] + "/state",
        {"status": "PAUSED", "expected_version": s["version"]},
    ).json()
    assert paused["status"] == "PAUSED"
    assert post(client, "/fitness/sessions", {}).status_code == 409
    s = post(
        client,
        "/fitness/sessions/" + s["id"] + "/state",
        {"status": "IN_PROGRESS", "expected_version": paused["version"]},
    ).json()
    r = post(
        client,
        "/fitness/sessions/" + s["id"] + "/state",
        {
            "status": "ABORTED",
            "expected_version": s["version"],
            "expected_set_versions": {w["id"]: w["version"] for w in s["sets"]},
        },
    )
    assert r.status_code == 200
    assert len([w for w in r.json()["sets"] if w["completed"]]) == 1
    assert client.get("/api/v1/fitness/sessions/active").json() is None
    assert post(client, "/fitness/sessions", {}).status_code == 201


def test_finish_rejects_stale_sets_and_idempotent(client):
    s = post(client, "/fitness/sessions", {}).json()
    w = post(
        client,
        "/fitness/sessions/" + s["id"] + "/sets",
        {"exercise": "跑步", "seconds": 60, "completed": True},
    ).json()
    s = client.get("/api/v1/fitness/sessions/active").json()
    p = {
        "status": "COMPLETED",
        "expected_version": s["version"],
        "expected_set_versions": {},
    }
    assert post(client, "/fitness/sessions/" + s["id"] + "/state", p).status_code == 409
    p["expected_set_versions"] = {w["id"]: w["version"]}
    k = str(uuid4())
    r = post(client, "/fitness/sessions/" + s["id"] + "/state", p, k)
    assert r.status_code == 200
    assert (
        post(client, "/fitness/sessions/" + s["id"] + "/state", p, k).json() == r.json()
    )


def test_source_task_closure_only_after_actual_workout(client):
    task = post(client, "/tasks", {"title": "训练"}).json()
    s = post(client, "/fitness/sessions", {"source_task_id": task["id"]}).json()
    w = post(
        client,
        "/fitness/sessions/" + s["id"] + "/sets",
        {"exercise": "深蹲", "reps": 5, "completed": True},
    ).json()
    s = client.get("/api/v1/fitness/sessions/active").json()
    post(
        client,
        "/fitness/sessions/" + s["id"] + "/state",
        {
            "status": "COMPLETED",
            "expected_version": s["version"],
            "expected_set_versions": {w["id"]: w["version"]},
        },
    )
    assert client.get("/api/v1/tasks/" + task["id"]).json()["status"] == "COMPLETED"
    client.delete("/api/v1/tasks/" + task["id"] + "?expected_version=2")
    assert len(client.get("/api/v1/fitness/sessions").json()) == 1


def test_preferences_privacy_isolation_and_currency_lock(client):
    other = new_client()
    assert (
        client.patch(
            "/api/v1/me/preferences", json={"privacy_masked": True, "timezone": "UTC"}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me").json()["privacy_masked"] is True
    assert other.get("/api/v1/me").json()["privacy_masked"] is False
    account(client)
    assert (
        client.patch("/api/v1/me/preferences", json={"currency": "USD"}).status_code
        == 409
    )
    assert (
        client.patch(
            "/api/v1/me/preferences", json={"timezone": "Invalid/timezone"}
        ).status_code
        == 422
    )


def test_concurrent_refund_cap(client):
    a = account(client, opening="100")
    original = tx(client, "EXPENSE", "100", a["id"])["transaction"]
    ac = client.get("/api/v1/finance/accounts").json()[0]
    payload = {
        "type": "REFUND",
        "amount": "80",
        "account_id": a["id"],
        "original_id": original["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: ac["version"]},
    }
    from fastapi.testclient import TestClient
    from app.main import app

    def send():
        with TestClient(app) as c:
            c.cookies.update(client.cookies)
            c.headers.update(client.headers)
            return post(c, "/finance/transactions", payload).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: send(), range(2)))
    assert sorted(statuses) == [201, 409]
    assert (
        len(
            [
                t
                for t in client.get("/api/v1/finance/transactions").json()
                if t["type"] == "REFUND"
            ]
        )
        == 1
    )


def test_recurrence_extends_without_rewriting_completed_instances(client):
    post(
        client,
        "/tasks",
        {"title": "周回顾", "scheduled_date": "2026-10-13", "recurrence": "WEEKLY"},
    )
    first = client.get("/api/v1/tasks").json()[0]
    client.patch(
        "/api/v1/tasks/" + first["id"],
        json={"status": "COMPLETED", "expected_version": 1},
    )
    future = client.get("/api/v1/tasks?view=today&day=2027-10-12").json()
    assert len(future) == 1
    assert client.get("/api/v1/tasks/" + first["id"]).json()["status"] == "COMPLETED"
    assert (
        client.get("/api/v1/tasks?view=today&day=2027-10-12").json()[0]["id"]
        == future[0]["id"]
    )


def test_goal_edit_does_not_create_money(client):
    a = account(client, opening="100")
    g = post(
        client,
        "/finance/savings-goals",
        {"name": "旅行", "account_id": a["id"], "target_amount": "200"},
    ).json()
    r = client.patch(
        "/api/v1/finance/savings-goals/" + g["id"],
        json={"name": "新目标", "target_amount": "300", "expected_version": 1},
    )
    assert r.status_code == 200
    assert Decimal(client.get("/api/v1/finance/accounts").json()[0]["balance"]) == 100


def test_session_creation_concurrency_and_unknown_owned_operation(client):
    from fastapi.testclient import TestClient
    from app.main import app

    def send():
        with TestClient(app) as c:
            c.cookies.update(client.cookies)
            c.headers.update(client.headers)
            return post(c, "/fitness/sessions", {"name": "并发"}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: send(), range(2)))
    assert sorted(statuses) == [201, 409]
    assert (
        client.get("/api/v1/operations/" + str(uuid4())).json()["status"] == "UNKNOWN"
    )


def test_idempotency_simultaneous_replay_atomic(client):
    from fastapi.testclient import TestClient
    from app.main import app

    a = account(client, opening="100")
    k = str(uuid4())
    p = {
        "type": "EXPENSE",
        "amount": "10",
        "account_id": a["id"],
        "occurred_on": "2026-10-13",
        "expected_versions": {a["id"]: a["version"]},
    }

    def send():
        with TestClient(app) as c:
            c.cookies.update(client.cookies)
            c.headers.update(client.headers)
            return post(c, "/finance/transactions", p, k)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: send(), range(2)))
    assert all(r.status_code == 201 for r in responses)
    assert (
        responses[0].json()["transaction"]["id"]
        == responses[1].json()["transaction"]["id"]
    )
    assert Decimal(client.get("/api/v1/finance/accounts").json()[0]["balance"]) == 90
