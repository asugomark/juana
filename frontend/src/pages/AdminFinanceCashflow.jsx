import { useEffect, useState } from 'react'
import { api } from '../api/client'

function kes(cents) {
  return `KES ${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function AdminFinanceCashflow() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.adminCashflow(days).then(setData).catch((err) => setError(err.message))
  }, [days])

  if (error) return <p style={{ color: 'var(--coral)' }}>{error}</p>
  if (!data) return <p style={{ color: 'var(--slate)' }}>Loading…</p>

  // Collapse into weekly bars once the range is long enough that daily bars
  // would be unreadably thin — same idea as Earnings.jsx's chart, just with a
  // real number of days behind it instead of a fixed 4 buckets.
  const bucketSize = days > 60 ? 7 : 1
  const buckets = []
  for (let i = 0; i < data.series.length; i += bucketSize) {
    const chunk = data.series.slice(i, i + bucketSize)
    buckets.push({
      label: chunk[0].date.slice(5),
      in_cents: chunk.reduce((s, d) => s + d.in_cents, 0),
      out_cents: chunk.reduce((s, d) => s + d.out_cents, 0),
    })
  }
  const maxVal = Math.max(...buckets.map((b) => Math.max(b.in_cents, b.out_cents)), 1)

  return (
    <div>
      <div className="admin-tabs" style={{ marginBottom: 20 }}>
        {[7, 30, 90].map((d) => (
          <button key={d} className={`admin-tab ${days === d ? 'active' : ''}`} onClick={() => setDays(d)} style={{ fontSize: 11, padding: '6px 14px' }}>
            {d}D
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>MONEY IN</div>
          <div style={{ fontSize: 24, fontFamily: "'Fraunces', serif", color: 'var(--lime)' }}>{kes(data.totals.in_cents)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>MONEY OUT</div>
          <div style={{ fontSize: 24, fontFamily: "'Fraunces', serif", color: 'var(--coral)' }}>{kes(data.totals.out_cents)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>NET</div>
          <div style={{ fontSize: 24, fontFamily: "'Fraunces', serif" }}>{kes(data.totals.net_cents)}</div>
        </div>
      </div>

      <div className="report-card">
        <div className="chart" style={{ gap: bucketSize === 1 && buckets.length > 30 ? 2 : 10 }}>
          {buckets.map((b, i) => (
            <div className="bar-col" key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', gap: 2, width: '100%' }}>
                <div className="bar peak" style={{ height: `${Math.max(2, (b.in_cents / maxVal) * 100)}%` }} title={`In: ${kes(b.in_cents)}`}></div>
                <div className="bar" style={{ height: `${Math.max(2, (b.out_cents / maxVal) * 100)}%`, background: 'var(--coral)' }} title={`Out: ${kes(b.out_cents)}`}></div>
              </div>
              {buckets.length <= 31 && <span className="day">{b.label}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 11, color: 'var(--slate)' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--lime)', borderRadius: 2, marginRight: 6 }}></span>In</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--coral)', borderRadius: 2, marginRight: 6 }}></span>Out</span>
        </div>
      </div>
    </div>
  )
}
