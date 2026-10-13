from decimal import Decimal
from sqlalchemy import select, func
from .models import (
    Account,
    Movement,
    Transaction,
    Budget,
    SavingsGoal,
    ShoppingList,
    Task,
)
from .common import owned, rows, serialize, version, audit
from .security import fail

ZERO = Decimal("0.00")


def balance(db, account):
    return (
        db.scalar(
            select(func.coalesce(func.sum(Movement.delta), 0)).where(
                Movement.account_id == account.id
            )
        )
        or ZERO
    )


def account_data(db, account):
    b = balance(db, account)
    return {
        **serialize(account),
        "balance": format(b, ".2f"),
        "debt": format(max(b, ZERO), ".2f") if account.type == "CREDIT" else None,
        "overpayment": format(max(-b, ZERO), ".2f")
        if account.type == "CREDIT"
        else None,
    }


def impact(db, user, p):
    ids = {p.account_id}
    if p.destination_id:
        ids.add(p.destination_id)
    accounts = {id: owned(db, Account, id, user, True) for id in sorted(ids)}
    for a in accounts.values():
        if not a.active:
            fail("ACCOUNT_INACTIVE", "账户已归档")
        version(a, p.expected_versions.get(a.id))
    a = accounts[p.account_id]
    dest = accounts.get(p.destination_id)
    delta = {}
    warnings = []
    t = p.type
    original = None
    if t == "EXPENSE":
        delta[a.id] = p.amount if a.type == "CREDIT" else -p.amount
    elif t == "INCOME":
        if a.type != "ASSET":
            fail("ASSET_REQUIRED", "收入应记录到资产账户")
        delta[a.id] = p.amount
    elif t in ("TRANSFER", "REPAYMENT", "CREDIT_WITHDRAWAL"):
        if not dest or a.id == dest.id:
            fail("DESTINATION_REQUIRED", "请选择不同的实际到账账户")
        if t == "TRANSFER" and (a.type != "ASSET" or dest.type != "ASSET"):
            fail("ASSET_REQUIRED", "转账仅用于两个资产账户")
        if t == "REPAYMENT" and (a.type != "ASSET" or dest.type != "CREDIT"):
            fail("REPAYMENT_ACCOUNTS", "还款需要资产账户和信用账户")
        if t == "CREDIT_WITHDRAWAL":
            if (
                a.type != "CREDIT"
                or dest.type != "ASSET"
                or balance(db, a) + p.amount > 0
            ):
                fail("OVERPAYMENT_REQUIRED", "仅可转出信用卡已有的溢缴款")
            delta = {a.id: p.amount, dest.id: p.amount}
        else:
            delta = {
                a.id: -p.amount,
                dest.id: -p.amount if dest.type == "CREDIT" else p.amount,
            }
    elif t == "REFUND":
        if not p.original_id:
            fail("ORIGINAL_REQUIRED", "退款必须关联原消费")
        original = owned(db, Transaction, p.original_id, user, True)
        if original.type != "EXPENSE":
            fail("EXPENSE_REQUIRED", "只能对原消费退款")
        refunded = db.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.user_id == user.id,
                Transaction.original_id == original.id,
                Transaction.type == "REFUND",
            )
        )
        if p.amount > original.amount - refunded:
            fail(
                "REFUND_CAP",
                "退款超过剩余可退金额，请重新核对",
                409,
                {"remaining": serialize(original.amount - refunded)},
            )
        if p.occurred_on < original.occurred_on:
            fail("REFUND_DATE", "退款不能早于原消费日期")
        delta[a.id] = -p.amount if a.type == "CREDIT" else p.amount
    elif t == "ADJUSTMENT":
        if not p.description:
            fail("REASON_REQUIRED", "余额校正必须填写原因")
        delta[a.id] = p.amount if p.adjustment_direction == "INCREASE" else -p.amount
    effects = []
    for id, change in delta.items():
        before = balance(db, accounts[id])
        after = before + change
        if accounts[id].type == "ASSET" and after < 0:
            warnings.append("资产账面余额将为负，请确认这笔交易真实发生；不会自动配平")
        if accounts[id].type == "CREDIT" and after < 0 and change < 0:
            warnings.append("信用账户将有溢缴款；不会计入额外收入或支出")
        effects.append(
            {
                "account_id": id,
                "name": accounts[id].name,
                "type": accounts[id].type,
                "before": serialize(before),
                "delta": serialize(change),
                "after": serialize(after),
                "version": accounts[id].version,
            }
        )
    if p.source_kind:
        if not p.source_id:
            fail("SOURCE_REQUIRED", "缺少来源记录")
        owned(
            db,
            ShoppingList if p.source_kind == "shopping_list" else Task,
            p.source_id,
            user,
        )
    return (
        accounts,
        delta,
        original,
        {
            "effects": effects,
            "warnings": warnings,
            "category": original.category if original else p.category,
            "original_account_id": original.account_id if original else None,
        },
    )


def post_transaction(db, user, p):
    accounts, delta, original, preview = impact(db, user, p)
    if preview["warnings"] and not p.confirmed_warnings:
        fail("REVIEW_REQUIRED", "请明确核对负余额或溢缴款提示", 409, preview)
    tx = Transaction(
        user_id=user.id,
        type=p.type,
        amount=p.amount,
        occurred_on=p.occurred_on,
        category=preview["category"],
        description=p.description,
        account_id=p.account_id,
        destination_id=p.destination_id,
        original_id=p.original_id,
        source_kind=p.source_kind,
        source_id=p.source_id,
    )
    db.add(tx)
    db.flush()
    for id, change in delta.items():
        db.add(Movement(transaction_id=tx.id, account_id=id, delta=change))
        accounts[id].version += 1
    audit(
        db,
        user,
        "FINANCE_" + p.type,
        tx.id,
        p.description if p.type == "ADJUSTMENT" else "",
    )
    db.flush()
    return {
        "transaction": serialize(tx),
        "accounts": [account_data(db, a) for a in accounts.values()],
    }


def summary(db, user, month):
    accounts = db.scalars(rows(db, Account, user)).all()
    transactions = db.scalars(
        rows(db, Transaction, user).where(
            func.to_char(Transaction.occurred_on, "YYYY-MM") == month
        )
    ).all()
    assets = sum((balance(db, a) for a in accounts if a.type == "ASSET"), ZERO)
    credits = [balance(db, a) for a in accounts if a.type == "CREDIT"]
    debt = sum((max(c, ZERO) for c in credits), ZERO)
    overpayment = sum((max(-c, ZERO) for c in credits), ZERO)
    income = sum((t.amount for t in transactions if t.type == "INCOME"), ZERO)
    expense = sum(
        (
            t.amount if t.type == "EXPENSE" else -t.amount
            for t in transactions
            if t.type in ("EXPENSE", "REFUND")
        ),
        ZERO,
    )
    categories = {}
    for t in transactions:
        if t.type in ("EXPENSE", "REFUND"):
            categories[t.category] = categories.get(t.category, ZERO) + (
                t.amount if t.type == "EXPENSE" else -t.amount
            )
    budgets = db.scalars(rows(db, Budget, user).where(Budget.month == month)).all()
    return serialize(
        {
            "initialized": bool(accounts),
            "assets": assets if accounts else None,
            "debt": debt if accounts else None,
            "overpayment": overpayment if accounts else None,
            "net_assets": assets + overpayment - debt if accounts else None,
            "income": income,
            "expense": expense,
            "has_transactions": bool(transactions),
            "categories": categories,
            "budgets": [
                dict(
                    **serialize(b),
                    spent=serialize(
                        expense
                        if b.category == "总预算"
                        else categories.get(b.category, ZERO)
                    ),
                    remaining=serialize(
                        b.amount
                        - (
                            expense
                            if b.category == "总预算"
                            else categories.get(b.category, ZERO)
                        )
                    ),
                )
                for b in budgets
            ],
        }
    )
