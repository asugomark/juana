"""
The "mood" a person shows while they're live on Nearby: what they're open to RIGHT NOW.
A fixed list, not free text — free text invites abuse. The app fetches this list from the server
(GET /api/nearby/moods) so labels can change without a front-end release and can never drift.

A mood is an invitation to a conversation, never consent to anything more; the wording below is
deliberately about talking, meeting and hanging out. It lives and dies with the Nearby session
(see utils/geo.py): cleared when the session ends, never stored as history.
"""
MOODS = [
    {"key": "green", "label": "Open to mingle & join plans", "emoji": "🟢"},
    {"key": "amber", "label": "Here with my crew, open to vibes", "emoji": "🟡"},
    {"key": "red", "label": "Just chilling / low-key tonight", "emoji": "🔴"},
]
MOOD_KEYS = {m["key"] for m in MOODS}
