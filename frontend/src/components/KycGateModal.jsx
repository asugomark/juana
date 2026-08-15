import { useRef, useState } from 'react'
import { api } from '../api/client'
import './KycGateModal.css'

/**
 * Two entry points, same modal:
 *   - Earnings.jsx passes balanceCents when triggered by a blocked withdrawal
 *   - Profile.jsx opens this with no balanceCents for someone who just wants
 *     the badge (or needs it to join a verified-only hangout) without ever
 *     having hosted anything — see routes/hangouts.py's verified_only check,
 *     which has no relationship to earnings at all.
 * The copy below adapts to whichever context it's opened from.
 *
 * Real upload flow — an ID photo and a selfie actually upload and go into a
 * real admin review queue (see routes/admin_kyc.py + AdminDashboard's
 * Verification tab). Approval is manual (a human looks at the two photos),
 * not automated — appropriate for a small trusted beta; swap for a vendor
 * (Persona/Veriff/Stripe Identity) before this scales past that. See
 * models/kyc_submission.py for why that swap wouldn't need to touch this
 * component much.
 */
export default function KycGateModal({ balanceCents, onClose }) {
  const [stage, setStage] = useState('intro') // intro | upload | submitted
  const [idFile, setIdFile] = useState(null)
  const [selfieFile, setSelfieFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const idInputRef = useRef(null)
  const selfieInputRef = useRef(null)

  function pickFile(setter) {
    return (e) => {
      const f = e.target.files[0]
      if (f) setter(f)
    }
  }

  async function handleSubmit() {
    if (!idFile || !selfieFile) {
      setError('Both photos are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.submitKyc(idFile, selfieFile)
      setStage('submitted')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>

        {stage === 'intro' && (
          <>
            <div className="modal-icon">🛡</div>
            <h2>Verify your identity</h2>
            <p className="lede">
              {balanceCents != null
                ? "Before your first withdrawal, we need to confirm who you are — this keeps payouts secure and covers the tax reporting we're required to do on host earnings."
                : "Get the verified badge on your profile, and unlock joining hangouts that are set to verified-only. Takes a couple of minutes to submit."}
            </p>

            <div className="why-list">
              <div className="why-row">
                <div className="why-ic">✓</div>
                <div>
                  <div className="t">Government ID</div>
                  <div className="d">A clear photo of your license or passport.</div>
                </div>
              </div>
              <div className="why-row">
                <div className="why-ic">◐</div>
                <div>
                  <div className="t">Selfie</div>
                  <div className="d">Confirms the ID actually belongs to you.</div>
                </div>
              </div>
              <div className="why-row">
                <div className="why-ic">👤</div>
                <div>
                  <div className="t">Reviewed by a person</div>
                  <div className="d">A real review, usually within a day or two — not instant.</div>
                </div>
              </div>
            </div>

            {balanceCents != null && (
              <div className="balance-strip">
                <span className="k">Waiting for you</span>
                <span className="v">KES {(balanceCents / 100).toFixed(0)}</span>
              </div>
            )}

            <button className="verify-btn" onClick={() => setStage('upload')}>Continue</button>
            <button className="later-btn" onClick={onClose}>Not now</button>
            <p className="modal-fine">
              {balanceCents != null ? <>Your balance stays safe and keeps growing.<br /></> : null}
              This also unlocks {balanceCents != null ? 'the verified badge and ' : ''}verified-only hangouts.
            </p>
          </>
        )}

        {stage === 'upload' && (
          <>
            <div className="modal-icon">📎</div>
            <h2>Upload your photos</h2>
            <p className="lede">Both need to be clear and well-lit — blurry or cropped photos are the most common reason for a rejection.</p>

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => idInputRef.current?.click()}
                className="verify-btn"
                style={{ background: idFile ? 'var(--lime)' : 'var(--surface-2)', color: idFile ? 'var(--ink)' : 'var(--paper)', marginTop: 0, marginBottom: 10 }}
              >
                {idFile ? `✓ ${idFile.name}` : 'Choose government ID photo'}
              </button>
              <input ref={idInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile(setIdFile)} style={{ display: 'none' }} />

              <button
                type="button"
                onClick={() => selfieInputRef.current?.click()}
                className="verify-btn"
                style={{ background: selfieFile ? 'var(--lime)' : 'var(--surface-2)', color: selfieFile ? 'var(--ink)' : 'var(--paper)', marginTop: 0 }}
              >
                {selfieFile ? `✓ ${selfieFile.name}` : 'Choose selfie photo'}
              </button>
              <input ref={selfieInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile(setSelfieFile)} style={{ display: 'none' }} />
            </div>

            {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 12 }}>{error}</p>}

            <button className="verify-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
            <button className="later-btn" onClick={() => setStage('intro')}>Back</button>
          </>
        )}

        {stage === 'submitted' && (
          <>
            <div className="modal-icon">⏳</div>
            <h2>Submitted for review</h2>
            <p className="lede">
              Someone will review your photos, usually within a day or two. You'll be able to withdraw
              as soon as you're approved — no need to resubmit or check back constantly, your balance
              keeps growing in the meantime.
            </p>
            <button className="verify-btn" onClick={onClose}>Got it</button>
          </>
        )}
      </div>
    </div>
  )
}
