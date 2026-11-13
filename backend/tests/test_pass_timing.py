"""
Included-pass timing — a guest who pays to join a SCHEDULED hangout must be able to chat when it
actually happens (the pass used to start at payment and expire before the event).
Real Flask app + throwaway SQLite; SasaPay stubbed. Run from the backend folder:

    python tests/test_pass_timing.py
"""
import os, sys, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "juana_pass_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.hangout import Hangout
from app.models.pass_model import Transaction, MessagingPass
from app.utils.passes import grant_pass

app = create_app(); c = app.test_client(); results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"})
    assert r.status_code in (200, 201), r.get_json()
    return r.get_json()["token"], r.get_json()["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}
import app.routes.hangouts as hr
hr.request_collection = lambda **kw: {"CheckoutRequestID": "chk-" + kw["account_reference"][-6:]}

with app.app_context():
    db.create_all()
    host_t, host_id = register("host@t.co", "Host"); guest_t, guest_id = register("guest@t.co", "Guest")
    User.query.get(guest_id).newbie_messages_used = 10; db.session.commit()      # no free messages left: only a pass counts
    now = datetime.utcnow()

    h = c.post("/api/hangouts", headers=H(host_t), json={
        "title": "Saturday Trivia", "entry_price_cents": 20000, "duration_minutes": 120,
        "starts_at": (now + timedelta(hours=30)).isoformat() + "Z", "venue": {"name": "Fable", "lat": -1.2, "lng": 36.8}}).get_json()
    c.post(f"/api/hangouts/{h['id']}/join", headers=H(guest_t), json={"phone_number": "254700000000"})
    txn = Transaction.query.filter_by(user_id=guest_id, hangout_id=h["id"]).first()
    c.post("/api/webhooks/sasapay/collection", json={"CheckoutRequestID": txn.checkout_request_id, "ResultCode": 0, "SasaPayTransactionCode": "SP1"})
    db.session.expire_all()

    hang = Hangout.query.get(h["id"]); p = MessagingPass.query.filter_by(user_id=guest_id).first()
    check("guest paid for a hangout 30h away and received a pass", p is not None and p.source == "hangout_join")
    check("the pass STARTS when the hangout starts (not at payment)", p.starts_at == hang.starts_at, f"{p.starts_at} vs {hang.starts_at}")
    check("and lasts a full 24h from then", p.expires_at - p.starts_at == timedelta(days=1))

    st = c.get("/api/passes/status", headers=H(guest_t)).get_json()
    check("status: not active yet, but says when it starts", st["has_active_pass"] is False and st["upcoming_pass_starts_at"] == hang.starts_at.isoformat() + "Z", str(st))

    r = c.post(f"/api/hangouts/{h['id']}/messages", headers=H(guest_t), json={"body": "early!"})
    j = r.get_json()
    check("before the hangout: blocked, and the reply carries the start time (so the app won't sell another pass)",
          r.status_code == 402 and j["pass_starts_at"] == hang.starts_at.isoformat() + "Z" and "hasn't started" in j["message"], str(j))

    # time passes: the hangout starts
    p = MessagingPass.query.filter_by(user_id=guest_id).first()
    p.starts_at = now - timedelta(minutes=1); p.expires_at = now + timedelta(hours=23, minutes=59); db.session.commit()
    r = c.post(f"/api/hangouts/{h['id']}/messages", headers=H(guest_t), json={"body": "we're here"})
    check("once the hangout starts the guest can chat", r.status_code == 201, str(r.status_code))
    check("status flips to active, nothing upcoming", c.get("/api/passes/status", headers=H(guest_t)).get_json() == {"has_active_pass": True, "upcoming_pass_starts_at": None})

    # 24h after the hangout started: window over
    p = MessagingPass.query.filter_by(user_id=guest_id).first()
    p.starts_at = now - timedelta(days=1, minutes=5); p.expires_at = now - timedelta(minutes=5); db.session.commit()
    r = c.post(f"/api/hangouts/{h['id']}/messages", headers=H(guest_t), json={"body": "still here?"})
    check("after the 24h window: blocked again, plain 'get a pass' (nothing upcoming)", r.status_code == 402 and r.get_json()["pass_starts_at"] is None and "Get a pass" in r.get_json()["message"], str(r.get_json()))

    # a monthly pass holder with a future included pass keeps chatting
    grant_pass(guest_id, "month", source="purchase")
    grant_pass(guest_id, "day", source="hangout_join", starts_at=now + timedelta(days=3)); db.session.commit()
    r = c.post(f"/api/hangouts/{h['id']}/messages", headers=H(guest_t), json={"body": "monthly"})
    check("a monthly pass holder keeps chatting (a future pass doesn't interfere)", r.status_code == 201, str(r.status_code))

print(f"\n{sum(results)}/{len(results)} checks passed"); sys.exit(0 if all(results) else 1)
