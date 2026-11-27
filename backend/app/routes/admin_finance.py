from datetime import datetime, timedelta, date
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import Hangout
from app.models.pass_model import Transaction
from app.models.expense import Expense
from app.utils.admin import admin_required

admin_finance_bp = Blueprint("admin_finance", __name__, url_prefix="/api/admin/finance")

COLLECTION_TYPES = ("pass_purchase", "hangout_join_paid")


def _parse_date(value, default):
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


# ---------- Collections ----------

@admin_finance_bp.get("/collections")
@admin_required
def collections():
    """
    Money coming in — pass purchases and paid-hangout joins, platform-wide.
    Deliberately NOT using a Transaction.user/.host relationship() attribute —
    Transaction has two separate FK columns to users.id (user_id, host_id), and
    adding an ambiguous relationship() there is exactly the bug that broke
    login earlier this build (see HangoutMember.user fix). Manual lookups here
    avoid reintroducing that same class of bug.
    """
    status = request.args.get("status")
    limit = min(request.args.get("limit", 100, type=int), 500)

    query = Transaction.query.filter(Transaction.type.in_(COLLECTION_TYPES))
    if status:
        query = query.filter(Transaction.status == status)
    txns = query.order_by(Transaction.created_at.desc()).limit(limit).all()

    results = []
    for t in txns:
        payer = User.query.get(t.user_id)
        hangout = Hangout.query.get(t.hangout_id) if t.hangout_id else None
        results.append({
            "id": t.id,
            "type": t.type,
            "amount_cents": t.amount_cents,
            "status": t.status,
            "payer": payer.to_public_dict() if payer else None,
            "hangout_title": hangout.title if hangout else None,
            "checkout_request_id": t.checkout_request_id,
            "sasapay_transaction_code": t.sasapay_transaction_code,
            "created_at": t.created_at.isoformat(),
        })
    return jsonify(results)


# ---------- Cashflow ----------

@admin_finance_bp.get("/cashflow")
@admin_required
def cashflow():
    """
    Daily buckets over the requested window: money in (completed collections)
    vs money out (completed payouts — stored as negative amount_cents already,
    so this takes the absolute value). Only COMPLETED transactions count as
    real cashflow — pending/failed haven't actually moved money yet.
    """
    days = min(request.args.get("days", 30, type=int), 365)
    start = date.today() - timedelta(days=days - 1)

    collections_txns = Transaction.query.filter(
        Transaction.type.in_(COLLECTION_TYPES),
        Transaction.status == "completed",
        Transaction.created_at >= datetime.combine(start, datetime.min.time()),
    ).all()
    payout_txns = Transaction.query.filter(
        Transaction.type == "payout",
        Transaction.status == "completed",
        Transaction.created_at >= datetime.combine(start, datetime.min.time()),
    ).all()

    buckets = {}
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        buckets[d] = {"date": d, "in_cents": 0, "out_cents": 0}

    for t in collections_txns:
        d = t.created_at.date().isoformat()
        if d in buckets:
            buckets[d]["in_cents"] += t.amount_cents
    for t in payout_txns:
        d = t.created_at.date().isoformat()
        if d in buckets:
            buckets[d]["out_cents"] += abs(t.amount_cents)

    series = list(buckets.values())
    for row in series:
        row["net_cents"] = row["in_cents"] - row["out_cents"]

    return jsonify({
        "series": series,
        "totals": {
            "in_cents": sum(r["in_cents"] for r in series),
            "out_cents": sum(r["out_cents"] for r in series),
            "net_cents": sum(r["net_cents"] for r in series),
        },
    })


# ---------- Income statement ----------

@admin_finance_bp.get("/income-statement")
@admin_required
def income_statement():
    """
    A real income statement, not a relabeled revenue report — the distinction
    that matters here is between REVENUE (what the platform actually earns)
    and PASS-THROUGH (money collected on a host's behalf that the platform
    never owned in the first place):

      Gross Collections          <- everything collected via SasaPay
      Less: Host Payouts Owed    <- the ~80% of paid-hangout joins that belongs
                                     to hosts, not Juana — a liability/pass-through,
                                     never counted as platform revenue
      = Platform Revenue         <- the platform fee + 100% of standalone pass
                                     purchases (those aren't tied to any host)
      Less: Operating Expenses   <- from the Expense table (see models/expense.py) —
                                     manually logged, since nothing in this system
                                     generates real cost data automatically
      = Net Income
    """
    fee_pct = current_app.config["PLATFORM_FEE_PCT"]
    today = date.today()
    start = _parse_date(request.args.get("start"), today.replace(day=1))
    end = _parse_date(request.args.get("end"), today)

    range_start = datetime.combine(start, datetime.min.time())
    range_end = datetime.combine(end, datetime.max.time())

    completed = Transaction.query.filter(
        Transaction.type.in_(COLLECTION_TYPES),
        Transaction.status == "completed",
        Transaction.created_at >= range_start,
        Transaction.created_at <= range_end,
    ).all()

    pass_purchase_cents = sum(t.amount_cents for t in completed if t.type == "pass_purchase")
    hangout_join_cents = sum(t.amount_cents for t in completed if t.type == "hangout_join_paid")

    gross_collections_cents = pass_purchase_cents + hangout_join_cents
    host_payouts_owed_cents = int(hangout_join_cents * (1 - fee_pct))
    platform_fee_revenue_cents = hangout_join_cents - host_payouts_owed_cents
    platform_revenue_cents = pass_purchase_cents + platform_fee_revenue_cents

    expenses = Expense.query.filter(Expense.incurred_at >= start, Expense.incurred_at <= end).all()
    expenses_by_category = {}
    for e in expenses:
        expenses_by_category[e.category] = expenses_by_category.get(e.category, 0) + e.amount_cents
    total_expenses_cents = sum(expenses_by_category.values())

    net_income_cents = platform_revenue_cents - total_expenses_cents

    return jsonify({
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "gross_collections_cents": gross_collections_cents,
        "pass_purchase_cents": pass_purchase_cents,
        "hangout_join_cents": hangout_join_cents,
        "host_payouts_owed_cents": host_payouts_owed_cents,
        "platform_revenue_cents": platform_revenue_cents,
        "expenses_by_category_cents": expenses_by_category,
        "total_expenses_cents": total_expenses_cents,
        "net_income_cents": net_income_cents,
        "platform_fee_pct": fee_pct,
    })


# ---------- Expenses (feed the income statement above) ----------

@admin_finance_bp.get("/expenses")
@admin_required
def list_expenses():
    today = date.today()
    start = _parse_date(request.args.get("start"), today.replace(day=1))
    end = _parse_date(request.args.get("end"), today)
    expenses = (
        Expense.query.filter(Expense.incurred_at >= start, Expense.incurred_at <= end)
        .order_by(Expense.incurred_at.desc())
        .all()
    )
    return jsonify([e.to_dict() for e in expenses])


@admin_finance_bp.post("/expenses")
@admin_required
def create_expense():
    data = request.get_json() or {}
    admin_id = get_jwt_identity()

    valid_categories = {"infrastructure", "payment_processing_fees", "marketing", "salaries", "other"}
    category = data.get("category")
    description = (data.get("description") or "").strip()
    amount_cents = data.get("amount_cents")
    incurred_at_raw = data.get("incurred_at")

    if category not in valid_categories:
        return jsonify({"error": f"category must be one of: {', '.join(sorted(valid_categories))}"}), 400
    if not description:
        return jsonify({"error": "description is required"}), 400
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        return jsonify({"error": "amount_cents must be a positive integer"}), 400

    incurred_at = _parse_date(incurred_at_raw, date.today())

    expense = Expense(
        category=category, description=description[:255],
        amount_cents=amount_cents, incurred_at=incurred_at, created_by=admin_id,
    )
    db.session.add(expense)
    db.session.commit()
    return jsonify(expense.to_dict()), 201


@admin_finance_bp.delete("/expenses/<expense_id>")
@admin_required
def delete_expense(expense_id):
    expense = Expense.query.get_or_404(expense_id)
    db.session.delete(expense)
    db.session.commit()
    return jsonify({"status": "deleted"})
