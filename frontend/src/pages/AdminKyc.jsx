import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import AuthedImage from '../components/AuthedImage'

export default function AdminKyc() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [submissions, setSubmissions] = useState([])
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.adminListKyc(statusFilter).then(setSubmissions).catch((err) => setError(err.message))
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleApprove(id) {
    try {
      await api.adminApproveKyc(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleReject(id) {
    if (!rejectReason.trim()) {
      setError('A rejection reason is required — the user sees this.')
      return
    }
    try {
      await api.adminRejectKyc(id, rejectReason.trim())
      setRejectingId(null)
      setRejectReason('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const imgStyle = { width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10, background: 'var(--surface-3)' }

  return (
    <div>
      <div className="admin-tabs" style={{ marginBottom: 20 }}>
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            className={`admin-tab ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}
            style={{ fontSize: 11, padding: '6px 14px' }}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}
      {submissions.length === 0 && <p style={{ color: 'var(--slate)' }}>No {statusFilter === 'all' ? '' : statusFilter} submissions.</p>}

      {submissions.map((s) => (
        <div className="report-card" key={s.id} style={{ maxWidth: 560 }}>
          <div className="report-card-head">
            <Link to={`/profile/${s.user.id}`} style={{ fontSize: 14, fontWeight: 600 }}>{s.user.display_name}</Link>
            <span className="report-time">{new Date(s.created_at).toLocaleString()}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>ID DOCUMENT</div>
              <AuthedImage src={s.id_document_url} alt="ID document" style={imgStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--slate)', fontFamily: "'Space Mono', monospace", marginBottom: 6 }}>SELFIE</div>
              <AuthedImage src={s.selfie_url} alt="Selfie" style={imgStyle} />
            </div>
          </div>

          {s.status === 'rejected' && s.rejection_reason && (
            <div className="report-details" style={{ borderLeft: '2px solid var(--coral)' }}>
              <span className="label" style={{ display: 'block', marginBottom: 4 }}>REJECTION REASON</span>
              {s.rejection_reason}
            </div>
          )}

          {s.status === 'pending' && (
            rejectingId === s.id ? (
              <>
                <input
                  type="text"
                  placeholder="Why is this being rejected? (the user sees this)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ width: '100%', marginBottom: 10, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, color: 'var(--paper)', fontSize: 12 }}
                />
                <div className="report-actions">
                  <button className="btn-dismiss" onClick={() => { setRejectingId(null); setRejectReason('') }}>Cancel</button>
                  <button className="btn-ban" onClick={() => handleReject(s.id)}>Confirm reject</button>
                </div>
              </>
            ) : (
              <div className="report-actions">
                <button className="btn-dismiss" onClick={() => setRejectingId(s.id)}>Reject</button>
                <button className="btn-ban" style={{ background: 'var(--lime)', color: 'var(--ink)' }} onClick={() => handleApprove(s.id)}>Approve</button>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  )
}
