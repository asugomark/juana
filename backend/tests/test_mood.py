"""
Nearby mood — what someone is open to while live. Real Flask app + throwaway SQLite.
Run from the backend folder:

    python tests/test_mood.py
"""
import os, sys, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "juana_mood_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.user import User

app = create_app(); c = app.test_client(); results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))
def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"}).get_json()
    return r["token"], r["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}
LL = {"lat": -1.2921, "lng": 36.8219}

with app.app_context():
    db.create_all()
    a_t, a_id = register("a@t.co", "Amani"); b_t, b_id = register("b@t.co", "Baraka"); c_t, c_id = register("c@t.co", "Chebet")
    nearby = lambda tok: {u["id"]: u for u in c.get("/api/nearby/users", headers=H(tok)).get_json()}

    moods = c.get("/api/nearby/moods", headers=H(a_t)).get_json()
    check("the app gets its mood list from the server: 5 fixed options with labels", [m["key"] for m in moods] == ["chat", "friends", "dating", "hangouts", "quiet"] and all(m["label"] and m["emoji"] for m in moods))

    # ---- going live with a mood ----
    r = c.post("/api/nearby/start", headers=H(a_t), json={**LL, "mood": "friends"})
    check("go live with a mood", r.status_code == 200 and r.get_json()["nearby_mood"] == "friends", str(r.get_json()))
    check("an unknown mood is refused, not stored", c.post("/api/nearby/start", headers=H(b_t), json={**LL, "mood": "creepy"}).status_code == 400 and User.query.get(b_id).nearby_visible is False)
    check("older app versions (no mood sent) still go live, just without a mood", c.post("/api/nearby/start", headers=H(b_t), json=LL).status_code == 200 and User.query.get(b_id).nearby_mood is None)
    check("'me' includes your own current mood", c.get("/api/auth/me", headers=H(a_t)).get_json()["nearby_mood"] == "friends")

    seen = nearby(b_t)
    check("people nearby see your mood on your card", seen[a_id]["mood"] == "friends", str(seen.get(a_id, {}).get("mood")))
    check("someone who chose no mood simply has none", nearby(a_t)[b_id]["mood"] is None)

    # ---- changing it while live ----
    r = c.patch("/api/nearby/mood", headers=H(a_t), json={"mood": "quiet"})
    check("change your mood while live, without turning Nearby off", r.status_code == 200 and nearby(b_t)[a_id]["mood"] == "quiet")
    check("changing to an unknown mood is refused", c.patch("/api/nearby/mood", headers=H(a_t), json={"mood": "x"}).status_code == 400)
    check("you can't set a mood when you aren't live (409)", c.patch("/api/nearby/mood", headers=H(c_t), json={"mood": "chat"}).status_code == 409)

    # ---- privacy ----
    prof = c.get(f"/api/users/{a_id}", headers=H(c_t)).get_json()
    check("a mood is NOT part of anyone's ordinary profile", "nearby_mood" not in prof and "mood" not in prof, str([k for k in prof if "mood" in k]))

    # ---- Hola: the heads-up / icebreaker ----
    ctx = c.get(f"/api/hola/{a_id}/context", headers=H(c_t)).get_json()
    check("before a first message you're told they're 'quiet' (a heads-up, not a block)", ctx == {"first_contact": True, "mood": "quiet"}, str(ctx))
    check("...and the heads-up doesn't stop you sending", c.post(f"/api/hola/{a_id}/messages", headers=H(c_t), json={"body": "hi, no pressure"}).status_code == 201)
    ctx = c.get(f"/api/hola/{a_id}/context", headers=H(c_t)).get_json()
    check("once you've talked, their mood is no longer shown to you", ctx == {"first_contact": False, "mood": None}, str(ctx))

    # ---- it never outlives the session ----
    c.post("/api/nearby/start", headers=H(c_t), json={**LL, "mood": "chat"})
    check("a live person's mood shows to a stranger opening a first-contact thread", c.get(f"/api/hola/{c_id}/context", headers=H(b_t)).get_json()["mood"] == "chat")
    c.post("/api/nearby/end", headers=H(c_t))
    check("ending Nearby clears the mood in the database (not just hides it)", User.query.get(c_id).nearby_mood is None and User.query.get(c_id).current_lat is None)
    check("...and it's gone from the Hola heads-up", c.get(f"/api/hola/{c_id}/context", headers=H(b_t)).get_json()["mood"] is None)

    u = User.query.get(a_id); u.nearby_expires_at = datetime.utcnow() - timedelta(minutes=1); db.session.commit()
    check("an EXPIRED session is no longer listed", a_id not in nearby(b_t))
    check("...and its mood isn't exposed through Hola either (needs a fresh stranger)", c.get(f"/api/hola/{a_id}/context", headers=H(b_t)).get_json()["mood"] is None)

    # ---- blocks reveal nothing ----
    c.post("/api/nearby/start", headers=H(c_t), json={**LL, "mood": "dating"})
    c.post(f"/api/users/{b_id}/block", headers=H(c_t))
    check("across a block, no mood is revealed", c.get(f"/api/hola/{c_id}/context", headers=H(b_t)).get_json()["mood"] is None)

print(f"\n{sum(results)}/{len(results)} checks passed"); sys.exit(0 if all(results) else 1)
