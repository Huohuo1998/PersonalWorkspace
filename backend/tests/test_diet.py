from decimal import Decimal
from uuid import uuid4
import pytest
from conftest import post, new_client


def recipe(client, ingredients, name="鸡蛋餐"):
    r = post(
        client,
        "/diet/recipes",
        {
            "name": name,
            "steps": "按真实做法烹饪",
            "servings": "1",
            "ingredients": ingredients,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def ing(name="鸡蛋", qty="2", unit="个", spec="普通鸡蛋"):
    return {"ingredient": name, "quantity": qty, "unit": unit, "specification": spec}


def plan(client, recipe_id, servings="1", day="2026-10-13", slot="LUNCH", version=None):
    r = client.put(
        "/api/v1/diet/meal-plans",
        json={
            "day": day,
            "slot": slot,
            "recipe_id": recipe_id,
            "servings": servings,
            "expected_version": version,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def shopping(client):
    r = post(client, "/diet/shopping-lists", {"week": "2026-10-12"})
    assert r.status_code == 201, r.text
    return r.json()


def diff(client, id):
    return post(
        client, "/diet/shopping-lists/" + id + "/reconciliation-preview", {}
    ).json()


def apply(client, id, d, key=None):
    return post(
        client,
        "/diet/shopping-lists/" + id + "/reconciliation-apply",
        {"diff_hash": d["diff_hash"], "expected_version": d["expected_version"]},
        key,
    )


def get(client):
    return client.get("/api/v1/diet/shopping-lists?week=2026-10-12").json()


def patch(client, lst, item, **args):
    r = client.patch(
        "/api/v1/diet/shopping-lists/" + lst + "/items/" + item["id"],
        json={"expected_version": item["version"], **args},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_weight_conversion_compatible_only(client):
    r = recipe(
        client,
        [
            ing("番茄", "1", "kg", ""),
            ing("番茄", "500", "g", ""),
            ing("番茄", "2", "个", "中等番茄"),
            ing("水", "1", "L", ""),
            ing("水", "200", "ml", ""),
        ],
    )
    plan(client, r["id"])
    s = shopping(client)
    items = s["items"]
    assert len(items) == 3
    assert Decimal(next(i for i in items if i["unit"] == "g")["required"]) == 1500
    assert Decimal(next(i for i in items if i["unit"] == "ml")["required"]) == 1200
    assert Decimal(next(i for i in items if i["unit"] == "个")["required"]) == 2


@pytest.mark.parametrize(
    "ingredient",
    [ing("盐", None, "适量", ""), ing("米", "1", "袋", ""), ing("鸡蛋", "2", "个", "")],
)
def test_unknown_units_are_uncertain_and_not_guessed(client, ingredient):
    r = recipe(client, [ingredient])
    plan(client, r["id"])
    s = shopping(client)
    assert s["items"][0]["uncertain"] is True
    assert Decimal(s["items"][0]["pending"]) == 0
    d = diff(client, s["list"]["id"])
    assert d["items"][0]["protected"] is True


def test_multiround_delta_purchased_plus_pending_and_idempotency(client):
    r = recipe(client, [ing()])
    p = plan(client, r["id"])
    s = shopping(client)
    lst = s["list"]["id"]
    i = s["items"][0]
    patch(client, lst, i, purchase_quantity="2")
    p = plan(client, r["id"], "2", version=p["version"])  # needs 4, bought 2
    d = diff(client, lst)
    assert Decimal(d["items"][0]["extra"]) == 2
    k = str(uuid4())
    a = apply(client, lst, d, k)
    assert a.status_code == 200
    assert apply(client, lst, d, k).json() == a.json()
    p = plan(
        client, r["id"], "2.5", version=p["version"]
    )  # needs 5, bought 2, pending 2
    d = diff(client, lst)
    assert Decimal(d["items"][0]["extra"]) == 1
    assert apply(client, lst, d).status_code == 200
    data = get(client)
    assert len(data["items"]) == 1
    assert (
        Decimal(data["items"][0]["purchased"]) == 2
        and Decimal(data["items"][0]["pending"]) == 3
    )
    assert Decimal(diff(client, lst)["items"][0]["extra"]) == 0
    assert client.get("/api/v1/finance/transactions").json() == []


def test_decrease_preserves_purchased_and_manual_override(client):
    r = recipe(client, [ing(qty="4")])
    p = plan(client, r["id"])
    s = shopping(client)
    lst = s["list"]["id"]
    i = s["items"][0]
    i = patch(client, lst, i, purchase_quantity="2")
    i = patch(client, lst, i, pending="5")
    p = plan(client, r["id"], "0.25", version=p["version"])
    d = diff(client, lst)
    assert d["items"][0]["manual_override"]
    assert apply(client, lst, d).status_code == 200
    i = get(client)["items"][0]
    assert Decimal(i["purchased"]) == 2 and Decimal(i["pending"]) == 5
    assert Decimal(diff(client, lst)["items"][0]["excess_purchased"]) == 1


def test_decrease_auto_pending_not_negative(client):
    r = recipe(client, [ing(qty="4")])
    p = plan(client, r["id"])
    s = shopping(client)
    lst = s["list"]["id"]
    patch(client, lst, s["items"][0], purchase_quantity="4")
    plan(client, r["id"], "0.5", version=p["version"])
    d = diff(client, lst)
    assert apply(client, lst, d).status_code == 200
    i = get(client)["items"][0]
    assert Decimal(i["purchased"]) == 4 and Decimal(i["pending"]) == 0


def test_stale_reconciliation_rejected_when_purchase_changes(client):
    r = recipe(client, [ing()])
    plan(client, r["id"])
    s = shopping(client)
    lst = s["list"]["id"]
    d = diff(client, lst)
    patch(client, lst, s["items"][0], purchase_quantity="1")
    assert apply(client, lst, d).status_code == 409


def test_stale_reconciliation_rejected_when_recipe_changes(client):
    r = recipe(client, [ing()])
    plan(client, r["id"])
    s = shopping(client)
    lst = s["list"]["id"]
    d = diff(client, lst)
    p = {
        k: r[k]
        for k in [
            "name",
            "minutes",
            "servings",
            "ingredients",
            "steps",
            "tags",
            "allergen_note",
            "illustration",
        ]
    }
    p["expected_version"] = r["version"]
    p["ingredients"] = [ing(qty="3")]
    assert client.put("/api/v1/diet/recipes/" + r["id"], json=p).status_code == 200
    assert apply(client, lst, d).status_code == 409
    assert Decimal(get(client)["items"][0]["pending"]) == 2


def test_plan_actual_separation_home_cooked_and_source_delete(client):
    r = recipe(client, [ing()])
    p = plan(client, r["id"])
    assert client.get("/api/v1/diet/meal-records").json() == []
    assert (
        client.get("/api/v1/dashboard?day=2026-10-13").json()["diet"]["home_cooked"]
        == 0
    )
    record = post(
        client,
        "/diet/meal-records",
        {
            "day": "2026-10-13",
            "slot": "LUNCH",
            "description": "实际外食面条",
            "source": "EATING_OUT",
            "plan_id": p["id"],
        },
    )
    assert record.status_code == 201
    post(
        client,
        "/diet/meal-records",
        {
            "day": "2026-10-13",
            "slot": "DINNER",
            "description": "自己做饭",
            "source": "HOME_COOKED",
        },
    )
    assert (
        client.get("/api/v1/dashboard?day=2026-10-13").json()["diet"]["home_cooked"]
        == 1
    )
    assert (
        client.delete(
            "/api/v1/diet/meal-plans/" + p["id"] + "?expected_version=1"
        ).status_code
        == 200
    )
    assert len(client.get("/api/v1/diet/meal-records").json()) == 2


def test_recipe_unknown_allergens_filter_and_isolation(client):
    r = recipe(client, [ing()])
    assert "未确认" in r["allergen_note"]
    assert client.get("/api/v1/diet/recipes?exclude=鸡蛋").json() == []
    other = new_client()
    assert (
        client.put(
            "/api/v1/diet/meal-plans",
            json={"day": "2026-10-13", "slot": "LUNCH", "recipe_id": "missing"},
        ).status_code
        == 404
    )
    assert plan(client, r["id"])
    assert (
        other.put(
            "/api/v1/diet/meal-plans",
            json={"day": "2026-10-13", "slot": "LUNCH", "recipe_id": r["id"]},
        ).status_code
        == 404
    )


def test_manual_duplicate_preserves_item_identity(client):
    s = shopping(client)
    lst = s["list"]["id"]
    p = {
        "ingredient": "鸡蛋",
        "specification": "普通鸡蛋",
        "unit": "个",
        "pending": "2",
    }
    a = post(client, "/diet/shopping-lists/" + lst + "/items", p).json()
    patch(client, lst, a, purchase_quantity="1")
    b = post(client, "/diet/shopping-lists/" + lst + "/items", p).json()
    assert (
        b["id"] == a["id"]
        and Decimal(b["purchased"]) == 1
        and Decimal(b["pending"]) == 3
    )
