from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    EmailStr,
    field_validator,
    model_validator,
)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Money = Decimal


class AuthInput(Input):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default="朋友", min_length=1, max_length=80)


class Preferences(Input):
    privacy_masked: bool | None = None
    timezone: str | None = None
    currency: Literal["CNY", "USD", "EUR", "HKD"] | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)


class TaskInput(Input):
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=4000)
    status: Literal["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] = "TODO"
    inbox: bool = True
    priority: Literal["LOW", "NORMAL", "HIGH"] | None = None
    scheduled_date: date | None = None
    scheduled_time: str | None = Field(
        default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"
    )
    due_at: date | None = None
    project_id: str | None = None
    recurrence: Literal["DAILY", "WEEKLY"] | None = None
    source_kind: Literal["training_plan", "meal_plan", "shopping_list"] | None = None
    source_id: str | None = None


class TaskPatch(Input):
    expected_version: int
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    status: Literal["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] | None = None
    inbox: bool | None = None
    priority: Literal["LOW", "NORMAL", "HIGH"] | None = None
    scheduled_date: date | None = None
    scheduled_time: str | None = Field(
        default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"
    )
    due_at: date | None = None
    project_id: str | None = None


class ProjectInput(Input):
    name: str = Field(min_length=1, max_length=200)


class EventInput(Input):
    title: str = Field(min_length=1, max_length=200)
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    notes: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def times(self):
        if self.start_at.tzinfo is None or self.end_at.tzinfo is None:
            raise ValueError("事件时间必须包含时区")
        if self.end_at <= self.start_at:
            raise ValueError("结束时间必须晚于开始时间")
        return self


class EventPatch(EventInput):
    expected_version: int


class AccountInput(Input):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["ASSET", "CREDIT"]
    opening_balance: Decimal = Field(
        default=Decimal("0"), max_digits=18, decimal_places=2
    )


class FinanceInput(Input):
    type: Literal[
        "INCOME",
        "EXPENSE",
        "TRANSFER",
        "REPAYMENT",
        "REFUND",
        "ADJUSTMENT",
        "CREDIT_WITHDRAWAL",
    ]
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    account_id: str
    destination_id: str | None = None
    original_id: str | None = None
    occurred_on: date
    category: str = Field(default="其他", min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    expected_versions: dict[str, int]
    confirmed_warnings: bool = False
    adjustment_direction: Literal["INCREASE", "DECREASE"] = "INCREASE"
    source_kind: Literal["shopping_list", "task"] | None = None
    source_id: str | None = None


class BudgetInput(Input):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    category: str = Field(default="总预算", min_length=1, max_length=80)
    amount: Decimal = Field(ge=0, max_digits=18, decimal_places=2)
    expected_version: int | None = None


class GoalInput(Input):
    name: str = Field(min_length=1, max_length=100)
    account_id: str
    target_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)


class GoalPatch(Input):
    name: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    expected_version: int


class SessionInput(Input):
    name: str = Field(default="自由力量训练", min_length=1, max_length=100)
    template_id: str | None = None
    source_task_id: str | None = None


class SetInput(Input):
    exercise: str = Field(min_length=1, max_length=100)
    weight: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)
    reps: int | None = Field(default=None, ge=0, le=10000)
    seconds: int | None = Field(default=None, ge=0, le=86400)
    completed: bool = False

    @model_validator(mode="after")
    def complete_values(self):
        if self.completed and not (self.reps or self.seconds):
            raise ValueError("完成的训练组需填写次数或时长")
        return self


class SetPatch(SetInput):
    expected_version: int


class SessionState(Input):
    expected_version: int
    status: Literal["IN_PROGRESS", "PAUSED", "COMPLETED", "ABORTED"]
    expected_set_versions: dict[str, int] = {}


class QuickActivity(Input):
    name: str = Field(min_length=1, max_length=100)
    day: date
    minutes: int = Field(gt=0, le=1440)
    notes: str = Field(default="", max_length=400)


class BodyInput(Input):
    day: date
    weight: Decimal | None = Field(default=None, gt=0, le=500, decimal_places=2)
    waist: Decimal | None = Field(default=None, gt=0, le=400, decimal_places=2)
    recovery: str = Field(default="", max_length=400)

    @model_validator(mode="after")
    def values(self):
        if self.weight is None and self.waist is None and not self.recovery:
            raise ValueError("请填写至少一项测量或恢复反馈")
        return self


class ExerciseInput(Input):
    name: str = Field(min_length=1, max_length=100)
    equipment: str = Field(default="徒手", max_length=100)
    instructions: str = Field(default="", max_length=2000)


class TemplateInput(Input):
    name: str = Field(min_length=1, max_length=100)
    exercises: list[str] = Field(min_length=1, max_length=20)
    sets: int = Field(default=3, ge=1, le=20)


class TrainingPlanInput(Input):
    name: str = Field(min_length=1, max_length=100)
    day: date
    template_id: str | None = None
    notes: str = Field(default="", max_length=400)


class Ingredient(Input):
    ingredient: str = Field(min_length=1, max_length=100)
    specification: str = Field(default="", max_length=100)
    quantity: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=3
    )
    unit: str = Field(min_length=1, max_length=30)


class RecipeInput(Input):
    name: str = Field(min_length=1, max_length=100)
    minutes: int = Field(default=20, ge=1, le=1440)
    servings: Decimal = Field(default=1, gt=0, le=100, decimal_places=2)
    ingredients: list[Ingredient] = Field(default=[], max_length=100)
    steps: str = Field(min_length=1, max_length=10000)
    tags: str = Field(default="", max_length=200)
    allergen_note: str = Field(default="过敏信息未确认，请核对全部配料", max_length=400)
    illustration: Literal["vegetable", "egg", "rice", "soup"] = "vegetable"


class RecipePatch(RecipeInput):
    expected_version: int


class MealPlanInput(Input):
    day: date
    slot: Literal["BREAKFAST", "LUNCH", "DINNER"]
    recipe_id: str | None = None
    description: str = Field(default="", max_length=200)
    servings: Decimal = Field(default=1, gt=0, le=100, decimal_places=2)
    expected_version: int | None = None

    @model_validator(mode="after")
    def content(self):
        if not self.recipe_id and not self.description:
            raise ValueError("请选择食谱或填写菜单内容")
        return self


class ShoppingCreate(Input):
    week: date


class ShoppingApply(Input):
    diff_hash: str
    expected_version: int


class ShoppingPatch(Input):
    expected_version: int
    pending: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=3)
    purchase_quantity: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=3
    )


class ManualShopping(Input):
    ingredient: str = Field(min_length=1, max_length=100)
    specification: str = Field(default="", max_length=100)
    unit: str = Field(min_length=1, max_length=30)
    pending: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class MealRecordInput(Input):
    day: date
    slot: Literal["BREAKFAST", "LUNCH", "DINNER", "SNACK"]
    description: str = Field(min_length=1, max_length=400)
    source: Literal["HOME_COOKED", "EATING_OUT", "TAKEAWAY", "OTHER"]
    plan_id: str | None = None
    notes: str = Field(default="", max_length=400)


class MealRecordPatch(MealRecordInput):
    expected_version: int
