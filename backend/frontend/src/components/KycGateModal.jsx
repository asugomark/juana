import { useState } from 'react'
import { api } from '../api/client'
import './KycGateModal.css'

/**
 * Shown when Earnings.jsx's withdraw call comes back 403 with error='kyc_required'
 * (see routes/earnings.py:withdraw). "Start verification" only flips kyc_status to
 * 'pending' server-side right now (routes/verification.py is a stub) — there's no
 * real vendor SDK (Persona/Veriff) wired in yet, so this can't actually walk someone
 * through an ID+selfie capture. It's honest about that rather than pretending.
 */
export default function KycGateModal({ balanceCents, onClose }) {
  const [stage, setStage] = useState('intro') // intro | pending
  const [error, setError] = useState(null)

  async function handleStart() {
    try {
      await api.startVerification()
      setStage('pending')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>

        {stage === 'intro' && (
          <>
            <div className="modal-icon">🛡</div>
            <h2>Verify your identity to get paid</h2>
            <p className="lede">Before your first withdrawal, we need to confirm who you are — this keeps payouts secure and covers the tax reporting we're required to do on host earnings.</p>

            <div className="why-list">
              <div className="why-row">
                <div className="why-ic">✓</div>
                <div>
                  <div className="t">Government ID</div>
                  <div className="d">A quick photo of your license or passport.</div>
                </div>
              </div>
              <div className="why-row">
                <div className="why-ic">◐</div>
                <div>
                  <div className="t">Live selfie</div>
                  <div className="d">Confirms the ID actually belongs to you.</div>
                </div>
              </div>
              <div className="why-row">
                <div className="why-ic">$</div>
                <div>
                  <div className="t">Tax details</div>
                  <div className="d">Required once your earnings cross the reporting threshold.</div>
                </div>
              </div>
            </div>

            <div className="balance-strip">
              <span className="k">Waiting for you</span>
              <span className="v">KES {(balanceCents / 100).toFixed(0)}</span>
            </div>

            {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 12 }}>{error}</p>}

            <button className="verify-btn" onClick={handleStart}>Start verification</button>
            <button className="later-btn" onClick={onClose}>Not now</button>
            <p className="modal-fine">Your balance stays safe and keeps growing.<br />This also verifies you platform-wide.</p>
          </>
        )}

        {stage === 'pending' && (
          <>
            <div className="modal-icon">⏳</div>
            <h2>Verification started</h2>
            <p className="lede">
              Heads up — full ID verification isn't fully wired into this build yet (no vendor is connected).
              Your status is now "pending" in the system, which is enough to test the rest of the flow, but a
              real verification step (ID + selfie capture) still needs a provider like Persona or Veriff plugged
              in before this can approve anyone for real.
            </p>
            <button className="verify-btn" onClick={onClose}>Got it</button>
          </>
        )}
      </div>
    </div>
  )
}
