import { useState } from 'react'
import { api } from '../api/client'
import { useMoods, LAST_MOOD_KEY } from '../utils/moods'
import './GoLiveModal.css'

/**
 * The ONE place anyone goes live on Nearby. It used to be three separate buttons (Dashboard, Nearby
 * page, side menu), each asking for location with nothing in between — so a mood has to be chosen
 * here, as part of going live, rather than bolted onto each of them.
 *
 *   mode='start'  — pick a mood, then ask for location and go live
 *   mode='change' — already live: just change the mood (no new location request)
 */
export default function GoLiveModal({ mode = 'start', currentMood = null, onClose, onDone }) {
  const { moods } = useMoods()
  const changing = mode === 'change'
  const [mood, setMood] = useState(currentMood || localStorage.getItem(LAST_MOOD_KEY) || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    if (!mood) return
    setBusy(true)
    setError(null)
    try {
      if (changing) {
        await api.setNearbyMood(mood)
      } else {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        )
        await api.startNearby(pos.coords.latitude, pos.coords.longitude, undefined, mood)
      }
      try { localStorage.setItem(LAST_MOOD_KEY, mood) } catch { /* private mode — remembering is a nicety */ }
      onDone(mood)
    } catch (err) {
      setError(
        err && err.code === 1
          ? 'Juana needs your location to show you nearby. Allow it in your browser settings and try again.'
          : (err?.message || 'Could not go live — try again')
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal mood-modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="modal-icon">{changing ? '✎' : '◎'}</div>
        <h2>{changing ? 'Change your mood' : 'Go live'}</h2>
        <p className="lede">
          What are you open to right now? People nearby see it on your card, and it disappears the moment you go offline.
        </p>

        <div className="mood-list" role="radiogroup" aria-label="Your mood">
          {moods.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mood === m.key}
              className={`mood-opt ${mood === m.key ? 'selected' : ''}`}
              onClick={() => setMood(m.key)}
            >
              <span className="e">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>

        {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>{error}</p>}

        <button className="unlock-btn" onClick={submit} disabled={!mood || busy}>
          {busy ? (changing ? 'Saving…' : 'Getting your location…') : (changing ? 'Update' : 'Go live')}
        </button>
        <p className="mood-note">A mood is an invitation to chat — never more. You can block or report anyone, anytime.</p>
      </div>
    </div>
  )
}
