import click
from datetime import datetime
from flask.cli import with_appcontext
from app.extensions import db
from app.models.user import User


@click.command("make-admin")
@click.argument("email")
@with_appcontext
def make_admin(email):
    """Promote an existing user to admin by email."""
    target_email = email.strip().lower()
    user = User.query.filter_by(email=target_email).first()
    if not user:
        click.echo(f"Error: User with email '{target_email}' does not exist.")
        return
    if user.is_admin:
        click.echo(f"Notice: User '{user.email}' is already an admin.")
        return
    user.is_admin = True
    db.session.commit()
    click.echo(f"Success: User '{user.email}' ({user.display_name}) is now an admin.")


@click.command("clear-expired-sessions")
@with_appcontext
def clear_expired_sessions():
    """Clear stale geo coordinates for users whose nearby session expired."""
    now = datetime.utcnow()
    expired_users = User.query.filter(
        User.nearby_visible.is_(True),
        User.nearby_expires_at.isnot(None),
        User.nearby_expires_at <= now,
    ).all()

    count = len(expired_users)
    for u in expired_users:
        u.nearby_visible = False
        u.current_lat = None
        u.current_lng = None
        u.current_venue_id = None
        u.nearby_expires_at = None

    db.session.commit()
    click.echo(f"Cleared {count} expired nearby session(s).")


def register_commands(app):
    app.cli.add_command(make_admin)
    app.cli.add_command(clear_expired_sessions)
