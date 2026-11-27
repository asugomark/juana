import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { api, getToken } from '../api/client'
import { formatKes } from '../utils/price'
import { setPendingInvite } from '../utils/invite'
import './Invite.css'

/**
 * Public, no-auth landing for a hangout share link:
 *   https://.../invite/<hangoutId>?ref=<sharer's user id>
 *
 * If the visitor is already logged in, skip straight to the real hangout
 * screen (where the normal join flow already handles everything, including
 * an invited_by if we still stash it). If not, this is the growth-loop
 * moment: show them enough to want in, then send them to register with the
 * hangout + referrer remembered so joining can happen right after signup.
 */
export default function Invite() {
  const { hangoutId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [hangout, setHangout] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ref = searchParams.get('ref')
    setPendingInvite(hangoutId, ref)

    if (getToken()) {
      navigate(`/hangouts/${hangoutId}`)
      return
    }

    api.hangoutPreview(hangoutId).then(setHangout).catch((err) => setError(err.message))
  }, [hangoutId, searchParams, navigate])

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <p style={{ color: 'var(--coral)' }}>This hangout link doesn't seem to work anymore.</p>
          <Link to="/" className="invite-cta">Go to Juana</Link>
        </div>
      </div>
    )
  }

  if (!hangout) return <div className="invite-page"><p style={{ color: 'var(--slate)' }}>Loading…</p></div>

  return (
    <div className="invite-page">
      <div className="invite-card">
        <div className="invite-logo"><span className="logo-dot"></span>Juana</div>

        <div className="invite-thumb">{hangout.icon}</div>
        <h1>{hangout.title}</h1>
        <p className="invite-meta">
          {hangout.venue?.name ? `${hangout.venue.name} · ` : ''}
          {hangout.member_count}/{hangout.capacity} going
          {hangout.is_paid ? ` · ${formatKes(hangout.price_cents)} entry` : ' · Free to join'}
          {hangout.verified_only ? ' · Verified profiles only' : ''}
        </p>

        {hangout.description && <p className="invite-desc">{hangout.description}</p>}

        {hangout.verified_only && hangout.status !== 'ended' && (
          <p className="invite-fine" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
            This hangout is for verified profiles. You can sign up now and verify your identity afterwards.
          </p>
        )}

        <div className="invite-host">
          Hosted by <strong>{hangout.host?.display_name}</strong>
        </div>

        {hangout.status === 'ended' ? (
          <p className="invite-fine" style={{ fontSize: 13, marginTop: 24 }}>This hangout has ended. Browse what's on right now on Juana.</p>
        ) : (
          <>
            <Link to="/register" className="invite-cta">Join Juana to RSVP →</Link>
            <p className="invite-fine">Free to sign up, takes about 2 minutes.</p>
          </>
        )}
      </div>
    </div>
  )
}
