import os, secrets
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import FastAPI, Depends, Request, Response, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import select, delete, func, text
from sqlalchemy.exc import IntegrityError
from .db import get_db
from .models import *
from .schemas import *
from .common import serialize, owned, rows, version, idempotent, audit
from .security import (
    current_user,
    preauth_csrf,
    issue_session,
    hasher,
    password_valid,
    throttle,
    fail,
    COOKIE_SECURE,
)
from .finance import account_data, impact, post_transaction, summary, balance
from .shopping import preview as shopping_preview, apply as shopping_apply

app = FastAPI(
    title="Personal Workspace",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(
        ","
    ),
)
P = "/api/v1"


@app.middleware("http")
async def request_metadata(request: Request, call_next):
    request.state.request_id = secrets.token_hex(12)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    detail = (
        exc.detail
        if isinstance(exc.detail, dict)
        else {"code": "HTTP_ERROR", "message": str(exc.detail)}
    )
    return JSONResponse(
        {"error": {**detail, "request_id": getattr(request.state, "request_id", "")}},
        status_code=exc.status_code,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not echo submitted values (especially credentials) in validation errors.
    fields = [
        {"field": ".".join(str(v) for v in e["loc"][1:]), "message": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(
        {
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "输入格式不正确，请检查字段",
                "details": {"fields": fields},
                "request_id": request.state.request_id,
            }
        },
        status_code=422,
    )


@app.exception_handler(IntegrityError)
async def integrity_error(request, exc):
    return JSONResponse(
        {
            "error": {
                "code": "CONFLICT",
                "message": "记录已存在或已被更新，请刷新核对",
                "request_id": request.state.request_id,
            }
        },
        status_code=409,
    )


@app.exception_handler(Exception)
async def server_error(request, exc):
    return JSONResponse(
        {
            "error": {
                "code": "SERVER_ERROR",
                "message": "服务器暂时不可用；提交结果请查询原操作",
                "request_id": getattr(request.state, "request_id", ""),
            }
        },
        status_code=500,
    )


@app.get(P + "/health")
def health(db=Depends(get_db, scope="function")):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "personal-workspace"}


@app.get(P + "/auth/csrf")
def csrf(response: Response):
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        "pw_csrf", token, httponly=False, secure=COOKIE_SECURE, samesite="lax", path="/"
    )
    return {"csrf_token": token}


def user_data(user):
    return {
        k: getattr(user, k)
        for k in ("id", "email", "name", "timezone", "currency", "privacy_masked")
    }


@app.post(P + "/auth/register", status_code=201)
def register(
    p: AuthInput,
    request: Request,
    response: Response,
    db=Depends(get_db, scope="function"),
):
    preauth_csrf(request)
    throttle(request, str(p.email))
    email = str(p.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        fail("REGISTRATION_UNAVAILABLE", "无法注册，请尝试登录或使用其他邮箱", 409)
    user = User(email=email, name=p.name, password_hash=hasher.hash(p.password))
    db.add(user)
    db.flush()
    issue_session(db, user, response)
    return user_data(user)


@app.post(P + "/auth/login")
def login(
    p: AuthInput,
    request: Request,
    response: Response,
    db=Depends(get_db, scope="function"),
):
    preauth_csrf(request)
    throttle(request, str(p.email))
    user = db.scalar(select(User).where(User.email == str(p.email).lower()))
    # Dummy Argon2 verification prevents trivial timing-based email enumeration.
    stored = (
        user.password_hash if user else hasher.hash("constant-unusable-dummy-password")
    )
    if not password_valid(stored, p.password) or user is None:
        fail("LOGIN_FAILED", "邮箱或密码不正确", 401)
    old = request.cookies.get("pw_session")
    if old:
        from .security import digest

        db.execute(delete(UserSession).where(UserSession.token_hash == digest(old)))
    issue_session(db, user, response)
    return user_data(user)


@app.post(P + "/auth/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    db.delete(request.state.user_session)
    response.delete_cookie("pw_session", path="/")
    response.delete_cookie("pw_csrf", path="/")
    return {"status": "logged_out"}


@app.get(P + "/me")
def me(user=Depends(current_user, scope="function")):
    return user_data(user)


@app.patch(P + "/me/preferences")
def preferences(
    p: Preferences,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    values = p.model_dump(exclude_unset=True)
    if any(v is None for v in values.values()):
        fail("INVALID_PREFERENCE", "偏好值不能为空", 422)
    if p.timezone:
        try:
            ZoneInfo(p.timezone)
        except ZoneInfoNotFoundError:
            fail("INVALID_TIMEZONE", "时区无效", 422)
    if (
        p.currency
        and p.currency != user.currency
        and db.scalar(rows(db, Account, user).limit(1))
    ):
        fail(
            "CURRENCY_LOCKED",
            "已有财务账户，不能更改账本货币；MVP 不支持跨币种换算",
            409,
        )
    for key, value in values.items():
        setattr(user, key, value)
    db.flush()
    return user_data(user)


@app.get(P + "/operations/{key}")
def operation(
    key: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    op = db.scalar(rows(db, Operation, user).where(Operation.key == key))
    if not op:
        return {
            "status": "UNKNOWN",
            "message": "未查到已确认结果；请稍后再次查询，勿重复创建",
        }
    return {"status": op.status, "response": op.response, "kind": op.kind}


@app.get(P + "/operations")
def operations(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return serialize(
        db.scalars(
            rows(db, Operation, user).order_by(Operation.created_at.desc()).limit(50)
        ).all()
    )


@app.get(P + "/projects")
def projects(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return serialize(
        db.scalars(rows(db, Project, user).order_by(Project.created_at)).all()
    )


@app.post(P + "/projects", status_code=201)
def create_project(
    p: ProjectInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = Project(user_id=user.id, **p.model_dump())
    db.add(item)
    db.flush()
    return serialize(item)


@app.patch(P + "/projects/{id}/archive")
def archive_project(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Project, id, user)
    version(item, expected_version)
    item.archived = True
    item.version += 1
    return serialize(item)


def check_task_refs(db, user, project_id, kind=None, id=None):
    if project_id:
        owned(db, Project, project_id, user)
    if kind:
        if not id:
            fail("SOURCE_REQUIRED", "缺少来源记录")
        if kind == "training_plan":
            source = owned(db, Entry, id, user)
            if source.kind != "training_plan":
                fail("NOT_FOUND", "来源不可访问", 404)
        else:
            owned(db, MealPlan if kind == "meal_plan" else ShoppingList, id, user)
    elif id:
        fail("SOURCE_REQUIRED", "缺少来源类型")


@app.post(P + "/tasks", status_code=201)
def create_task(
    p: TaskInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    check_task_refs(db, user, p.project_id, p.source_kind, p.source_id)
    if p.scheduled_time and not p.scheduled_date:
        fail("DATE_REQUIRED", "设置执行时间时需选择执行日期", 422)
    item = Task(user_id=user.id, **p.model_dump())
    db.add(item)
    db.flush()
    if p.recurrence:
        start = p.scheduled_date or datetime.now(ZoneInfo(user.timezone)).date()
        interval = 1 if p.recurrence == "DAILY" else 7
        # Materialize a bounded 90-day window; template remains distinct from instances.
        for n in range(0, 90, interval):
            day = start + timedelta(days=n)
            values = p.model_dump(exclude={"recurrence", "scheduled_date", "due_at"})
            db.add(
                Task(
                    user_id=user.id,
                    **values,
                    parent_id=item.id,
                    occurrence_key=day.isoformat(),
                    scheduled_date=day,
                    due_at=(p.due_at + timedelta(days=n)) if p.due_at else None,
                )
            )
        db.flush()
    return serialize(item)


@app.get(P + "/tasks")
def tasks(
    view: str = "all",
    day: date | None = None,
    q: str = "",
    status: str | None = None,
    project_id: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    day = day or datetime.now(ZoneInfo(user.timezone)).date()
    # Expand a rolling window on demand. A unique occurrence key and conflict-ignore
    # insertion preserve instance overrides/history under concurrent reads.
    from sqlalchemy.dialects.postgresql import insert

    templates = db.scalars(
        rows(db, Task, user).where(
            Task.recurrence.is_not(None), Task.status != "CANCELLED"
        )
    ).all()
    for template in templates:
        base = (
            template.scheduled_date
            or template.created_at.astimezone(ZoneInfo(user.timezone)).date()
        )
        interval = 1 if template.recurrence == "DAILY" else 7
        first = (
            max(0, ((day - timedelta(days=35) - base).days + interval - 1) // interval)
            * interval
        )
        values = []
        for offset_day in range(
            first, (day + timedelta(days=90) - base).days, interval
        ):
            occurrence = base + timedelta(days=offset_day)
            values.append(
                dict(
                    id=uid(),
                    user_id=user.id,
                    version=1,
                    created_at=now(),
                    title=template.title,
                    notes=template.notes,
                    status="TODO",
                    inbox=template.inbox,
                    priority=template.priority,
                    scheduled_date=occurrence,
                    scheduled_time=template.scheduled_time,
                    due_at=template.due_at + timedelta(days=offset_day)
                    if template.due_at
                    else None,
                    project_id=template.project_id,
                    parent_id=template.id,
                    occurrence_key=occurrence.isoformat(),
                    source_kind=template.source_kind,
                    source_id=template.source_id,
                )
            )
        if values:
            db.execute(
                insert(Task)
                .values(values)
                .on_conflict_do_nothing(index_elements=["parent_id", "occurrence_key"])
            )
    query = rows(db, Task, user).where(Task.recurrence.is_(None))
    if view == "inbox":
        query = query.where(Task.inbox == True)
    elif view == "today":
        query = query.where(
            (Task.scheduled_date == day) | (Task.due_at == day),
            Task.status.notin_(["COMPLETED", "CANCELLED"]),
        )
    elif view == "overdue":
        query = query.where(
            Task.due_at < day, Task.status.notin_(["COMPLETED", "CANCELLED"])
        )
    if q:
        query = query.where(Task.title.ilike("%" + q + "%"))
    if status:
        query = query.where(Task.status == status)
    if project_id:
        query = query.where(Task.project_id == project_id)
    return serialize(
        db.scalars(
            query.order_by(
                Task.scheduled_date.asc().nullslast(),
                Task.scheduled_time.asc().nullslast(),
                Task.created_at,
            )
            .limit(limit)
            .offset(offset)
        ).all()
    )


@app.get(P + "/tasks/{id}")
def task_detail(
    id: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return serialize(owned(db, Task, id, user))


@app.patch(P + "/tasks/{id}")
def patch_task(
    id: str,
    p: TaskPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Task, id, user)
    version(item, p.expected_version)
    values = p.model_dump(exclude_unset=True, exclude={"expected_version"})
    for name in ("title", "notes", "status", "inbox"):
        if name in values and values[name] is None:
            fail("INVALID_FIELD", "该字段不能为空", 422)
    if p.project_id:
        check_task_refs(db, user, p.project_id)
    for key, value in values.items():
        setattr(item, key, value)
    if item.scheduled_time and not item.scheduled_date:
        fail("DATE_REQUIRED", "执行时间需要执行日期", 422)
    item.version += 1
    db.flush()
    return serialize(item)


@app.delete(P + "/tasks/{id}")
def delete_task(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    # Cancel preserves stable references and historical facts.
    item = owned(db, Task, id, user)
    version(item, expected_version)
    item.status = "CANCELLED"
    item.version += 1
    return {"status": "cancelled"}


@app.post(P + "/tasks/{id}/schedule-today")
def schedule_today(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Task, id, user)
    version(item, expected_version)
    item.scheduled_date = datetime.now(ZoneInfo(user.timezone)).date()
    item.version += 1
    return serialize(item)


@app.get(P + "/sources/{kind}/{id}")
def source(
    kind: str,
    id: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    models = {
        "training_plan": Entry,
        "meal_plan": MealPlan,
        "shopping_list": ShoppingList,
        "task": Task,
    }
    if kind not in models:
        fail("NOT_FOUND", "来源不可访问", 404)
    item = owned(db, models[kind], id, user)
    if kind == "training_plan" and item.kind != kind:
        fail("NOT_FOUND", "来源不可访问", 404)
    return serialize(item)


@app.get(P + "/events")
def events(
    start: date | None = None,
    end: date | None = None,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    query = rows(db, Event, user)
    if start:
        query = query.where(
            Event.end_at
            >= datetime.combine(start, datetime.min.time(), ZoneInfo(user.timezone))
        )
    if end:
        query = query.where(
            Event.start_at
            < datetime.combine(
                end + timedelta(days=1), datetime.min.time(), ZoneInfo(user.timezone)
            )
        )
    return serialize(db.scalars(query.order_by(Event.start_at).limit(500)).all())


@app.post(P + "/events", status_code=201)
def create_event(
    p: EventInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = Event(user_id=user.id, **p.model_dump())
    db.add(item)
    db.flush()
    return serialize(item)


@app.patch(P + "/events/{id}")
def patch_event(
    id: str,
    p: EventPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Event, id, user)
    version(item, p.expected_version)
    for key, value in p.model_dump(exclude={"expected_version"}).items():
        setattr(item, key, value)
    item.version += 1
    db.flush()
    return serialize(item)


@app.delete(P + "/events/{id}")
def delete_event(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Event, id, user)
    version(item, expected_version)
    db.delete(item)
    return {"status": "deleted"}


@app.get(P + "/finance/accounts")
def accounts(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return [
        account_data(db, a)
        for a in db.scalars(rows(db, Account, user).order_by(Account.created_at)).all()
    ]


@app.post(P + "/finance/accounts", status_code=201)
def create_account(
    p: AccountInput,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        item = Account(
            user_id=user.id, name=p.name, type=p.type, currency=user.currency
        )
        db.add(item)
        db.flush()
        if p.opening_balance:
            tx = Transaction(
                user_id=user.id,
                type="OPENING",
                amount=abs(p.opening_balance),
                occurred_on=datetime.now(ZoneInfo(user.timezone)).date(),
                account_id=item.id,
                description="期初余额",
            )
            db.add(tx)
            db.flush()
            db.add(
                Movement(
                    transaction_id=tx.id, account_id=item.id, delta=p.opening_balance
                )
            )
            db.flush()
        audit(db, user, "ACCOUNT_OPEN", item.id)
        return account_data(db, item)

    return idempotent(db, user, idempotency_key, "account", p.model_dump(), action)


@app.get(P + "/finance/summary")
def finance_summary(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return summary(db, user, month)


@app.get(P + "/finance/transactions")
def transactions(
    month: str | None = None,
    type: str | None = None,
    q: str = "",
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    query = rows(db, Transaction, user)
    if month:
        query = query.where(func.to_char(Transaction.occurred_on, "YYYY-MM") == month)
    if type:
        query = query.where(Transaction.type == type)
    if q:
        query = query.where(Transaction.description.ilike("%" + q + "%"))
    return serialize(
        db.scalars(
            query.order_by(
                Transaction.occurred_on.desc(), Transaction.created_at.desc()
            )
            .limit(limit)
            .offset(offset)
        ).all()
    )


@app.get(P + "/finance/transactions/{id}")
def transaction_detail(
    id: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Transaction, id, user)
    movements = db.scalars(
        select(Movement).where(Movement.transaction_id == item.id)
    ).all()
    refunds = db.scalars(
        rows(db, Transaction, user).where(Transaction.original_id == item.id)
    ).all()
    return {
        "transaction": serialize(item),
        "movements": serialize(movements),
        "refunds": serialize(refunds),
        "refundable": serialize(
            item.amount - sum((r.amount for r in refunds), Decimal("0"))
        )
        if item.type == "EXPENSE"
        else None,
    }


@app.post(P + "/finance/preview")
def finance_preview(
    p: FinanceInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return impact(db, user, p)[3]


@app.post(P + "/finance/transactions", status_code=201)
def create_transaction(
    p: FinanceInput,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return idempotent(
        db,
        user,
        idempotency_key,
        "finance",
        p.model_dump(),
        lambda: post_transaction(db, user, p),
    )


@app.get(P + "/finance/audit")
def finance_audit(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return serialize(
        db.scalars(
            rows(db, Audit, user).order_by(Audit.created_at.desc()).limit(200)
        ).all()
    )


@app.get(P + "/finance/budgets")
def budgets(
    month: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return serialize(
        db.scalars(rows(db, Budget, user).where(Budget.month == month)).all()
    )


@app.put(P + "/finance/budgets")
def put_budget(
    p: BudgetInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = db.scalar(
        rows(db, Budget, user).where(
            Budget.month == p.month, Budget.category == p.category
        )
    )
    if item:
        version(item, p.expected_version)
        item.amount = p.amount
        item.version += 1
    else:
        if p.expected_version is not None:
            fail("RESOURCE_VERSION_CONFLICT", "预算已更新，请重新核对", 409)
        item = Budget(user_id=user.id, **p.model_dump(exclude={"expected_version"}))
        db.add(item)
    db.flush()
    return serialize(item)


@app.get(P + "/finance/savings-goals")
def goals(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return [
        {
            **serialize(g),
            "balance": serialize(balance(db, owned(db, Account, g.account_id, user))),
        }
        for g in db.scalars(rows(db, SavingsGoal, user)).all()
    ]


@app.post(P + "/finance/savings-goals", status_code=201)
def create_goal(
    p: GoalInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    a = owned(db, Account, p.account_id, user)
    if a.type != "ASSET":
        fail("ASSET_REQUIRED", "储蓄目标需绑定专用资产账户")
    if db.scalar(
        rows(db, SavingsGoal, user).where(
            SavingsGoal.account_id == a.id, SavingsGoal.active == True
        )
    ):
        fail("GOAL_EXISTS", "该账户已有活动储蓄目标", 409)
    item = SavingsGoal(user_id=user.id, **p.model_dump())
    db.add(item)
    db.flush()
    return serialize(item)


@app.patch(P + "/finance/savings-goals/{id}/archive")
def archive_goal(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, SavingsGoal, id, user)
    version(item, expected_version)
    item.active = False
    item.version += 1
    return serialize(item)


@app.patch(P + "/finance/savings-goals/{id}")
def edit_goal(
    id: str,
    p: GoalPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, SavingsGoal, id, user)
    version(item, p.expected_version)
    item.name = p.name
    item.target_amount = p.target_amount
    item.version += 1
    db.flush()
    return serialize(item)


ENTRY_SCHEMAS = {
    "quick_activity": QuickActivity,
    "body": BodyInput,
    "exercise": ExerciseInput,
    "template": TemplateInput,
    "training_plan": TrainingPlanInput,
}


def validate_entry(kind, data, db, user):
    if kind not in ENTRY_SCHEMAS:
        fail("NOT_FOUND", "类型不存在", 404)
    try:
        p = ENTRY_SCHEMAS[kind].model_validate(data)
    except Exception:
        fail("INVALID_ENTRY", "字段不正确，请检查名称、日期和数值", 422)
    if kind == "training_plan" and p.template_id:
        template = owned(db, Entry, p.template_id, user)
        if template.kind != "template":
            fail("NOT_FOUND", "模板不可访问", 404)
    return p.model_dump(mode="json")


@app.get(P + "/fitness/entries/{kind}")
def entries(
    kind: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    if kind not in ENTRY_SCHEMAS:
        fail("NOT_FOUND", "类型不存在", 404)
    return serialize(
        db.scalars(
            rows(db, Entry, user)
            .where(Entry.kind == kind)
            .order_by(Entry.created_at.desc())
            .limit(500)
        ).all()
    )


@app.post(P + "/fitness/entries/{kind}", status_code=201)
def create_entry(
    kind: str,
    data: dict,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    values = validate_entry(kind, data, db, user)

    def action():
        item = Entry(user_id=user.id, kind=kind, data=values)
        db.add(item)
        db.flush()
        return serialize(item)

    return idempotent(db, user, idempotency_key, "entry:" + kind, data, action)


@app.put(P + "/fitness/entries/{kind}/{id}")
def edit_entry(
    kind: str,
    id: str,
    data: dict,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Entry, id, user)
    version(item, expected_version)
    if item.kind != kind:
        fail("NOT_FOUND", "记录不可访问", 404)
    item.data = validate_entry(kind, data, db, user)
    item.version += 1
    db.flush()
    return serialize(item)


@app.delete(P + "/fitness/entries/{kind}/{id}")
def remove_entry(
    kind: str,
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Entry, id, user)
    version(item, expected_version)
    if item.kind != kind:
        fail("NOT_FOUND", "记录不可访问", 404)
    db.delete(item)
    return {"status": "deleted"}


def session_data(db, user, item):
    return {
        **serialize(item),
        "sets": serialize(
            db.scalars(
                rows(db, WorkoutSet, user)
                .where(WorkoutSet.session_id == item.id)
                .order_by(WorkoutSet.ordinal)
            ).all()
        ),
    }


@app.get(P + "/fitness/sessions/active")
def active_session(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    item = db.scalar(
        rows(db, WorkoutSession, user).where(
            WorkoutSession.status.in_(["IN_PROGRESS", "PAUSED"])
        )
    )
    return session_data(db, user, item) if item else None


@app.get(P + "/fitness/sessions")
def sessions(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    return [
        session_data(db, user, s)
        for s in db.scalars(
            rows(db, WorkoutSession, user)
            .order_by(WorkoutSession.created_at.desc())
            .limit(200)
        ).all()
    ]


@app.post(P + "/fitness/sessions", status_code=201)
def create_session(
    p: SessionInput,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        active = db.scalar(
            rows(db, WorkoutSession, user).where(
                WorkoutSession.status.in_(["IN_PROGRESS", "PAUSED"])
            )
        )
        if active:
            fail(
                "ACTIVE_WORKOUT_EXISTS",
                "已有未结束训练，请恢复或处理",
                409,
                {"current": session_data(db, user, active)},
            )
        if p.source_task_id:
            owned(db, Task, p.source_task_id, user)
        template = None
        if p.template_id:
            template = owned(db, Entry, p.template_id, user)
            if template.kind != "template":
                fail("NOT_FOUND", "模板不可访问", 404)
        item = WorkoutSession(
            user_id=user.id, name=p.name, source_task_id=p.source_task_id
        )
        db.add(item)
        db.flush()
        if template:
            for i, exercise in enumerate(template.data["exercises"]):
                for j in range(template.data["sets"]):
                    db.add(
                        WorkoutSet(
                            user_id=user.id,
                            session_id=item.id,
                            exercise=exercise,
                            ordinal=i * template.data["sets"] + j + 1,
                        )
                    )
            db.flush()
        return session_data(db, user, item)

    return idempotent(db, user, idempotency_key, "session", p.model_dump(), action)


@app.post(P + "/fitness/sessions/{id}/sets", status_code=201)
def create_set(
    id: str,
    p: SetInput,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        item = owned(db, WorkoutSession, id, user)
        if item.status != "IN_PROGRESS":
            fail("SESSION_NOT_ACTIVE", "请先恢复训练；结束后的记录不可改写", 409)
        ordinal = (
            db.scalar(
                select(func.max(WorkoutSet.ordinal)).where(WorkoutSet.session_id == id)
            )
            or 0
        ) + 1
        s = WorkoutSet(
            user_id=user.id, session_id=id, ordinal=ordinal, **p.model_dump()
        )
        db.add(s)
        item.version += 1
        db.flush()
        return serialize(s)

    return idempotent(
        db, user, idempotency_key, "set", {"session_id": id, **p.model_dump()}, action
    )


@app.patch(P + "/fitness/sessions/{id}/sets/{set_id}")
def patch_set(
    id: str,
    set_id: str,
    p: SetPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    session = owned(db, WorkoutSession, id, user)
    item = owned(db, WorkoutSet, set_id, user)
    if item.session_id != id:
        fail("NOT_FOUND", "记录不可访问", 404)
    if session.status != "IN_PROGRESS":
        fail("SESSION_NOT_ACTIVE", "训练未在进行中；请恢复或查看历史", 409)
    if item.version != p.expected_version:
        fail(
            "RESOURCE_VERSION_CONFLICT",
            "训练组已被其他设备更新；请核对服务器值和本端输入",
            409,
            {"current": serialize(item), "session_version": session.version},
        )
    for key, value in p.model_dump(exclude={"expected_version"}).items():
        setattr(item, key, value)
    item.version += 1
    session.version += 1
    db.flush()
    return {
        "set": serialize(item),
        "session_version": session.version,
        "saved_at": now().isoformat(),
    }


@app.post(P + "/fitness/sessions/{id}/state")
def session_state(
    id: str,
    p: SessionState,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        item = owned(db, WorkoutSession, id, user)
        version(item, p.expected_version)
        if item.status in ("COMPLETED", "ABORTED"):
            fail("SESSION_FINISHED", "训练已结束，不可重复结束或恢复", 409)
        sets = db.scalars(
            rows(db, WorkoutSet, user).where(WorkoutSet.session_id == id)
        ).all()
        if p.status in ("COMPLETED", "ABORTED"):
            if set(p.expected_set_versions) != set(s.id for s in sets):
                fail("SETS_CHANGED", "组记录已变化，请重新核对结束", 409)
            for s in sets:
                version(s, p.expected_set_versions.get(s.id))
            item.ended_at = now()
            if (
                p.status == "COMPLETED"
                and item.source_task_id
                and any(s.completed for s in sets)
            ):
                task = owned(db, Task, item.source_task_id, user)
                if task.status != "CANCELLED":
                    task.status = "COMPLETED"
                    task.version += 1
        item.status = p.status
        item.version += 1
        audit(db, user, "WORKOUT_" + p.status, id)
        db.flush()
        return session_data(db, user, item)

    return idempotent(
        db, user, idempotency_key, "session-state", {"id": id, **p.model_dump()}, action
    )


@app.get(P + "/diet/recipes")
def recipes(
    q: str = "",
    exclude: str = "",
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    data = db.scalars(
        rows(db, Recipe, user).order_by(Recipe.created_at).limit(500)
    ).all()
    terms = [t.strip() for t in exclude.split(",") if t.strip()]
    return serialize(
        [
            r
            for r in data
            if (not q or q.lower() in (r.name + r.tags).lower())
            and not any(t in str(r.ingredients) for t in terms)
        ]
    )


@app.post(P + "/diet/recipes", status_code=201)
def create_recipe(
    p: RecipeInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = Recipe(
        user_id=user.id,
        **p.model_dump(exclude={"ingredients"}),
        ingredients=[i.model_dump(mode="json") for i in p.ingredients],
    )
    db.add(item)
    db.flush()
    return serialize(item)


@app.put(P + "/diet/recipes/{id}")
def update_recipe(
    id: str,
    p: RecipePatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, Recipe, id, user)
    version(item, p.expected_version)
    for key, value in p.model_dump(exclude={"expected_version", "ingredients"}).items():
        setattr(item, key, value)
    item.ingredients = [i.model_dump(mode="json") for i in p.ingredients]
    item.version += 1
    db.flush()
    return serialize(item)


@app.post(P + "/diet/recipes/starter")
def starter_recipes(
    user=Depends(current_user, scope="function"), db=Depends(get_db, scope="function")
):
    # Explicit opt-in curated recipe content only, never financial/health demo facts.
    if db.scalar(rows(db, Recipe, user).limit(1)):
        fail("RECIPES_EXIST", "已有食谱；请手动新增避免重复", 409)
    curated = [
        dict(
            name="番茄炒蛋",
            minutes=15,
            illustration="egg",
            tags="家常 · 快手",
            ingredients=[
                {
                    "ingredient": "鸡蛋",
                    "specification": "普通鸡蛋",
                    "quantity": "2",
                    "unit": "个",
                },
                {
                    "ingredient": "番茄",
                    "specification": "",
                    "quantity": "300",
                    "unit": "g",
                },
                {
                    "ingredient": "食用油",
                    "specification": "",
                    "quantity": "10",
                    "unit": "ml",
                },
            ],
            steps="1. 鸡蛋打散，番茄洗净切块。\n2. 热锅加油，炒熟鸡蛋盛出。\n3. 番茄炒软，加入鸡蛋拌匀；调味按个人需要。",
            allergen_note="含鸡蛋；食用油及调味品成分请自行核对",
        ),
        dict(
            name="香菇蔬菜饭",
            minutes=30,
            illustration="rice",
            tags="一锅 · 植物食材",
            ingredients=[
                {
                    "ingredient": "大米",
                    "specification": "",
                    "quantity": "100",
                    "unit": "g",
                },
                {
                    "ingredient": "香菇",
                    "specification": "",
                    "quantity": "80",
                    "unit": "g",
                },
                {
                    "ingredient": "青菜",
                    "specification": "",
                    "quantity": "150",
                    "unit": "g",
                },
            ],
            steps="1. 大米淘洗，香菇和青菜洗净切小块。\n2. 大米与香菇按电饭锅建议水量煮熟。\n3. 青菜另行炒熟，与饭拌匀；确认食材完全熟透。",
            allergen_note="调味品过敏信息未确认，请核对全部配料",
        ),
        dict(
            name="南瓜小米粥",
            minutes=25,
            illustration="soup",
            tags="早餐 · 温暖",
            ingredients=[
                {
                    "ingredient": "南瓜",
                    "specification": "",
                    "quantity": "200",
                    "unit": "g",
                },
                {
                    "ingredient": "小米",
                    "specification": "",
                    "quantity": "50",
                    "unit": "g",
                },
            ],
            steps="1. 南瓜去皮切小块，小米淘洗。\n2. 加适量水煮开，转小火煮至软熟。\n3. 根据个人偏好调整稠度。",
            allergen_note="过敏信息未确认，请核对全部配料",
        ),
    ]
    for values in curated:
        db.add(Recipe(user_id=user.id, servings=1, **values))
    db.flush()
    return {"added": len(curated)}


@app.get(P + "/diet/meal-plans")
def meal_plans(
    week: date,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return serialize(
        db.scalars(
            rows(db, MealPlan, user)
            .where(MealPlan.day >= week, MealPlan.day < week + timedelta(days=7))
            .order_by(MealPlan.day)
        ).all()
    )


@app.put(P + "/diet/meal-plans")
def put_meal_plan(
    p: MealPlanInput,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    if p.recipe_id:
        owned(db, Recipe, p.recipe_id, user)
    item = db.scalar(
        rows(db, MealPlan, user).where(MealPlan.day == p.day, MealPlan.slot == p.slot)
    )
    if item:
        version(item, p.expected_version)
        for key, value in p.model_dump(exclude={"expected_version"}).items():
            setattr(item, key, value)
        item.version += 1
    else:
        if p.expected_version is not None:
            fail("RESOURCE_VERSION_CONFLICT", "菜单已变化，请重新核对", 409)
        item = MealPlan(user_id=user.id, **p.model_dump(exclude={"expected_version"}))
        db.add(item)
    db.flush()
    return serialize(item)


@app.delete(P + "/diet/meal-plans/{id}")
def delete_meal_plan(
    id: str,
    expected_version: int,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, MealPlan, id, user)
    version(item, expected_version)
    # Detach linked meal facts instead of deleting or rewriting the facts.
    for r in db.scalars(
        rows(db, MealRecord, user).where(MealRecord.plan_id == id)
    ).all():
        r.plan_id = None
    db.delete(item)
    return {"status": "deleted"}


@app.get(P + "/diet/shopping-lists")
def shopping_lists(
    week: date,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = db.scalar(rows(db, ShoppingList, user).where(ShoppingList.week == week))
    if item is None:
        return None
    current = shopping_preview(db, user, item)
    return {
        "list": serialize(item),
        "items": serialize(
            db.scalars(
                rows(db, ShoppingItem, user)
                .where(ShoppingItem.list_id == item.id)
                .order_by(ShoppingItem.created_at)
            ).all()
        ),
        "plan_changed": current["changed"],
    }


@app.post(P + "/diet/shopping-lists", status_code=201)
def create_shopping_list(
    p: ShoppingCreate,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        if db.scalar(rows(db, ShoppingList, user).where(ShoppingList.week == p.week)):
            fail("LIST_EXISTS", "本周已有快照，请使用差异核对", 409)
        item = ShoppingList(user_id=user.id, week=p.week)
        db.add(item)
        db.flush()
        return shopping_apply(db, user, item, shopping_preview(db, user, item))

    return idempotent(
        db, user, idempotency_key, "shopping-create", p.model_dump(), action
    )


@app.post(P + "/diet/shopping-lists/{id}/reconciliation-preview")
def reconciliation_preview(
    id: str,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return shopping_preview(db, user, owned(db, ShoppingList, id, user))


@app.post(P + "/diet/shopping-lists/{id}/reconciliation-apply")
def reconciliation_apply(
    id: str,
    p: ShoppingApply,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        item = owned(db, ShoppingList, id, user)
        version(item, p.expected_version)
        current = shopping_preview(db, user, item)
        if current["diff_hash"] != p.diff_hash:
            fail("DIFF_CHANGED", "菜单、食谱或采购状态已变化，请重新核对", 409)
        return shopping_apply(db, user, item, current)

    return idempotent(
        db,
        user,
        idempotency_key,
        "shopping-apply",
        {"id": id, **p.model_dump()},
        action,
    )


@app.patch(P + "/diet/shopping-lists/{id}/items/{item_id}")
def shopping_item(
    id: str,
    item_id: str,
    p: ShoppingPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    lst = owned(db, ShoppingList, id, user)
    item = owned(db, ShoppingItem, item_id, user)
    if item.list_id != id:
        fail("NOT_FOUND", "记录不可访问", 404)
    version(item, p.expected_version)
    if p.pending is not None:
        item.pending = p.pending
        item.manual_override = True
    if p.purchase_quantity is not None:
        if p.purchase_quantity > item.pending:
            fail("INVALID_PURCHASE", "已购数量超过待购数量", 422)
        item.purchased += p.purchase_quantity
        item.pending -= p.purchase_quantity
    item.version += 1
    lst.version += 1
    db.flush()
    return serialize(item)


@app.post(P + "/diet/shopping-lists/{id}/items", status_code=201)
def manual_shopping(
    id: str,
    p: ManualShopping,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    lst = owned(db, ShoppingList, id, user)
    # Preserve identity: do not create duplicate keys that could lose purchased facts.
    existing = db.scalar(
        rows(db, ShoppingItem, user).where(
            ShoppingItem.list_id == id,
            ShoppingItem.ingredient == p.ingredient,
            ShoppingItem.specification == p.specification,
            ShoppingItem.unit == p.unit,
        )
    )
    if existing:
        existing.pending += p.pending
        existing.manual_override = True
        existing.version += 1
        item = existing
    else:
        item = ShoppingItem(
            user_id=user.id, list_id=id, manual_override=True, **p.model_dump()
        )
        db.add(item)
    lst.version += 1
    db.flush()
    return serialize(item)


@app.get(P + "/diet/meal-records")
def meal_records(
    start: date | None = None,
    end: date | None = None,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    query = rows(db, MealRecord, user)
    if start:
        query = query.where(MealRecord.day >= start)
    if end:
        query = query.where(MealRecord.day <= end)
    return serialize(
        db.scalars(
            query.order_by(MealRecord.day.desc(), MealRecord.created_at.desc()).limit(
                500
            )
        ).all()
    )


@app.post(P + "/diet/meal-records", status_code=201)
def create_meal_record(
    p: MealRecordInput,
    idempotency_key: str | None = Header(None),
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    def action():
        if p.plan_id:
            owned(db, MealPlan, p.plan_id, user)
        item = MealRecord(user_id=user.id, **p.model_dump())
        db.add(item)
        db.flush()
        return serialize(item)

    return idempotent(db, user, idempotency_key, "meal-record", p.model_dump(), action)


@app.put(P + "/diet/meal-records/{id}")
def edit_meal_record(
    id: str,
    p: MealRecordPatch,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    item = owned(db, MealRecord, id, user)
    version(item, p.expected_version)
    if p.plan_id:
        owned(db, MealPlan, p.plan_id, user)
    for name, value in p.model_dump(exclude={"expected_version"}).items():
        setattr(item, name, value)
    item.version += 1
    audit(db, user, "MEAL_CORRECTION", item.id)
    db.flush()
    return serialize(item)


@app.get(P + "/dashboard")
def dashboard(
    day: date | None = None,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    day = day or datetime.now(ZoneInfo(user.timezone)).date()
    today = tasks("today", day, "", None, None, 500, 0, user, db)
    overdue = tasks("overdue", day, "", None, None, 500, 0, user, db)
    ev = events(day, day, user, db)
    meals = db.scalars(rows(db, MealRecord, user).where(MealRecord.day == day)).all()
    workout = db.scalars(
        rows(db, WorkoutSession, user).where(
            WorkoutSession.status == "COMPLETED",
            WorkoutSession.ended_at
            >= datetime.combine(day, datetime.min.time(), ZoneInfo(user.timezone)),
            WorkoutSession.ended_at
            < datetime.combine(
                day + timedelta(days=1), datetime.min.time(), ZoneInfo(user.timezone)
            ),
        )
    ).all()
    quick = db.scalars(
        rows(db, Entry, user).where(Entry.kind == "quick_activity")
    ).all()
    return {
        "day": day.isoformat(),
        "tasks": today,
        "overdue": overdue,
        "events": ev,
        "finance": summary(db, user, day.strftime("%Y-%m")),
        "fitness": {
            "completed_sessions": len(workout),
            "quick_minutes": sum(
                e.data["minutes"] for e in quick if e.data["day"] == day.isoformat()
            ),
        },
        "diet": {
            "records": len(meals),
            "home_cooked": sum(1 for m in meals if m.source == "HOME_COOKED"),
        },
    }


@app.get(P + "/dashboard/schedule")
def schedule_summary(
    day: date,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    return {
        "day": day.isoformat(),
        "tasks": tasks("today", day, "", None, None, 500, 0, user, db),
        "overdue": tasks("overdue", day, "", None, None, 500, 0, user, db),
        "events": events(day, day, user, db),
    }


@app.get(P + "/dashboard/fitness")
def fitness_summary(
    day: date,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    start = datetime.combine(day, datetime.min.time(), ZoneInfo(user.timezone))
    end = datetime.combine(
        day + timedelta(days=1), datetime.min.time(), ZoneInfo(user.timezone)
    )
    count = db.scalar(
        select(func.count())
        .select_from(WorkoutSession)
        .where(
            WorkoutSession.user_id == user.id,
            WorkoutSession.status == "COMPLETED",
            WorkoutSession.ended_at >= start,
            WorkoutSession.ended_at < end,
        )
    )
    quick = db.scalars(
        rows(db, Entry, user).where(Entry.kind == "quick_activity")
    ).all()
    return {
        "completed_sessions": count,
        "quick_minutes": sum(
            e.data["minutes"] for e in quick if e.data["day"] == day.isoformat()
        ),
    }


@app.get(P + "/dashboard/diet")
def diet_summary(
    day: date,
    user=Depends(current_user, scope="function"),
    db=Depends(get_db, scope="function"),
):
    meals = db.scalars(rows(db, MealRecord, user).where(MealRecord.day == day)).all()
    return {
        "records": len(meals),
        "home_cooked": sum(1 for m in meals if m.source == "HOME_COOKED"),
    }
