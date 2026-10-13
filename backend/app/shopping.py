from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from sqlalchemy import select
from .models import MealPlan, Recipe, ShoppingItem
from .common import rows, owned, serialize, fingerprint


def requirements(db, user, week):
    plans = db.scalars(
        rows(db, MealPlan, user)
        .where(MealPlan.day >= week, MealPlan.day < week + timedelta(days=7))
        .order_by(MealPlan.id)
    ).all()
    result = {}
    source = []
    notices = []
    for p in plans:
        source.append(serialize(p))
        if not p.recipe_id:
            notices.append(p.description + "：自由文本菜单，食材需人工核对")
            continue
        recipe = owned(db, Recipe, p.recipe_id, user)
        source.append(serialize(recipe))
        if not recipe.ingredients:
            notices.append(recipe.name + "：食材缺失，需人工核对")
        for ing in recipe.ingredients:
            unit = ing["unit"]
            factor = Decimal("1")
            spec = ing.get("specification", "")
            if unit == "kg":
                unit = "g"
                factor = Decimal("1000")
            elif unit == "L":
                unit = "ml"
                factor = Decimal("1000")
            uncertain = (
                ing["quantity"] is None
                or unit not in ("g", "ml", "个", "片", "只")
                or (unit in ("个", "片", "只") and not spec)
            )
            key = (ing["ingredient"], spec, unit)
            qty = (
                Decimal(ing["quantity"] or "0")
                * factor
                * Decimal(p.servings)
                / Decimal(recipe.servings)
            )
            if key not in result:
                result[key] = {
                    "ingredient": key[0],
                    "specification": spec,
                    "unit": unit,
                    "required": Decimal("0"),
                    "uncertain": uncertain,
                }
            result[key]["required"] += qty
            result[key]["uncertain"] |= uncertain
    return result, fingerprint(source), notices


def preview(db, user, lst):
    required, source_hash, notices = requirements(db, user, lst.week)
    items = db.scalars(
        rows(db, ShoppingItem, user)
        .where(ShoppingItem.list_id == lst.id)
        .order_by(ShoppingItem.id)
    ).all()
    by_key = {(i.ingredient, i.specification, i.unit): i for i in items}
    diffs = []
    for key in sorted(set(required) | set(by_key)):
        item = by_key.get(key)
        target = required.get(key) or {
            "ingredient": key[0],
            "specification": key[1],
            "unit": key[2],
            "required": Decimal("0"),
            "uncertain": item.uncertain if item else True,
        }
        n = target["required"]
        p = item.purchased if item else Decimal("0")
        u = item.pending if item else Decimal("0")
        manual = item.manual_override if item else False
        uncertain = target["uncertain"]
        suggested = u if manual or uncertain else max(Decimal("0"), n - p)
        diffs.append(
            {
                **target,
                "item_id": item.id if item else None,
                "purchased": p,
                "pending": u,
                "suggested_pending": suggested,
                "extra": max(Decimal("0"), suggested - u),
                "change": suggested - u,
                "manual_override": manual,
                "protected": manual or uncertain,
                "excess_purchased": max(Decimal("0"), p - n),
            }
        )
    data = {
        "list_id": lst.id,
        "expected_version": lst.version,
        "source_hash": source_hash,
        "changed": source_hash != lst.source_hash,
        "items": serialize(diffs),
        "notices": notices,
    }
    data["diff_hash"] = fingerprint({"data": data, "current": serialize(items)})
    return data


def apply(db, user, lst, data):
    for d in data["items"]:
        if d["item_id"]:
            item = owned(db, ShoppingItem, d["item_id"], user)
            item.required = Decimal(d["required"])
            if not d["protected"]:
                item.pending = Decimal(d["suggested_pending"])
            item.version += 1
        else:
            item = ShoppingItem(
                user_id=user.id,
                list_id=lst.id,
                ingredient=d["ingredient"],
                specification=d["specification"],
                unit=d["unit"],
                required=Decimal(d["required"]),
                pending=Decimal(d["suggested_pending"]),
                purchased=0,
                manual_override=False,
                uncertain=d["uncertain"],
            )
            db.add(item)
    lst.source_hash = data["source_hash"]
    lst.version += 1
    db.flush()
    return {
        "list": serialize(lst),
        "items": serialize(
            db.scalars(
                rows(db, ShoppingItem, user).where(ShoppingItem.list_id == lst.id)
            ).all()
        ),
    }
