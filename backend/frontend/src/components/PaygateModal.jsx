import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

const PASS_META = {
  day: { label: 'Day pass', sub: '24 HOURS · UNLIMITED MESSAGES' },
  week: { label: 'Week pass', sub: '7 DAYS · UNLIMITED MESSAGES' },
  month: { label: 'Month pass', sub: '30 DAYS · UNLIMITED MESSAGES' },
}

function formatKes(cents) {
  return `KES ${(cents / 100).toFixed(0)}`
}

/**
 * Shown whenever a send fails with a 402 (see api/client.js — error.status === 402).
 * No soft warning beforehand, hard block at send-time — this is the only place
 * someone learns they need a pass.
 *
 * SasaPay collections are async: submitting triggers an STK push to the user's
 * phone (they approve on their handset), and the pass is only actually granted
 * once the backend's webhook confirms success (see routes/webhooks.py). So this
 * modal polls /passes/status after submitting rather than assuming success immediately.
 */
export default function PaygateModal({ onClose, onPurchased }) {
  const [tier, setTier] = useState('week')
  const [phone, setPhone] = useState('')
  const [prices, setPrices] = useState(null) // { day: cents, week: cents, month: cents } — from the real config
  const [stage, setStage] = useState('form') // form | waiting | error
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    api.passPricing().then(setPrices).catch(() => setPrices({ day: 5000, week: 15000, month: 35000 }))
    return () => clearInterval(pollRef.current)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!/^254(7|1)\d{8}$/.test(phone)) {
      setError('Enter your number in the format 2547XXXXXXXX')
      return
    }

    setStage('waiting')
    try {
      await api.purchasePass(tier, phone)
      pollRef.current = setInterval(async () => {
        const status = await api.passStatus()
        if (status.has_active_pass) {
          clearInterval(pollRef.current)
          onPurchased?.()
        }
      }, 3000)
    } catch (err) {
      setStage('error')
      setError(err.message)
    }
  }

  if (!prices) return null // brief flash while pricing loads — avoids showing wrong numbers

  return (
    <div className="overlay">
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>

        {stage === 'form' && (
          <form onSubmit={handleSubmit}>
            <div className="modal-icon">🔒</div>
            <h2>Get a pass to keep messaging</h2>
            <p className="lede">You can still read every conversation you're part of. Get a pass to send messages again — here, and everywhere else on Juana.</p>

            <div className="pass-list">
              {Object.entries(PASS_META).map(([key, meta]) => (
                <div
                  key={key}
                  className={`pass-opt ${tier === key ? 'selected' : ''}`}
                  onClick={() => setTier(key)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pass-left">
                    <div className="radio"></div>
                    <div>
                      <div className="pass-name">
                        {meta.label}
                        {key === 'week' && <span className="best-tag">MOST POPULAR</span>}
                      </div>
                      <div className="pass-sub">{meta.sub}</div>
                    </div>
                  </div>
                  <div className="pass-price">
                    {formatKes(prices[key])}
                    {key !== 'day' && (
                      <span className="per">{formatKes(Math.round(prices[key] / (key === 'week' ? 7 : 30)))}/day</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20 }}>
              <input
                type="tel"
                placeholder="2547XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '13px 16px', color: 'var(--paper)', fontSize: 14,
                }}
              />
            </div>
            {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 8 }}>{error}</p>}

            <button type="submit" className="unlock-btn">Request payment — {formatKes(prices[tier])}</button>
            <p className="modal-fine">Works across all of Juana, not just this hangout.<br />Joining a paid hangout also grants its matching pass.</p>
          </form>
        )}

        {stage === 'waiting' && (
          <div>
            <div className="modal-icon">📱</div>
            <h2>Check your phone</h2>
            <p className="lede">Approve the payment prompt sent to {phone}. This closes automatically once it's confirmed.</p>
            <button className="unlock-btn" onClick={onClose} type="button">Close — I'll check back</button>
          </div>
        )}

        {stage === 'error' && (
          <div>
            <div className="modal-icon">⚠</div>
            <h2>Couldn't start the payment</h2>
            <p className="lede" style={{ color: 'var(--coral)' }}>{error}</p>
            <button className="unlock-btn" onClick={() => setStage('form')} type="button">Try again</button>
          </div>
        )}
      </div>
    </div>
  )
}
