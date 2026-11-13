import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { photoStyle } from '../utils/avatar'
import './CreateHangout.css'

const ICONS = ['♟', '🎤', '☕', '🍻', '🎬', '🥾', '🎨', '⚽']

/**
 * Location note: "Right now" hangouts use the browser's geolocation to set the
 * venue's lat/lng -- there's no real address search (Google Places / Mapbox)
 * wired in yet, so the venue "name" is just a free-text label, not a geocoded
 * place. "Schedule it" still needs SOME location, so it reuses the same
 * geolocation capture -- it just means "wherever I am when I hit create", which
 * is a reasonable default for now but worth swapping for real venue search
 * before this handles hangouts the host isn't physically at yet.
 */
export default function CreateHangout() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    icon: ICONS[0],
    venueName: '',
    description: '',
    when: 'now', // 'now' | 'schedule'
    scheduledFor: '',
    visibility: 'open',
    capacity: 8,
    requiresApproval: false,
    verifiedOnly: true,
    passTier: '', // '' = free
  })
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [me, setMe] = useState(null)

  useEffect(() => { api.me().then(setMe).catch(() => {}) }, [])

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }))
  }

  async function getLocation() {
    setLocating(true)
    setError(null)
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      return { lat: position.coords.latitude, lng: position.coords.longitude }
    } catch (err) {
      setError('Could not get your location — check location permissions and try again.')
      return null
    } finally {
      setLocating(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim()) {
      setError('Give it a name.')
      return
    }

    const coords = await getLocation()
    if (!coords) return

    setSubmitting(true)
    try {
      const payload = {
        title: form.title,
        icon: form.icon,
        description: form.description,
        capacity: form.capacity,
        visibility: form.visibility,
        requires_approval: form.requiresApproval,
        verified_only: form.verifiedOnly,
        pass_tier: form.passTier || null,
        venue: {
          name: form.venueName || form.title,
          lat: coords.lat,
          lng: coords.lng,
        },
      }
      if (form.when === 'schedule' && form.scheduledFor) {
        payload.starts_at = new Date(form.scheduledFor).toISOString()
      }

      const hangout = await api.createHangout(payload)
      navigate(`/hangouts/${hangout.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const passLabel = { day: 'Day pass', week: 'Week pass', month: 'Month pass' }

  return (
    <>
      <div className="topbar">
        <div className="logo"><span className="logo-dot"></span>Juana</div>
        <Link to="/dashboard" className="close-btn" aria-label="Close">✕</Link>
      </div>

      <form onSubmit={handleSubmit} className="layout">

        <div className="form-col">
          <div className="form-head">
            <span className="eyebrow">New hangout</span>
            <h1 style={{ marginTop: 10 }}>What are you putting together?</h1>
            <p>Give it a name and a vibe — you can be as loose or as specific as you want.</p>
          </div>

          <div className="field-group">
            <label>NAME</label>
            <input
              type="text"
              value={form.title}
              placeholder="e.g. Trivia at The Yard"
              onChange={(e) => update({ title: e.target.value })}
            />
          </div>

          <div className="field-group">
            <label>ICON</label>
            <div className="icon-grid">
              {ICONS.map((ic) => (
                <div
                  key={ic}
                  className={`icon-opt ${form.icon === ic ? 'selected' : ''}`}
                  onClick={() => update({ icon: ic })}
                  role="button"
                  tabIndex={0}
                >
                  {ic}
                </div>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label>WHERE</label>
            <input
              type="text"
              value={form.venueName}
              placeholder="e.g. Fable — 412 Cedar St"
              onChange={(e) => update({ venueName: e.target.value })}
            />
            <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 8 }}>
              {locating ? 'Getting your location…' : "Uses your current location when you create — no address search yet."}
            </p>
          </div>

          <div className="field-group">
            <label>WHEN</label>
            <div className="seg-toggle" style={{ marginBottom: 14 }}>
              <button type="button" className={`seg-opt ${form.when === 'now' ? 'active' : ''}`} onClick={() => update({ when: 'now' })}>
                Right now
              </button>
              <button type="button" className={`seg-opt ${form.when === 'schedule' ? 'active' : ''}`} onClick={() => update({ when: 'schedule' })}>
                Schedule it
              </button>
            </div>
            {form.when === 'now' ? (
              <p style={{ fontSize: 12, color: 'var(--slate)' }}>Starts the moment you create it. It'll show as "live" to anyone browsing nearby.</p>
            ) : (
              <input
                type="datetime-local"
                value={form.scheduledFor}
                onChange={(e) => update({ scheduledFor: e.target.value })}
              />
            )}
          </div>

          <div className="field-group">
            <label>WHO CAN JOIN</label>
            <div className={`privacy-opt ${form.visibility === 'open' ? 'selected' : ''}`} onClick={() => update({ visibility: 'open' })} role="button" tabIndex={0}>
              <div className="radio"></div>
              <div>
                <div className="name">Open — visible on Nearby</div>
                <div className="desc">Anyone with Nearby turned on at this venue can see and join.</div>
              </div>
            </div>
            <div className={`privacy-opt ${form.visibility === 'invite_only' ? 'selected' : ''}`} onClick={() => update({ visibility: 'invite_only' })} role="button" tabIndex={0}>
              <div className="radio"></div>
              <div>
                <div className="name">Invite only</div>
                <div className="desc">Only people you send a link to can join. Won't show up in anyone's feed.</div>
              </div>
            </div>
          </div>

          <div className="field-group">
            <label>PRICE TO MESSAGE</label>
            <div className={`privacy-opt ${!form.passTier ? 'selected' : ''}`} onClick={() => update({ passTier: '' })} role="button" tabIndex={0}>
              <div className="radio"></div>
              <div>
                <div className="name">Free hangout</div>
                <div className="desc">Anyone can join. Messaging still needs a pass, same as everywhere else on Juana.</div>
              </div>
            </div>
            {['day', 'week', 'month'].map((tier) => (
              <div
                key={tier}
                className={`privacy-opt ${form.passTier === tier ? 'selected' : ''}`}
                onClick={() => update({ passTier: tier })}
                role="button"
                tabIndex={0}
              >
                <div className="radio"></div>
                <div>
                  <div className="name">Paid — {passLabel[tier]}</div>
                  <div className="desc">Joining auto-grants a {tier} pass, unlocking messaging everywhere on Juana.</div>
                </div>
              </div>
            ))}
          </div>

          <div className="field-group">
            <label>GROUP SIZE</label>
            <div className="capacity-row">
              <div className="stepper">
                <button type="button" aria-label="Decrease" onClick={() => update({ capacity: Math.max(2, form.capacity - 1) })}>−</button>
                <span className="val">{form.capacity}</span>
                <button type="button" aria-label="Increase" onClick={() => update({ capacity: Math.min(50, form.capacity + 1) })}>+</button>
              </div>
              <span className="capacity-hint">Chat closes to new joins once it's full</span>
            </div>
          </div>

          <div className="field-group">
            <label>DESCRIPTION</label>
            <textarea
              rows={3}
              placeholder="What's the plan? Anything people should bring or know?"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>

          <div className="toggle-row">
            <div>
              <div className="name">Require approval to join</div>
              <div className="desc">You'll see a request before anyone's added to the group.</div>
            </div>
            <button
              type="button"
              className={`switch ${form.requiresApproval ? 'on' : ''}`}
              aria-label="Toggle approval requirement"
              onClick={() => update({ requiresApproval: !form.requiresApproval })}
            />
          </div>
          <div className="toggle-row">
            <div>
              <div className="name">Only verified profiles</div>
              <div className="desc">Limits this hangout to people who've completed identity verification.</div>
            </div>
            <button
              type="button"
              className={`switch ${form.verifiedOnly ? 'on' : ''}`}
              aria-label="Toggle verified-only"
              onClick={() => update({ verifiedOnly: !form.verifiedOnly })}
            />
          </div>

          {error && <p style={{ color: 'var(--coral)', marginTop: 16, fontSize: 13 }}>{error}</p>}

          <div className="submit-row">
            <button type="submit" className="btn-primary" disabled={submitting || locating}>
              {submitting ? 'Creating…' : locating ? 'Locating…' : 'Create hangout'}
            </button>
            <Link to="/dashboard" className="btn-cancel">Cancel</Link>
          </div>
        </div>

        <div className="preview-col">
          <div className="preview-label">
            <span className="eyebrow">Live preview</span>
            <p>This is what people see when they find it.</p>
          </div>

          <div className="preview-card">
            <div className="preview-thumb">{form.icon}</div>
            <div className="title">{form.title || 'Untitled hangout'}</div>
            <div className="meta">
              {(form.venueName || 'Your location').toUpperCase()} · {form.when === 'now' ? 'LIVE NOW' : 'SCHEDULED'}
            </div>
            <div className="desc">{form.description || 'No description yet.'}</div>
            <div className="preview-badges">
              <span className="pbadge lime">{form.visibility === 'open' ? '● OPEN NOW' : '● INVITE ONLY'}</span>
              <span className="pbadge">{form.capacity} SPOTS</span>
              {form.verifiedOnly && <span className="pbadge">VERIFIED ONLY</span>}
              {form.passTier && <span className="pbadge">{passLabel[form.passTier].toUpperCase()}</span>}
            </div>
            <div className="preview-host">
              <div className="preview-avatar" style={photoStyle(me)}></div>
              <div className="htxt"><strong>You</strong>Hosting</div>
            </div>
          </div>
        </div>

      </form>
    </>
  )
}
