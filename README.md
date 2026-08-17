# Juana — starter scaffold

Flask + MySQL backend, React (Vite) frontend. This is a working foundation, not a
finished product — see "What's stubbed" below before you show this to anyone else.

## Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # then fill in real values

mysql -u root -p -e "CREATE DATABASE juana CHARACTER SET utf8mb4;"

flask --app run db init         # first time only
flask --app run db migrate -m "initial schema"
flask --app run db upgrade

python run.py                   # runs on http://localhost:5000
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev                     # runs on http://localhost:5173, proxies /api to :5000
```

### Testing the PWA install prompt
The app is installable (manifest + service worker via `vite-plugin-pwa`). To see
the actual install prompt:
- **Desktop Chrome/Edge**: open http://localhost:5173, look for the install icon
  in the address bar (or Chrome menu → "Install Juana...")
- **Android Chrome**: visit the site, menu → "Add to Home Screen" / "Install app"
- **iOS Safari**: visit the site, Share button → "Add to Home Screen" — iOS ignores
  the manifest for this, it relies on the meta tags in `index.html` instead
- The install prompt sometimes won't fire on `localhost` in some browsers even
  with everything configured correctly — if it doesn't show up, deploy to a real
  HTTPS domain (or use `npm run build && npm run preview`) before assuming
  something's broken

## What's actually implemented

- Auth: register/login (JWT), password hashing (bcrypt), 18+ age check on signup
- Hangouts: create (free or paid, open/invite-only, capacity, verified-only, approval),
  nearby search (Haversine distance when lat/lng given, falls back to recent-open list
  otherwise), join (auto-grants matching pass for paid hangouts), leave, host-only remove
- Messaging: hangout group chat + Hola 1:1, both gated by the same pass-check, real-time
  delivery via Socket.IO, REST is the source of truth (socket just broadcasts after a
  successful DB write)
- Passes: day/week/month tiers, newbie free-message allowance, hard block on expiry
  (no grace period), platform-wide unlock regardless of source
- Earnings: per-host revenue summary, transaction ledger, withdraw endpoint gated on
  `kyc_status == 'approved'` (first withdrawal triggers the requirement, subsequent
  ones don't)
- Nearby: session-based visibility (start/end, auto-expiring), one-tap-to-disappear
  clears position data rather than just flipping a flag

## What's stubbed and MUST be wired before any real money or real users touch this

1. **SasaPay** (`app/utils/sasapay_client.py`, `routes/passes.py`, `routes/hangouts.py`,
   `routes/earnings.py`, `routes/webhooks.py`) — collections (pass purchase, paid hangout
   join) and payouts (host withdrawal) are both wired to real SasaPay endpoints, but:
   - The exact request/response field names and casing were reconstructed from SasaPay's
     public docs, not confirmed against a live sandbox call — log the raw payload the
     first time you hit each endpoint and adjust the parsing in `webhooks.py` if it
     doesn't match.
   - The IPN callback endpoints (`/api/webhooks/sasapay/collection`, `/payout`) are
     currently **unauthenticated** — anyone who guesses the URL could POST a fake
     "success" payload and get a free pass or a fraudulent payout confirmation. Confirm
     with SasaPay support what signature/verification mechanism they support (shared
     secret header, IP allowlist, etc.) and add it before this goes anywhere near
     production.
   - `PUBLIC_CALLBACK_BASE_URL` must be a real, internet-reachable URL for SasaPay to
     call back to — use ngrok (or similar) in local dev, since `localhost` won't work.
   - Get a merchant account and sandbox credentials at https://docs.sasapay.app before
     testing any of this.
2. **KYC vendor** (`routes/verification.py`) — `/start` just flips status to `pending`.
   Wire in Persona/Veriff/Stripe Identity's actual API, and implement the webhook to set
   `approved`/`rejected` from their callback, not from anything the client claims. This
   is a separate integration from SasaPay — payments and identity verification are
   different vendors here.
3. **Push notifications** — still not wired. The app is now installable as a PWA
   (`vite-plugin-pwa`, see the "Testing the PWA install prompt" section above), which
   is the prerequisite for real push on Android/desktop — but the service worker it
   generates only handles asset caching, not push events. See the web-push guide from
   earlier in this conversation for the OneSignal/FCM approach; it would extend the
   same service worker `vite-plugin-pwa` already generates, not replace it.
4. **A scheduled job to clear expired nearby sessions** — the app defensively checks
   expiry at read-time (`utils/geo.py`), but stale `current_lat`/`current_lng` values
   will sit in the DB until something clears them. Add a cron task or Celery beat job
   calling `end_nearby_session()` on anyone past `nearby_expires_at`.
5. **Rate limiting** — none yet, anywhere. Add it before this is public, especially on
   `/auth/login` and `/passes/purchase`.
6. **Input validation** is minimal (presence checks only) — add real schema validation
   (marshmallow or pydantic) before production.
7. **Cloud storage is optional, not automatic** — profile photos, message media,
   status media, and KYC documents all upload to Cloudinary when
   `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are set
   (see `app/utils/cloud_storage.py`), and fall back to local disk when they're
   not. **Local disk does not survive a Render/Heroku-style redeploy** (the
   filesystem is ephemeral — wiped on every deploy) and doesn't work across
   multiple instances. If you're deployed anywhere like that, set the three
   Cloudinary env vars for real, or every uploaded photo will vanish on your
   next deploy. Local dev works fine without a Cloudinary account — it just
   uses local disk automatically when those vars are blank.

## Design decisions encoded in the code (so future-you remembers why)

- `Message` is one table for both hangout and Hola messages (`utils/passes.py`,
  `models/message.py`) — simpler moderation tooling later, split only if scale demands it.
- Pass-gating is a single function (`utils/passes.py: can_user_send_message`) called from
  both message-send routes — one source of truth, not duplicated logic.
- `nearby_visible` fields live directly on `User`, not a separate session table — fine at
  this scale, revisit if you need session history/analytics later.
- Platform fee on host earnings is a module-level constant in `routes/earnings.py`
  (`PLATFORM_FEE_PCT`) — pull this into config once it needs to vary by host tier or promo.
