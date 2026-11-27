import { useEffect, useState } from 'react'
import { api } from '../api/client'

function kes(cents) {
  return `KES ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function AdminFinanceCollections() {
  const [collections, setCollections] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    api.adminCollections(statusFilter || undefined).then(setCollections).catch((err) => setError(err.message))
  }, [statusFilter])

  const completed = collections.filter((c) => c.status === 'completed')
  const totalIn = completed.reduce((sum, c) => sum + c.amount_cents, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>SHOWING</div>
          <div style={{ fontSize: 22, fontFamily: "'Fraunces', serif", color: 'var(--lime)' }}>{kes(totalIn)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>COMPLETED</div>
          <div style={{ fontSize: 22, fontFamily: "'Fraunces', serif" }}>{completed.length} / {collections.length}</div>
        </div>
      </div>

      <div className="admin-tabs" style={{ marginBottom: 16 }}>
        {['', 'completed', 'pending', 'failed'].map((s) => (
          <button
            key={s || 'all'}
            className={`admin-tab ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
            style={{ fontSize: 11, padding: '6px 14px' }}
          >
            {(s || 'ALL').toUpperCase()}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
      {collections.length === 0 && <p style={{ color: 'var(--slate)' }}>No collections yet.</p>}

      {collections.map((c) => (
        <div className="report-card" key={c.id}>
          <div className="report-card-head">
            <span
              className="report-reason"
              style={
                c.status === 'completed'
                  ? { background: 'rgba(198,241,53,0.12)', color: 'var(--lime)' }
                  : c.status === 'failed'
                  ? undefined
                  : { background: 'var(--surface-3)', color: 'var(--slate)' }
              }
            >
              {c.status}
            </span>
            <span className="report-time">{new Date(c.created_at).toLocaleString()}</span>
          </div>
          <div className="report-parties">
            <div>
              <span className="label">PAID BY</span>
              {c.payer?.display_name || 'Unknown'}
            </div>
            <div>
              <span className="label">TYPE</span>
              {c.type === 'pass_purchase' ? 'Pass purchase' : `Hangout join${c.hangout_title ? ` — ${c.hangout_title}` : ''}`}
            </div>
            <div>
              <span className="label">AMOUNT</span>
              {kes(c.amount_cents)}
            </div>
          </div>
          {c.checkout_request_id && (
            <div style={{ fontSize: 10, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>
              REF: {c.checkout_request_id}{c.sasapay_transaction_code ? ` · SASAPAY: ${c.sasapay_transaction_code}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
