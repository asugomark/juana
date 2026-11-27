"""
Joining a hangout from an invite link — the 'I tapped Join and nothing happened' case.
Real Flask app + throwaway SQLite. Run from the backend folder:

    python tests/test_invite_join.py
"""
import os, sys, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "juana_invite_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.hangout import HangoutMember
from app.models.pass_model import Transaction
import app.routes.hangouts as hr

app = create_app(); c = app.test_client(); results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"}).get_json()
    return r["token"], r["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}
V = {"name": "Karura", "lat": -1.25, "lng": 36.83}
prompts = []
hr.request_collection = lambda **kw: prompts.append(kw) or {"CheckoutRequestID": f"chk-{len(prompts)}"}

with app.app_context():
    db.create_all()
    host_t, host_id = register("host@t.co", "Host")
    new_t, new_id = register("new@t.co", "NewGuest")          # just signed up from the invite: NOT verified
    ver_t, ver_id = register("ver@t.co", "VerifiedGuest")
    u = User.query.get(ver_id); u.is_verified = True; db.session.commit()

    # exactly what the create form sends for "Invite only" when the host leaves verified-only ON
    strict = c.post("/api/hangouts", headers=H(host_t), json={"title": "Private braai", "visibility": "invite_only", "requires_approval": False, "verified_only": True, "venue": V}).get_json()
    pv = c.get(f"/api/hangouts/{strict['id']}/preview")
    check("the invite link's preview works without logging in and says it's verified-only", pv.status_code == 200 and pv.get_json()["verified_only"] is True and pv.get_json()["visibility"] == "invite_only")
    check("invite-only hangouts stay out of discovery", strict["id"] not in {x["id"] for x in c.get("/api/hangouts/nearby", headers=H(new_t)).get_json()})

    r = c.post(f"/api/hangouts/{strict['id']}/join", headers=H(new_t), json={})
    j = r.get_json()
    check("unverified invitee is refused (403) with a CODE the app can act on", r.status_code == 403 and j["error"] == "verification_required", str(j))
    check("...and a human-readable explanation (was one terse lowercase string)", "verified" in j["message"].lower() and "verify your identity" in j["message"], j["message"])
    check("a refused join doesn't leave a half-member behind", HangoutMember.query.filter_by(hangout_id=strict["id"], user_id=new_id).first() is None)

    r = c.post(f"/api/hangouts/{strict['id']}/join", headers=H(ver_t), json={"invited_by": host_id})
    check("a verified invitee joins by link", r.status_code == 200 and r.get_json()["status"] == "active", str(r.get_json()))
    check("...can read the chat, and the invite is credited to the host",
          c.get(f"/api/hangouts/{strict['id']}/messages", headers=H(ver_t)).status_code == 200
          and HangoutMember.query.filter_by(hangout_id=strict["id"], user_id=ver_id).first().invited_by_user_id == host_id)

    # host who trusts their guest list switches verified-only off
    open_inv = c.post("/api/hangouts", headers=H(host_t), json={"title": "Friends only", "visibility": "invite_only", "verified_only": False, "venue": V}).get_json()
    r = c.post(f"/api/hangouts/{open_inv['id']}/join", headers=H(new_t), json={})
    check("with verified-only OFF, an unverified invitee joins straight away", r.status_code == 200 and r.get_json()["status"] == "active", str(r.get_json()))
    check("...and can chat in the room", c.get(f"/api/hangouts/{open_inv['id']}/messages", headers=H(new_t)).status_code == 200)

    # a paid, verified-only hangout must refuse BEFORE asking for money
    paid = c.post("/api/hangouts", headers=H(host_t), json={"title": "Paid + verified", "entry_price_cents": 20000, "verified_only": True, "venue": V}).get_json()
    r = c.post(f"/api/hangouts/{paid['id']}/join", headers=H(new_t), json={"phone_number": "0712345678"})
    check("paid + verified-only: unverified guest is refused (403) before any payment prompt",
          r.status_code == 403 and r.get_json()["error"] == "verification_required" and prompts == [] and Transaction.query.filter_by(user_id=new_id).first() is None, str(r.get_json()))

print(f"\n{sum(results)}/{len(results)} checks passed"); sys.exit(0 if all(results) else 1)
