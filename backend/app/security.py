import hashlib
import os
import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Depends, Request, Response, HTTPException
from sqlalchemy import select
from .db import get_db, SessionLocal
from .models import User, UserSession, LoginAttempt, now

hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_HOURS = 168


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fail(code, message, status=400, details=None):
    raise HTTPException(
        status, detail={"code": code, "message": message, "details": details or {}}
    )


def preauth_csrf(request: Request):
    cookie = request.cookies.get("pw_csrf", "")
    header = request.headers.get("x-csrf-token", "")
    if len(cookie) < 32 or not secrets.compare_digest(cookie, header):
        fail("CSRF_INVALID", "安全校验失败，请刷新后重试", 403)


def issue_session(db, user, response: Response):
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=digest(token),
            csrf_hash=digest(csrf),
            expires_at=now() + timedelta(hours=SESSION_HOURS),
        )
    )
    response.set_cookie(
        "pw_session",
        token,
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        "pw_csrf",
        csrf,
        max_age=SESSION_HOURS * 3600,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def current_user(request: Request, db=Depends(get_db, scope="function")):
    token = request.cookies.get("pw_session", "")
    session = db.scalar(
        select(UserSession).where(
            UserSession.token_hash == digest(token), UserSession.expires_at > now()
        )
    )
    if session is None:
        fail("AUTH_REQUIRED", "登录已失效，请重新登录", 401)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        csrf = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(session.csrf_hash, digest(csrf)):
            fail("CSRF_INVALID", "安全校验失败", 403)
    query = select(User).where(User.id == session.user_id)
    # Serialize mutations per user in PostgreSQL. Locks + version checks protect
    # balance previews, refund caps, shopping reconciliation and workout saves.
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        query = query.with_for_update()
    user = db.scalar(query)
    if user is None:
        fail("AUTH_REQUIRED", "账户不可用", 401)
    request.state.user_session = session
    return user


def throttle(request: Request, email: str):
    # Direct deployment passes the socket IP from the trusted nginx proxy only.
    # Store a one-way identifier; never store email/password in request logs.
    ip = request.client.host if request.client else "unknown"
    key = digest(ip + ":" + email.lower())
    with SessionLocal.begin() as db:
        from sqlalchemy.dialects.postgresql import insert

        db.execute(
            insert(LoginAttempt)
            .values(key=key, count=0, window=now())
            .on_conflict_do_nothing()
        )
        attempt = db.scalar(
            select(LoginAttempt).where(LoginAttempt.key == key).with_for_update()
        )
        if attempt.window < now() - timedelta(minutes=15):
            attempt.count, attempt.window = 0, now()
        limited = attempt.count >= 10
        attempt.count += 1
    if limited:
        fail("RATE_LIMITED", "尝试过于频繁，请在 15 分钟后重试", 429)


def password_valid(stored, supplied):
    try:
        return hasher.verify(stored, supplied)
    except (VerificationError, InvalidHashError):
        return False
