"""
Hangout expiry — end-to-end check against the real Flask app and a throwaway SQLite database
(your MySQL data is never touched). Run from the backend folder:

    python tests/test_expiry.py

Covers: every new hangout gets an end time, ended hangouts vanish from discovery, legacy rows
with no end time still expire, joining/chatting on an ended hangout is refused, and /past works.
"""
import os, io, sys, tempfile
_db = os.path.join(tempfile.mkdtemp(), "juana_expiry_test.db")
os.environ["DATABASE_URL"] = "sqlite:///" + _db
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.hangout import Hangout, HangoutMember, Venue

app = create_app(); c = app.test_client()
results = []
def check(name, cond, extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name + (f"   [{extra}]" if extra else ""))

def register(email, name):
    r = c.post("/api/auth/register", json={"email": email, "password": "pw123456", "display_name": name, "birthdate": "1995-01-01"})
    assert r.status_code in (200, 201), r.get_json()
    return r.get_json()["token"], r.get_json()["user"]["id"]
H = lambda t: {"Authorization": f"Bearer {t}"}

with app.app_context():
    db.create_all()
    host_t, host_id = register("host@t.co", "Host")
    guest_t, guest_id = register("guest@t.co", "Guest")
    now = datetime.utcnow()
    iso = lambda dt: dt.isoformat() + "Z"
    venue = {"name": "Karura", "lat": -1.25, "lng": 36.83}

    # ---- creation always sets an end time ----
    r = c.post("/api/hangouts", headers=H(host_t), json={"title": "Default length", "venue": venue})
    a = r.get_json()
    ends = datetime.fromisoformat(a["ends_at"].rstrip("Z")); starts = datetime.fromisoformat(a["starts_at"].rstrip("Z"))
    check("create without duration -> 3h end time set (old clients still get one)", r.status_code == 201 and (ends - starts) == timedelta(minutes=180), a["ends_at"])
    check("new hangout is 'live'", a["status"] == "live")
    check("timestamps are UTC with Z", a["starts_at"].endswith("Z") and a["ends_at"].endswith("Z"))

    b = c.post("/api/hangouts", headers=H(host_t), json={"title": "Short", "duration_minutes": 30, "venue": venue}).get_json()
    check("duration_minutes=30 respected", (datetime.fromisoformat(b["ends_at"].rstrip("Z")) - datetime.fromisoformat(b["starts_at"].rstrip("Z"))) == timedelta(minutes=30))
    lo = c.post("/api/hangouts", headers=H(host_t), json={"title": "Tiny", "duration_minutes": 1}).get_json()
    hi = c.post("/api/hangouts", headers=H(host_t), json={"title": "Huge", "duration_minutes": 999999}).get_json()
    d = lambda h: datetime.fromisoformat(h["ends_at"].rstrip("Z")) - datetime.fromisoformat(h["starts_at"].rstrip("Z"))
    check("duration clamped to 15 min minimum", d(lo) == timedelta(minutes=15))
    check("duration clamped to 24h maximum", d(hi) == timedelta(hours=24))
    check("non-numeric duration rejected (400)", c.post("/api/hangouts", headers=H(host_t), json={"title": "x", "duration_minutes": "abc"}).status_code == 400)

    # scheduled in the future, sent the way the browser sends it (ISO with Z)
    up = c.post("/api/hangouts", headers=H(host_t), json={"title": "Tomorrow", "starts_at": iso(now + timedelta(hours=26)), "duration_minutes": 120}).get_json()
    check("scheduled hangout is 'upcoming'", up["status"] == "upcoming", up["status"])
    past = c.post("/api/hangouts", headers=H(host_t), json={"title": "Back then", "starts_at": iso(now - timedelta(hours=5)), "duration_minutes": 60})
    check("scheduling something that already ended is rejected (400)", past.status_code == 400)

    # ---- discovery ----
    ids = lambda: {h["id"] for h in c.get("/api/hangouts/nearby", headers=H(guest_t)).get_json()}
    check("live + upcoming hangouts are discoverable", {a["id"], b["id"], up["id"]} <= ids())

    # expire two of them by moving their end time into the past
    for hid in (a["id"], b["id"]):
        h = db.session.get(Hangout, hid); h.ends_at = now - timedelta(minutes=1); h.starts_at = now - timedelta(hours=3)
    db.session.commit()
    seen = ids()
    check("expired hangouts DISAPPEAR from discovery", a["id"] not in seen and b["id"] not in seen)
    check("hangouts still running stay visible", up["id"] in seen and lo["id"] in seen)

    # legacy rows: created before durations existed (ends_at NULL)
    def legacy(title, starts):
        v = Venue(name="L", lat=-1.2, lng=36.8); db.session.add(v); db.session.flush()
        h = Hangout(host_id=host_id, venue_id=v.id, title=title, starts_at=starts, ends_at=None)
        db.session.add(h); db.session.flush()
        db.session.add(HangoutMember(hangout_id=h.id, user_id=host_id, role="host", status="active")); db.session.commit(); return h.id
    old_id = legacy("Legacy old", now - timedelta(hours=4))
    recent_id = legacy("Legacy recent", now - timedelta(hours=1))
    seen = ids()
    check("legacy hangout (no end time) from 4h ago is treated as ended", old_id not in seen)
    check("legacy hangout from 1h ago is still live", recent_id in seen)

    # ---- detail still loads, but says ended ----
    r = c.get(f"/api/hangouts/{a['id']}", headers=H(host_t)).get_json()
    check("ended hangout detail still opens (status='ended')", r["status"] == "ended")

    # ---- joining & chatting ----
    r = c.post(f"/api/hangouts/{a['id']}/join", headers=H(guest_t), json={})
    check("joining an ended hangout is refused (410)", r.status_code == 410, str(r.get_json()))
    r = c.post(f"/api/hangouts/{up['id']}/join", headers=H(guest_t), json={})
    check("joining an upcoming hangout still works", r.status_code in (200, 201), str(r.status_code))
    r = c.post(f"/api/hangouts/{a['id']}/messages", headers=H(host_t), json={"body": "anyone?"})
    check("chat on an ended hangout is closed (410)", r.status_code == 410 and r.get_json()["error"] == "hangout_ended", str(r.get_json()))
    r = c.post(f"/api/hangouts/{lo['id']}/messages", headers=H(host_t), json={"body": "hello"})
    check("chat on a running hangout still works", r.status_code == 201, str(r.status_code))
    r = c.post(f"/api/hangouts/{a['id']}/messages/media", headers=H(host_t), data={"media": (io.BytesIO(b"x"), "p.png")}, content_type="multipart/form-data")
    check("media upload to an ended hangout is closed (410)", r.status_code == 410, str(r.status_code))
    r = c.get(f"/api/hangouts/{a['id']}/messages", headers=H(host_t))
    check("history of an ended hangout is still readable", r.status_code == 200)

    # ---- past hangouts list ----
    past_ids = {h["id"] for h in c.get("/api/hangouts/past", headers=H(host_t)).get_json()}
    check("host's /past lists their ended hangouts (incl. legacy)", {a["id"], b["id"], old_id} <= past_ids)
    check("/past does NOT list running hangouts", lo["id"] not in past_ids and recent_id not in past_ids and up["id"] not in past_ids)
    check("someone who never joined has an empty /past", c.get("/api/hangouts/past", headers=H(guest_t)).get_json() == [])

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
