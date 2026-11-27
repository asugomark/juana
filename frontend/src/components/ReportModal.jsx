import { useState } from 'react'
import { api } from '../api/client'

const REASONS = [
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'other', label: 'Something else' },
]

export default function ReportModal({ reportedUserId, reportedUserName, hangoutId, onClose }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!reason) {
      setError('Choose a reason first.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.submitReport(reportedUserId, reason, details.trim(), hangoutId)
      setSubmitted(true)
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

        {submitted ? (
          <>
            <div className="modal-icon">✓</div>
            <h2>Report submitted</h2>
            <p className="lede">Thanks — this has been sent for review. You can also block {reportedUserName} separately if you'd rather not see or hear from them.</p>
            <button className="unlock-btn" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="modal-icon">⚑</div>
            <h2>Report {reportedUserName}</h2>
            <p className="lede">This goes to our moderation queue, not to {reportedUserName} — they won't be notified who reported them.</p>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REASONS.map((r) => (
                <label key={r.value} className="pass-opt" style={{ cursor: 'pointer' }}>
                  <div className="pass-left">
                    <input
                      type="radio"
                      name="reason"
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      style={{ width: 16, height: 16 }}
                    />
                    <span className="pass-name" style={{ fontWeight: 500 }}>{r.label}</span>
                  </div>
                </label>
              ))}
            </div>

            <textarea
              rows={3}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything else that would help us understand what happened (optional)"
              style={{
                width: '100%', marginTop: 16, background: 'var(--surface-2)', border: '1px solid var(--line)',
                borderRadius: 12, padding: 14, color: 'var(--paper)', fontSize: 14,
              }}
            />

            {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 8 }}>{error}</p>}

            <button className="unlock-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
