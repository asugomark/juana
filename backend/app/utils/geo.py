"""
Distance math + nearby-session helpers.

Nearby visibility is intentionally session-based: current_lat/current_lng only mean
anything while nearby_visible=True and nearby_expires_at is in the future. A scheduled
job (see cron note in README) should periodically clear expired sessions so stale
positions never linger — this module also does a defensive check at read-time so
expiry works even before that job runs.
"""
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime, timedelta

EARTH_RADIUS_MI = 3958.8


def haversine_miles(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return EARTH_RADIUS_MI * 2 * atan2(sqrt(a), sqrt(1 - a))


def is_nearby_session_active(user) -> bool:
    return bool(
        user.nearby_visible
        and user.nearby_expires_at
        and user.nearby_expires_at > datetime.utcnow()
    )


def start_nearby_session(user, lat, lng, venue_id=None, hours=2):
    user.nearby_visible = True
    user.current_lat = lat
    user.current_lng = lng
    user.current_venue_id = venue_id
    user.nearby_expires_at = datetime.utcnow() + timedelta(hours=hours)


def end_nearby_session(user):
    """One tap to disappear — clears position data, doesn't just flip a flag."""
    user.nearby_visible = False
    user.current_lat = None
    user.current_lng = None
    user.current_venue_id = None
    user.nearby_expires_at = None
