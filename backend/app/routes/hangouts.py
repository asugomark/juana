from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import (
    Hangout, HangoutMember, Venue,
    DEFAULT_DURATION_MINUTES, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES,
)
from app.models.pass_model import Transaction
from app.utils.geo import haversine_miles
from app.utils.passes import grant_pass, PASS_DURATIONS
from app.utils.sasapay_client import request_collection, SasaPayError
from app.utils.settings import get_sasapay_config
from app.utils.phone import normalize_msisdn

hangouts_bp = Blueprint("hangouts", __name__, url_prefix="/api/hangouts")


@hangouts_bp.post("")
@jwt_required()
def create_hangout():
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    venue = None
    if data.get("venue"):
        v = data["venue"]
        venue = Venue(name=v["name"], address=v.get("address"), lat=v["lat"], lng=v["lng"])
        db.session.add(venue)
        db.session.flush()  # get venue.id before using it below

    pass_tier = data.get("pass_tier")  # "day" | "week" | "month" | None
    if pass_tier and pass_tier not in PASS_DURATIONS:
        return jsonify({"error": "pass_tier must be day, week, or month"}), 400

    # Host-set entry price. When present it wins over pass_tier, and joining includes the
    # platform's standard pass (so a paying guest can chat) instead of a tier the host picked.
    entry_price_cents = data.get("entry_price_cents")
    if entry_price_cents in (None, "", 0):
        entry_price_cents = None
    else:
        try:
            entry_price_cents = int(entry_price_cents)
        except (TypeError, ValueError):
            return jsonify({"error": "entry_price_cents must be a number"}), 400
        lo = current_app.config["HANGOUT_MIN_ENTRY_CENTS"]
        hi = current_app.config["HANGOUT_MAX_ENTRY_CENTS"]
        if not lo <= entry_price_cents <= hi:
            return jsonify({"error": f"entry price must be between KES {lo // 100:,} and KES {hi // 100:,}"}), 400
        pass_tier = current_app.config["HANGOUT_INCLUDED_PASS"]

    starts_at = datetime.utcnow()
    if data.get("starts_at"):
        try:
            starts_at = datetime.fromisoformat(data["starts_at"].replace("Z", "+00:00"))
        except ValueError:
            return jsonify({"error": "starts_at must be ISO 8601"}), 400
        if starts_at.tzinfo is not None:
            # the column is naive UTC; an aware value would make later comparisons raise
            starts_at = starts_at.astimezone(timezone.utc).replace(tzinfo=None)

    # How long it runs. Optional for older clients -> default, so NOTHING is ever created
    # without an end time. Out-of-range values are clamped rather than rejected.
    try:
        duration = int(data.get("duration_minutes", DEFAULT_DURATION_MINUTES))
    except (TypeError, ValueError):
        return jsonify({"error": "duration_minutes must be a number"}), 400
    duration = max(MIN_DURATION_MINUTES, min(MAX_DURATION_MINUTES, duration))
    ends_at = starts_at + timedelta(minutes=duration)
    if ends_at <= datetime.utcnow():
        return jsonify({"error": "that time has already passed — pick a start time in the future"}), 400

    hangout = Hangout(
        host_id=user_id,
        venue_id=venue.id if venue else None,
        title=title,
        icon=data.get("icon", "●"),
        description=data.get("description"),
        capacity=int(data.get("capacity", 8)),
        visibility=data.get("visibility", "open"),
        requires_approval=bool(data.get("requires_approval", False)),
        verified_only=bool(data.get("verified_only", False)),
        pass_tier=pass_tier,
        entry_price_cents=entry_price_cents,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    db.session.add(hangout)
    db.session.flush()

    # Host auto-joins as an active member with the host role.
    db.session.add(HangoutMember(hangout_id=hangout.id, user_id=user_id, role="host", status="active"))
    db.session.commit()

    return jsonify(hangout.to_dict()), 201


@hangouts_bp.get("/nearby")
@jwt_required()
def nearby_hangouts():
    """
    Two-tier lookup, matching the design:
    - if lat/lng query params are given (live nearby session), rank by real distance
    - otherwise falls back to just listing recent open hangouts (coarse, no location math)

    Also computes matched_interests per hangout: a simple case-insensitive
    substring check of the viewer's own interest tags against the hangout's
    title + description. This is deliberately basic -- there's no formal
    hangout-tagging system yet, just free text -- so it will miss synonyms
    ("board games" won't match a hangout that only says "Codenames night").
    Good enough to power a "Recommended for you" section without pretending
    to be a real recommendation engine; worth building real tagging if this
    matters more later.
    """
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    radius_mi = request.args.get("radius_mi", default=5, type=float)

    viewer = User.query.get(get_jwt_identity())
    viewer_interests = viewer.interests or [] if viewer else []

    hangouts = (
        Hangout.query.filter(Hangout.visibility == "open", Hangout.is_active_clause())
        .order_by(Hangout.starts_at.desc())
        .limit(100)
        .all()
    )

    results = []
    for h in hangouts:
        distance = None
        if lat is not None and lng is not None and h.venue:
            distance = haversine_miles(lat, lng, h.venue.lat, h.venue.lng)
            if distance > radius_mi:
                continue

        haystack = f"{h.title} {h.description or ''}".lower()
        matched = [i for i in viewer_interests if i.lower() in haystack]

        results.append((distance if distance is not None else 0, h, matched))

    results.sort(key=lambda triple: triple[0])
    return jsonify([
        h.to_dict(viewer_distance_mi=d if lat is not None else None, matched_interests=matched)
        for d, h, matched in results
    ])


@hangouts_bp.get("/pricing")
@jwt_required()
def hangout_pricing_rules():
    """The create form reads its limits from here, so min/max and the host's share live in
    config only — never hard-coded in the browser."""
    return jsonify({
        "min_entry_cents": current_app.config["HANGOUT_MIN_ENTRY_CENTS"],
        "max_entry_cents": current_app.config["HANGOUT_MAX_ENTRY_CENTS"],
        "host_share": round(1 - current_app.config["PLATFORM_FEE_PCT"], 4),
        "included_pass": current_app.config["HANGOUT_INCLUDED_PASS"],
    })


@hangouts_bp.get("/past")
@jwt_required()
def past_hangouts():
    """Hangouts that have ended and that the viewer took part in (joined, even if they later
    left). Ended hangouts vanish from discovery, but attendees still need a way back in —
    to rate the host and, later, to see the recap."""
    user_id = get_jwt_identity()
    rows = (
        Hangout.query.join(HangoutMember, HangoutMember.hangout_id == Hangout.id)
        .filter(
            HangoutMember.user_id == user_id,
            HangoutMember.status.in_(["active", "left"]),
            Hangout.is_ended_clause(),
        )
        .order_by(Hangout.starts_at.desc())
        .limit(30)
        .all()
    )
    return jsonify([h.to_dict() for h in rows])


@hangouts_bp.get("/<hangout_id>")
@jwt_required()
def get_hangout(hangout_id):
    hangout = Hangout.query.get_or_404(hangout_id)
    return jsonify(hangout.to_dict())


@hangouts_bp.get("/<hangout_id>/preview")
def hangout_preview(hangout_id):
    """
    Deliberately NO @jwt_required() — this is what a share link resolves to
    for someone who isn't signed up yet (see frontend Invite.jsx). Returns
    the same shape as to_dict() but callers should treat it as public-safe;
    it doesn't include anything a logged-in view wouldn't also show (no
    private member data, no location beyond the venue's own public address).
    Invite-only hangouts still preview (so a real invite link works) but are
    NOT discoverable any other way, matching how they behave everywhere else.
    """
    hangout = Hangout.query.get_or_404(hangout_id)
    return jsonify(hangout.to_dict())


PROMPT_COOLDOWN_SECONDS = 90  # don't stack a second payment prompt on someone's phone right after the first


def _has_paid(user_id, hangout_id):
    return Transaction.query.filter_by(
        user_id=user_id, hangout_id=hangout_id, type="hangout_join_paid", status="completed"
    ).first() is not None


def _join_paid_hangout(hangout, user_id, existing, data, invited_by_user_id):
    """
    PAYING is what makes someone a member of a paid hangout. Until SasaPay confirms (see
    routes/webhooks.py) their membership stays 'pending' = unpaid: they can't read the chat, don't
    take a spot, and — crucially — can retry. Previously they became an ACTIVE member before paying,
    so a prompt that never arrived (or a cancelled one) left them 'already a member' with no way to
    be prompted again and the chat free to read.
    """
    if existing and existing.status == "active" and (existing.role == "host" or _has_paid(user_id, hangout.id)):
        return jsonify({"error": "already a member"}), 409
    # (an active member WITHOUT a completed payment is someone the old flow let in unpaid — they
    # fall through and are asked to pay, which is what they should have been asked in the first place)

    phone = normalize_msisdn(data.get("phone_number"))
    if not phone:
        return jsonify({"error": "invalid_phone", "message": "Enter a Safaricom number like 0712 345 678"}), 400

    recent = (
        Transaction.query.filter_by(user_id=user_id, hangout_id=hangout.id, type="hangout_join_paid", status="pending")
        .filter(Transaction.created_at > datetime.utcnow() - timedelta(seconds=PROMPT_COOLDOWN_SECONDS))
        .first()
    )
    if recent:
        return jsonify({
            "status": "pending_payment", "already_sent": True,
            "checkout_request_id": recent.checkout_request_id,
            "message": "A payment prompt was just sent — check your phone.",
        }), 202

    if existing:
        existing.status = "pending"
        if invited_by_user_id and not existing.invited_by_user_id:
            existing.invited_by_user_id = invited_by_user_id
    else:
        db.session.add(HangoutMember(
            hangout_id=hangout.id, user_id=user_id, status="pending", invited_by_user_id=invited_by_user_id,
        ))

    price_cents = hangout.price_cents()
    txn = Transaction(
        user_id=user_id, type="hangout_join_paid", amount_cents=price_cents,
        host_id=hangout.host_id, hangout_id=hangout.id, status="pending",
    )
    db.session.add(txn)
    db.session.flush()  # gives the transaction its id, used below as a short, unique reference

    try:
        result = request_collection(
            phone_number=phone,
            amount=price_cents / 100,
            network_code=data.get("network_code", "63902"),
            # Same shape as the pass purchase that is known to work: a short reference and a fixed,
            # plain description. The old values were an 81-character reference and the host's own
            # free-text title (emoji and all), which payment APIs commonly reject.
            account_reference=f"JH{txn.id.replace('-', '')[:10].upper()}",
            transaction_desc="Juana hangout",
            callback_url=f"{get_sasapay_config()['callback_base_url']}/api/webhooks/sasapay/collection",
        )
    except SasaPayError as e:
        db.session.rollback()  # nothing is recorded for a prompt that was never sent
        return jsonify({"error": "payment_request_failed", "message": str(e)}), 502

    txn.checkout_request_id = result["CheckoutRequestID"]
    db.session.commit()
    return jsonify({
        "status": "pending_payment",
        "checkout_request_id": txn.checkout_request_id,
        "message": result.get("detail", "Check your phone to approve the payment"),
    }), 202


@hangouts_bp.get("/<hangout_id>/join-status")
@jwt_required()
def join_status(hangout_id):
    """What the join screen polls: how did THIS payment go? (It used to ask 'do you hold any pass?',
    which says yes instantly to anyone with an old pass and can never say 'failed'.)"""
    user_id = get_jwt_identity()
    txn = (
        Transaction.query.filter_by(user_id=user_id, hangout_id=hangout_id, type="hangout_join_paid")
        .order_by(Transaction.created_at.desc())
        .first()
    )
    member = HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=user_id).first()
    return jsonify({
        "payment": txn.status if txn else "none",
        "is_member": bool(member and member.status == "active"),
    })


@hangouts_bp.post("/<hangout_id>/join")
@jwt_required()
def join_hangout(hangout_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)
    hangout = Hangout.query.get_or_404(hangout_id)

    if hangout.status() == "ended":
        return jsonify({"error": "this hangout has ended"}), 410

    if hangout.verified_only and not user.is_verified:
        # "verification_required" is a code the app reacts to (it opens the verification flow);
        # "message" is what a person reads. Previously this was one terse lowercase string.
        return jsonify({
            "error": "verification_required",
            "message": "This hangout is for verified profiles only — verify your identity to join.",
        }), 403

    if hangout.member_count() >= hangout.capacity:
        return jsonify({"error": "this hangout is full"}), 409

    data = request.get_json(silent=True) or {}
    invited_by_user_id = data.get("invited_by")
    if invited_by_user_id:
        # Silently drop a bogus/self-referential value rather than erroring the
        # whole join — referral tracking is a nice-to-have, not something that
        # should block someone from actually joining if it's malformed.
        if invited_by_user_id == user_id or not User.query.get(invited_by_user_id):
            invited_by_user_id = None

    existing = HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=user_id).first()
    if existing and existing.status == "removed":
        # the host removed this person — neither paying nor re-joining may undo that
        return jsonify({"error": "you can't rejoin this hangout"}), 403

    if hangout.is_paid:
        return _join_paid_hangout(hangout, user_id, existing, data, invited_by_user_id)

    if existing and existing.status == "active":
        return jsonify({"error": "already a member"}), 409

    status = "pending" if hangout.requires_approval else "active"

    if existing:
        existing.status = status
        if invited_by_user_id and not existing.invited_by_user_id:
            existing.invited_by_user_id = invited_by_user_id
    else:
        db.session.add(HangoutMember(
            hangout_id=hangout_id, user_id=user_id, status=status,
            invited_by_user_id=invited_by_user_id,
        ))

    db.session.commit()
    return jsonify({"status": status, "hangout": hangout.to_dict()}), 200


@hangouts_bp.post("/<hangout_id>/leave")
@jwt_required()
def leave_hangout(hangout_id):
    user_id = get_jwt_identity()
    member = HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=user_id).first_or_404()
    member.status = "left"
    db.session.commit()
    return jsonify({"status": "left"}), 200


@hangouts_bp.get("/<hangout_id>/members")
@jwt_required()
def list_members(hangout_id):
    members = HangoutMember.query.filter_by(hangout_id=hangout_id, status="active").all()
    return jsonify([
        {
            "user": m.user.to_public_dict(),
            "role": m.role,
            "joined_at": m.joined_at.isoformat(),
            "invited_by_user_id": m.invited_by_user_id,
        }
        for m in members
    ])


@hangouts_bp.post("/<hangout_id>/members/<member_user_id>/remove")
@jwt_required()
def remove_member(hangout_id, member_user_id):
    """Host-only moderation action."""
    requester_id = get_jwt_identity()
    hangout = Hangout.query.get_or_404(hangout_id)
    if hangout.host_id != requester_id:
        return jsonify({"error": "only the host can remove members"}), 403

    member = HangoutMember.query.filter_by(hangout_id=hangout_id, user_id=member_user_id).first_or_404()
    member.status = "removed"
    db.session.commit()
    return jsonify({"status": "removed"}), 200
