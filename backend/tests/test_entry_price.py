"""
Host-set entry price — end-to-end against the real Flask app and a throwaway SQLite database.
SasaPay is stubbed (it can't be called from a test); the payment confirmation is delivered to the
real webhook route exactly as SasaPay would. Run from the backend folder:

    python tests/test_entry_price.py
"""
import os, sys, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "juana_price_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import create_app
from app.extensions import db
from app.models.pass_model import Transaction

app = create_app(); c = app.test_client()
results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"})
    assert r.status_code in (200, 201), r.get_json()
    return r.get_json()["token"], r.get_json()["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}
V = {"name": "Karura", "lat": -1.25, "lng": 36.83}

# stand-in for SasaPay's STK push
import app.routes.hangouts as hangouts_routes
hangouts_routes.request_collection = lambda **kw: {"CheckoutRequestID": "chk-" + kw["account_reference"][-6:], "detail": "ok"}

with app.app_context():
    db.create_all()
    host_t, host_id = register("host@t.co", "Host")
    guest_t, guest_id = register("guest@t.co", "Guest")

    rules = c.get("/api/hangouts/pricing", headers=H(host_t)).get_json()
    check("pricing rules: min KES 50, max KES 5,000, host keeps 80%, included pass = day",
          rules == {"min_entry_cents": 5000, "max_entry_cents": 500000, "host_share": 0.8, "included_pass": "day"}, str(rules))

    free = c.post("/api/hangouts", headers=H(host_t), json={"title": "Free one", "venue": V}).get_json()
    check("free hangout: no price, not paid", free["price_cents"] is None and free["is_paid"] is False)

    paid = c.post("/api/hangouts", headers=H(host_t), json={"title": "Trivia", "entry_price_cents": 20000, "venue": V})
    paid_j = paid.get_json()
    check("host-set price KES 200 is stored and shown", paid.status_code == 201 and paid_j["price_cents"] == 20000 and paid_j["is_paid"] is True, str(paid_j.get("price_cents")))
    check("a host-priced hangout includes a day pass", paid_j["pass_tier"] == "day")

    check("below the floor (KES 49.99) is rejected", c.post("/api/hangouts", headers=H(host_t), json={"title": "x", "entry_price_cents": 4999, "venue": V}).status_code == 400)
    check("above the cap (KES 5,000.01) is rejected", c.post("/api/hangouts", headers=H(host_t), json={"title": "x", "entry_price_cents": 500001, "venue": V}).status_code == 400)
    check("non-numeric price is rejected", c.post("/api/hangouts", headers=H(host_t), json={"title": "x", "entry_price_cents": "abc", "venue": V}).status_code == 400)
    edge_lo = c.post("/api/hangouts", headers=H(host_t), json={"title": "min", "entry_price_cents": 5000, "venue": V})
    edge_hi = c.post("/api/hangouts", headers=H(host_t), json={"title": "max", "entry_price_cents": 500000, "venue": V})
    check("exactly KES 50 and exactly KES 5,000 are allowed", edge_lo.status_code == 201 and edge_hi.status_code == 201)

    legacy = c.post("/api/hangouts", headers=H(host_t), json={"title": "Old client", "pass_tier": "week", "venue": V}).get_json()
    check("older app version sending only a tier still works, priced at the fixed tier price (KES 150)", legacy["price_cents"] == 15000 and legacy["pass_tier"] == "week")

    # ---- a guest joins the KES 200 hangout ----
    r = c.post(f"/api/hangouts/{paid_j['id']}/join", headers=H(guest_t), json={"phone_number": "254700000000"})
    check("joining asks for payment (202 pending)", r.status_code == 202, str(r.get_json()))
    txn = Transaction.query.filter_by(user_id=guest_id, hangout_id=paid_j["id"]).first()
    check("the charge is the HOST's price (KES 200), attributed to the host", txn.amount_cents == 20000 and txn.host_id == host_id and txn.status == "pending", f"{txn.amount_cents} {txn.status}")
    check("no pass or earnings until payment is confirmed",
          c.get("/api/passes/status", headers=H(guest_t)).get_json().get("has_active_pass") in (False, None)
          and c.get("/api/earnings/summary", headers=H(host_t)).get_json()["lifetime_earned_cents"] == 0)

    # ---- SasaPay confirms the payment ----
    r = c.post("/api/webhooks/sasapay/collection", json={"CheckoutRequestID": txn.checkout_request_id, "ResultCode": 0, "SasaPayTransactionCode": "SP123"})
    db.session.expire_all()
    txn = Transaction.query.get(txn.id)
    check("payment confirmation completes the transaction", r.status_code == 200 and txn.status == "completed")
    ps = c.get("/api/passes/status", headers=H(guest_t)).get_json()
    check("guest now has the included messaging pass", ps.get("has_active_pass") is True, str(ps))
    s = c.get("/api/earnings/summary", headers=H(host_t)).get_json()
    check("host earns 80% of KES 200 = KES 160, available to withdraw", s["lifetime_earned_cents"] == 16000 and s["available_cents"] == 16000, str(s))
    byh = c.get("/api/earnings/by-hangout", headers=H(host_t)).get_json()
    row = next((x for x in byh if x["hangout_id"] == paid_j["id"]), None)
    check("earnings-by-hangout shows the price and the host's 80%", row and row["price_cents"] == 20000 and row["net_cents"] == 16000, str(row))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
