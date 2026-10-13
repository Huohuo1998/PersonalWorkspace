import hashlib, json
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import select
from .models import Operation, Audit
from .security import fail


def serialize(obj):
    if obj is None:
        return None
    if isinstance(obj, Decimal):
        return format(obj, "f")
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [serialize(v) for v in obj]
    if hasattr(obj, "__table__"):
        return {c.name: serialize(getattr(obj, c.name)) for c in obj.__table__.columns}
    return obj


def owned(db, model, id, user, lock=False):
    q = select(model).where(model.id == id, model.user_id == user.id)
    if lock:
        q = q.with_for_update()
    item = db.scalar(q)
    if item is None:
        fail("NOT_FOUND", "记录不可访问或已不存在", 404)
    return item


def version(item, expected):
    if expected != item.version:
        fail(
            "RESOURCE_VERSION_CONFLICT",
            "数据已更新，请核对最新内容；本次输入未覆盖服务器",
            409,
            {"current": serialize(item)},
        )


def rows(db, model, user):
    return select(model).where(model.user_id == user.id)


def fingerprint(data):
    return hashlib.sha256(
        json.dumps(
            serialize(data), sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def idempotent(db, user, key, kind, payload, action):
    if key is None or len(key) < 16 or len(key) > 100:
        fail("IDEMPOTENCY_REQUIRED", "本操作需要有效的防重复提交标识", 422)
    h = fingerprint(payload)
    previous = db.scalar(rows(db, Operation, user).where(Operation.key == key))
    if previous:
        if previous.kind != kind or previous.request_hash != h:
            fail("IDEMPOTENCY_CONFLICT", "该提交标识已用于不同内容，请查询原操作", 409)
        return previous.response
    result = serialize(action())
    db.add(
        Operation(
            user_id=user.id,
            key=key,
            kind=kind,
            request_hash=h,
            response=result,
            status="SUCCESS",
        )
    )
    db.flush()
    return result


def audit(db, user, action, subject, reason=""):
    db.add(Audit(user_id=user.id, action=action, subject_id=subject, reason=reason))
