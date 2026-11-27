"""
Paying to join a hangout — the failure modes that left people 'pending' with no prompt:
  * the prompt must be shaped like the proven pass-purchase one (short reference, plain description)
  * a SasaPay refusal must be an ERROR, not a silent 'pending' that can never confirm
  * payment makes you a member — a failed/ignored prompt must leave you retry-able, not 'already a member'
Real Flask app + throwaway SQLite; SasaPay stubbed. Run from the backend folder:

    python tests/test_paid_join.py
"""
import os, sys, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "juana_join_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.hangout import HangoutMember
from app.models.pass_model import Transaction
import app.routes.hangouts as hr
import app.utils.sasapay_client as sc

app = create_app(); c = app.test_client(); results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"})
    assert r.status_code in (200, 201), r.get_json()
    return r.get_json()["token"], r.get_json()["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}

calls = []
def fake_collection(**kw):
    calls.append(kw); return {"CheckoutRequestID": f"chk-{len(calls)}", "detail": "Prompt sent"}
hr.request_collection = fake_collection

with app.app_context():
    db.create_all()
    host_t, host_id = register("host@t.co", "Host"); g_t, g_id = register("guest@t.co", "Guest")
    z_t, z_id = register("zombie@t.co", "Zombie"); r_t, r_id = register("removed@t.co", "Removed")
    h = c.post("/api/hangouts", headers=H(host_t), json={"title": "Friday Trivia Night 🎯: teams of 4!", "entry_price_cents": 20000,
               "venue": {"name": "Fable", "lat": -1.2, "lng": 36.8}}).get_json()
    join = lambda tok, phone="254700000001": c.post(f"/api/hangouts/{h['id']}/join", headers=H(tok), json={"phone_number": phone})
    status = lambda tok: c.get(f"/api/hangouts/{h['id']}/join-status", headers=H(tok)).get_json()

    # ---- the prompt ----
    r = join(g_t)
    k = calls[-1]
    check("join sends a payment prompt (202)", r.status_code == 202 and len(calls) == 1, str(r.get_json()))
    check("reference is SHORT (was 81 chars) and the description is plain (was the host's free-text title)",
          len(k["account_reference"]) <= 14 and k["transaction_desc"] == "Juana hangout", f"{k['account_reference']!r} / {k['transaction_desc']!r}")
    check("amount sent is the host's price (KES 200)", k["amount"] == 200.0)

    # ---- payment first: NOT a member yet ----
    m = HangoutMember.query.filter_by(hangout_id=h["id"], user_id=g_id).first()
    check("before paying the guest is NOT a member (pending = unpaid)", m.status == "pending")
    check("so they can't read the chat for free", c.get(f"/api/hangouts/{h['id']}/messages", headers=H(g_t)).status_code == 403)
    check("join-status says pending", status(g_t) == {"payment": "pending", "is_member": False}, str(status(g_t)))

    # ---- retry handling ----
    r = join(g_t)
    check("an immediate second tap does NOT stack another prompt", r.status_code == 202 and r.get_json().get("already_sent") and len(calls) == 1)
    t = Transaction.query.filter_by(user_id=g_id, hangout_id=h["id"]).first(); t.created_at = datetime.utcnow() - timedelta(minutes=5); db.session.commit()
    r = join(g_t)
    check("after the cooldown a retry DOES send a fresh prompt (was: 'already a member', nothing sent)", r.status_code == 202 and len(calls) == 2, str(r.get_json()))

    # ---- a cancelled prompt ----
    c.post("/api/webhooks/sasapay/collection", json={"CheckoutRequestID": "chk-2", "ResultCode": 1032, "ResultDesc": "Request cancelled by user"})
    db.session.expire_all()
    check("cancelled payment -> join-status 'failed', still not a member", status(g_t) == {"payment": "failed", "is_member": False}, str(status(g_t)))
    r = join(g_t)
    check("after a failure the guest can try again immediately", r.status_code == 202 and len(calls) == 3)

    # ---- payment confirmed ----
    c.post("/api/webhooks/sasapay/collection", json={"CheckoutRequestID": "chk-3", "ResultCode": 0, "SasaPayTransactionCode": "SP9"})
    db.session.expire_all()
    check("confirmed payment -> completed AND member", status(g_t) == {"payment": "completed", "is_member": True}, str(status(g_t)))
    check("now they can read the chat", c.get(f"/api/hangouts/{h['id']}/messages", headers=H(g_t)).status_code == 200)
    check("paid members are told 'already a member' if they try again", join(g_t).status_code == 409)
    check("host can't 'join' their own hangout", join(host_t).status_code == 409)

    # ---- people the old flow let in unpaid ----
    db.session.add(HangoutMember(hangout_id=h["id"], user_id=z_id, status="active")); db.session.commit()
    r = join(z_t)
    check("someone the old flow let in UNPAID is now asked to pay (not 409'd)", r.status_code == 202, str(r.get_json()))

    # ---- removed people stay removed ----
    db.session.add(HangoutMember(hangout_id=h["id"], user_id=r_id, status="removed")); db.session.commit()
    check("a member the host removed can't pay their way back in (403)", join(r_t).status_code == 403)

    # ---- phone numbers the way people type them ----
    p_t, p_id = register("phone@t.co", "Phone")
    r = join(p_t, "0712 345 678")
    check("'0712 345 678' is understood and sent as 254712345678", r.status_code == 202 and calls[-1]["phone_number"] == "254712345678", calls[-1]["phone_number"])
    p2_t, _ = register("phone2@t.co", "Phone2")
    check("a nonsense number is refused up front (400), no prompt attempted", join(p2_t, "12345").status_code == 400)

    # ---- SasaPay says no ----
    def refusing(**kw): raise sc.SasaPayError("SasaPay did not accept the payment request: Invalid reference")
    hr.request_collection = refusing
    p3_t, p3_id = register("phone3@t.co", "Phone3")
    r = join(p3_t, "254700000009")
    check("a refused prompt is an ERROR (502) the guest can read", r.status_code == 502 and "Invalid reference" in r.get_json()["message"], str(r.get_json()))
    check("...and records nothing (no phantom member or pending payment)",
          HangoutMember.query.filter_by(hangout_id=h["id"], user_id=p3_id).first() is None
          and Transaction.query.filter_by(user_id=p3_id).first() is None)

    # ---- the client itself: HTTP 200 with a refusal body is NOT success ----
    class Resp:
        ok = True; status_code = 200; text = "{}"
        def __init__(self, body): self._b = body
        def json(self): return self._b
    sc._headers = lambda: {}
    real_post = sc.requests.post
    try:
        sc.requests.post = lambda *a, **k: Resp({"status": False, "detail": "Invalid phone number"})
        try: sc.request_collection(phone_number="254700000000", amount=50, network_code="63902", account_reference="X", transaction_desc="x", callback_url="http://x"); raised = None
        except sc.SasaPayError as e: raised = str(e)
        check("SasaPay replying 200 + a refusal raises (used to be recorded as a 'pending' payment forever)", raised and "Invalid phone number" in raised, str(raised))
        sc.requests.post = lambda *a, **k: Resp({"status": True, "CheckoutRequestID": "abc", "detail": "ok"})
        check("a real acceptance (has a CheckoutRequestID) still passes", sc.request_collection(phone_number="254700000000", amount=50, network_code="63902", account_reference="X", transaction_desc="x", callback_url="http://x")["CheckoutRequestID"] == "abc")
    finally:
        sc.requests.post = real_post

print(f"\n{sum(results)}/{len(results)} checks passed"); sys.exit(0 if all(results) else 1)
