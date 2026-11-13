import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import KycGateModal from '../components/KycGateModal'
import Sidebar from '../components/Sidebar'
import './Earnings.css'

function kes(cents) {
  return `KES ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/**
 * Chart note: there's no backend endpoint that returns pre-bucketed weekly
 * revenue -- rather than build one for a scaffold chart, this buckets the last
 * 4 weeks client-side from the real /earnings/transactions list. Real numbers,
 * just aggregated in the browser instead of the database. Fine at this scale;
 * move it server-side if the transaction list ever gets large enough that
 * fetching 100+ rows just to draw 4 bars stops making sense.
 */
function bucketByWeek(transactions) {
  const now = Date.now()
  const buckets = [0, 0, 0, 0]
  transactions
    .filter((t) => t.type === 'hangout_join_paid' && t.status === 'completed')
    .forEach((t) => {
      const ageDays = (now - new Date(t.created_at)) / 86400000
      const weekIndex = 3 - Math.min(3, Math.floor(ageDays / 7))
      buckets[weekIndex] += t.amount_cents
    })
  return buckets
}

export default function Earnings() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [summary, setSummary] = useState(null)
  const [byHangout, setByHangout] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showKyc, setShowKyc] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [phone, setPhone] = useState('')
  const [showPhonePrompt, setShowPhonePrompt] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    try {
      const [meData, summaryData, hangoutData, txnData] = await Promise.all([
        api.me(),
        api.earningsSummary(),
        api.earningsByHangout(),
        api.earningsTransactions(),
      ])
      setMe(meData)
      setSummary(summaryData)
      setByHangout(hangoutData)
      setTransactions(txnData)
    } catch (err) {
      if (err.status === 401) {
        clearToken()
        navigate('/login')
      } else {
        setError(err.message)
      }
    }
  }, [navigate])

  useEffect(() => { loadAll() }, [loadAll])

  function handleWithdrawClick() {
    if (me.kyc_status !== 'approved') {
      setShowKyc(true)
      return
    }
    setShowPhonePrompt(true)
  }

  async function handleWithdrawConfirm(e) {
    e.preventDefault()
    setError(null)
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      setError('Enter your number in the format 2547XXXXXXXX')
      return
    }
    setWithdrawing(true)
    try {
      const result = await api.withdraw(phone)
      setMessage(result.message || 'Payout initiated — funds should arrive shortly')
      setShowPhonePrompt(false)
      await loadAll()
    } catch (err) {
      if (err.payload?.error === 'kyc_required') {
        setShowPhonePrompt(false)
        setShowKyc(true)
      } else {
        setError(err.message)
      }
    } finally {
      setWithdrawing(false)
    }
  }

  if (!me || !summary) return <div className="app"><main className="main"><p>Loading…</p></main></div>

  const weeklyBuckets = bucketByWeek(transactions)
  const maxBucket = Math.max(...weeklyBuckets, 1)

  return (
    <div className="app">
      <Sidebar active="earnings" me={me} />

      <main className="main">
        <div className="topbar">
          <div className="greeting">
            <h1>Earnings</h1>
            <p>From entry fees on your paid hangouts, after Juana's fee.</p>
          </div>
          <button className="payout-btn" onClick={handleWithdrawClick} disabled={summary.available_cents <= 0}>
            Withdraw {kes(summary.available_cents)}
          </button>
        </div>

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}
        {message && <p style={{ color: 'var(--lime)', marginBottom: 16 }}>{message}</p>}

        <div className="summary-row">
          <div className="sum-card">
            <div className="label">AVAILABLE BALANCE</div>
            <div className="amt lime">{kes(summary.available_cents)}</div>
            <div className="sub">Ready to withdraw</div>
          </div>
          <div className="sum-card">
            <div className="label">LIFETIME EARNED</div>
            <div className="amt">{kes(summary.lifetime_earned_cents)}</div>
            <div className="sub">After platform fee</div>
          </div>
          <div className="sum-card">
            <div className="label">PAID OUT</div>
            <div className="amt">{kes(summary.paid_out_cents)}</div>
            <div className="sub">All-time withdrawals</div>
          </div>
        </div>

        <div className="grid">
          <div className="col-main">
            <div className="panel">
              <div className="panel-head">
                <h2>Revenue — last 4 weeks</h2>
              </div>
              <div className="chart">
                {weeklyBuckets.map((amount, i) => (
                  <div className="bar-col" key={i}>
                    <div
                      className={`bar ${amount === maxBucket && amount > 0 ? 'peak' : ''}`}
                      style={{ height: `${Math.max(4, (amount / maxBucket) * 100)}%` }}
                    ></div>
                    <span className="day">W{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>By hangout</h2>
              </div>
              {byHangout.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 13 }}>No paid hangouts yet.</p>}
              {byHangout.map((h) => (
                <div className="h-row" key={h.hangout_id || 'deleted'}>
                  <div className="h-thumb">{h.icon}</div>
                  <div className="h-info">
                    <div className="name">{h.title}</div>
                    <div className="meta">{h.price_cents ? `${kes(h.price_cents)} ENTRY · ` : ''}{h.passes_sold} JOINED</div>
                  </div>
                  <span className={`h-status ${h.is_live ? 'live' : ''}`}>{h.is_live ? 'LIVE' : 'ENDED'}</span>
                  <div className="h-rev">
                    {kes(h.net_cents)}
                    <span className="passes">{kes(Math.round(h.net_cents / h.passes_sold))} ea</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="col-side">
            <div className="panel">
              <div className="panel-head"><h2>Payout method</h2></div>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>
                Payouts go out via SasaPay to a phone number you enter each time you withdraw —
                there's no saved payout method yet.
              </p>
            </div>

            <div className="panel">
              <div className="panel-head"><h2>Recent transactions</h2></div>
              {transactions.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 13 }}>No transactions yet.</p>}
              {transactions.slice(0, 10).map((t) => (
                <div className="txn-row" key={t.id}>
                  <div>
                    <div className="who">
                      {t.type === 'hangout_join_paid' ? 'Hangout join' : t.type === 'payout' ? 'Payout' : 'Pass purchase'}
                    </div>
                    <div className="meta">{t.status.toUpperCase()} · {new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="amt" style={t.amount_cents < 0 ? { color: 'var(--paper)' } : undefined}>
                    {t.amount_cents < 0 ? '−' : '+'}{kes(Math.abs(t.amount_cents))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {showPhonePrompt && (
        <div className="overlay">
          <div className="modal">
            <button className="modal-close" aria-label="Close" onClick={() => setShowPhonePrompt(false)}>✕</button>
            <div className="modal-icon">📱</div>
            <h2>Where should this go?</h2>
            <p className="lede">Withdrawing {kes(summary.available_cents)} via SasaPay.</p>
            <form onSubmit={handleWithdrawConfirm}>
              <input
                type="tel"
                placeholder="2547XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '13px 16px', color: 'var(--paper)', fontSize: 14, marginTop: 16,
                }}
              />
              {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 8 }}>{error}</p>}
              <button type="submit" className="verify-btn" disabled={withdrawing}>
                {withdrawing ? 'Sending…' : 'Confirm withdrawal'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showKyc && (
        <KycGateModal balanceCents={summary.available_cents} onClose={() => { setShowKyc(false); loadAll() }} />
      )}
    </div>
  )
}
