from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import (
    String,
    Text,
    Date,
    DateTime,
    Numeric,
    Boolean,
    Integer,
    ForeignKey,
    JSON,
    UniqueConstraint,
    Index,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class IdentityMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OwnedMixin(IdentityMixin):
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class User(IdentityMixin, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Shanghai")
    currency: Mapped[str] = mapped_column(String(3), default="CNY")
    privacy_masked: Mapped[bool] = mapped_column(Boolean, default=False)


class UserSession(IdentityMixin, Base):
    __tablename__ = "user_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    window: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Project(OwnedMixin, Base):
    __tablename__ = "projects"
    name: Mapped[str] = mapped_column(String(200))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Task(OwnedMixin, Base):
    __tablename__ = "tasks"
    title: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="TODO")
    inbox: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[str | None] = mapped_column(String(16))
    scheduled_date: Mapped[datetime | None] = mapped_column(Date)
    scheduled_time: Mapped[str | None] = mapped_column(String(5))
    due_at: Mapped[datetime | None] = mapped_column(Date)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"))
    recurrence: Mapped[str | None] = mapped_column(String(16))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"))
    occurrence_key: Mapped[str | None] = mapped_column(String(20))
    source_kind: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = (UniqueConstraint("parent_id", "occurrence_key"),)


class Event(OwnedMixin, Base):
    __tablename__ = "events"
    title: Mapped[str] = mapped_column(String(200))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")


class Account(OwnedMixin, Base):
    __tablename__ = "accounts"
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(12))
    currency: Mapped[str] = mapped_column(String(3), default="CNY")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Transaction(OwnedMixin, Base):
    __tablename__ = "financial_transactions"
    type: Mapped[str] = mapped_column(String(24))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    occurred_on: Mapped[datetime] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(80), default="其他")
    description: Mapped[str] = mapped_column(String(400), default="")
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    destination_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    original_id: Mapped[str | None] = mapped_column(
        ForeignKey("financial_transactions.id")
    )
    source_kind: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[str | None] = mapped_column(String(36))


class Movement(IdentityMixin, Base):
    __tablename__ = "account_movements"
    transaction_id: Mapped[str] = mapped_column(
        ForeignKey("financial_transactions.id"), index=True
    )
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    delta: Mapped[Decimal] = mapped_column(Numeric(18, 2))


class Operation(OwnedMixin, Base):
    __tablename__ = "idempotency_operations"
    key: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(60))
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="SUCCESS")
    response: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("user_id", "key"),)


class Audit(OwnedMixin, Base):
    __tablename__ = "audit_events"
    action: Mapped[str] = mapped_column(String(60))
    subject_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str] = mapped_column(String(400), default="")


class Budget(OwnedMixin, Base):
    __tablename__ = "budgets"
    month: Mapped[str] = mapped_column(String(7))
    category: Mapped[str] = mapped_column(String(80), default="总预算")
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    __table_args__ = (UniqueConstraint("user_id", "month", "category"),)


class SavingsGoal(OwnedMixin, Base):
    __tablename__ = "savings_goals"
    name: Mapped[str] = mapped_column(String(100))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    target_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (
        Index(
            "one_active_goal",
            "account_id",
            unique=True,
            postgresql_where=text("active = true"),
            sqlite_where=text("active = 1"),
        ),
    )


class WorkoutSession(OwnedMixin, Base):
    __tablename__ = "workout_sessions"
    name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="IN_PROGRESS")
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id"))
    __table_args__ = (
        Index(
            "one_active_workout",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('IN_PROGRESS','PAUSED')"),
            sqlite_where=text("status IN ('IN_PROGRESS','PAUSED')"),
        ),
    )


class WorkoutSet(OwnedMixin, Base):
    __tablename__ = "workout_sets"
    session_id: Mapped[str] = mapped_column(
        ForeignKey("workout_sessions.id"), index=True
    )
    exercise: Mapped[str] = mapped_column(String(100))
    ordinal: Mapped[int] = mapped_column(Integer)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    reps: Mapped[int | None] = mapped_column(Integer)
    seconds: Mapped[int | None] = mapped_column(Integer)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)


class Entry(OwnedMixin, Base):
    """Typed validated payloads for editable plans, exercises, templates, quick activities and measurements."""

    __tablename__ = "entries"
    kind: Mapped[str] = mapped_column(String(30), index=True)
    data: Mapped[dict] = mapped_column(JSON)


class Recipe(OwnedMixin, Base):
    __tablename__ = "recipes"
    name: Mapped[str] = mapped_column(String(100))
    minutes: Mapped[int] = mapped_column(Integer, default=20)
    servings: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=1)
    ingredients: Mapped[list] = mapped_column(JSON)
    steps: Mapped[str] = mapped_column(Text)
    tags: Mapped[str] = mapped_column(String(200), default="")
    allergen_note: Mapped[str] = mapped_column(
        String(400), default="过敏信息未确认，请核对全部配料"
    )
    illustration: Mapped[str] = mapped_column(String(20), default="vegetable")


class MealPlan(OwnedMixin, Base):
    __tablename__ = "meal_plans"
    day: Mapped[datetime] = mapped_column(Date, index=True)
    slot: Mapped[str] = mapped_column(String(16))
    recipe_id: Mapped[str | None] = mapped_column(ForeignKey("recipes.id"))
    description: Mapped[str] = mapped_column(String(200), default="")
    servings: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=1)
    __table_args__ = (UniqueConstraint("user_id", "day", "slot"),)


class ShoppingList(OwnedMixin, Base):
    __tablename__ = "shopping_lists"
    week: Mapped[datetime] = mapped_column(Date)
    source_hash: Mapped[str] = mapped_column(String(64), default="")
    __table_args__ = (UniqueConstraint("user_id", "week"),)


class ShoppingItem(OwnedMixin, Base):
    __tablename__ = "shopping_items"
    list_id: Mapped[str] = mapped_column(ForeignKey("shopping_lists.id"), index=True)
    ingredient: Mapped[str] = mapped_column(String(100))
    specification: Mapped[str] = mapped_column(String(100), default="")
    unit: Mapped[str] = mapped_column(String(30))
    required: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    purchased: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    pending: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    manual_override: Mapped[bool] = mapped_column(Boolean, default=False)
    uncertain: Mapped[bool] = mapped_column(Boolean, default=False)


class MealRecord(OwnedMixin, Base):
    __tablename__ = "meal_records"
    day: Mapped[datetime] = mapped_column(Date, index=True)
    slot: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(String(400))
    source: Mapped[str] = mapped_column(String(20))
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("meal_plans.id"))
    notes: Mapped[str] = mapped_column(String(400), default="")
