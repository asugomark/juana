from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app.models.hangout import Hangout, HangoutMember, Venue
from app.models.pass_model import Transaction
from app.utils.geo import haversine_miles
from app.utils.passes import grant_pass, PASS_DURATIONS
from app.utils.sasapay_client import request_collection, SasaPayError
from app.utils.settings import get_sasapay_config

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

    starts_at = datetime.utcnow()
    if data.get("starts_at"):
        try:
            starts_at = datetime.fromisoformat(data["starts_at"])
        except ValueError:
            return jsonify({"error": "starts_at must be ISO 8601"}), 400

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
        starts_at=starts_at,
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
        Hangout.query.filter(Hangout.visibility == "open")
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


@hangouts_bp.post("/<hangout_id>/join")
@jwt_required()
def join_hangout(hangout_id):
    user_id = get_jwt_identity()
    user = User.query.get_or_404(user_id)
    hangout = Hangout.query.get_or_404(hangout_id)

    if hangout.verified_only and not user.is_verified:
        return jsonify({"error": "this hangout requires a verified profile to join"}), 403

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

    # Paid hangout: joining requires payment via SasaPay before the pass is granted.
    # This mirrors passes.py — collection is async, so this endpoint kicks off the
    # SasaPay request and returns a pending state; the pass + Transaction only get
    # finalized in routes/webhooks.py once the IPN callback confirms success.
    if hangout.is_paid and status == "active":
        phone_number = data.get("phone_number")
        if not phone_number:
            return jsonify({"error": "phone_number is required to join a paid hangout"}), 400

        price_cents = current_app.config["PASS_PRICES"][hangout.pass_tier]
        callback_url = f"{get_sasapay_config()['callback_base_url']}/api/webhooks/sasapay/collection"

        try:
            result = request_collection(
                phone_number=phone_number,
                amount=price_cents / 100,
                network_code=data.get("network_code", "63902"),
                account_reference=f"hangout:{hangout_id}:{user_id}",
                transaction_desc=f"Juana hangout: {hangout.title}",
                callback_url=callback_url,
            )
        except SasaPayError as e:
            return jsonify({"error": "payment_request_failed", "message": str(e)}), 502

        db.session.add(Transaction(
            user_id=user_id,
            type="hangout_join_paid",
            amount_cents=price_cents,
            host_id=hangout.host_id,
            hangout_id=hangout_id,
            checkout_request_id=result.get("CheckoutRequestID"),
            status="pending",
        ))
        # Membership row stays as created above (status='active'), but the pass and
        # revenue attribution only finalize on webhook confirmation — see webhooks.py.
        db.session.commit()
        return jsonify({
            "status": "pending_payment",
            "checkout_request_id": result.get("CheckoutRequestID"),
            "message": result.get("detail", "Check your phone to approve the payment"),
        }), 202

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
