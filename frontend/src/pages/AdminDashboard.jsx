import { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import AdminFinance from './AdminFinance'
import AdminKyc from './AdminKyc'
import './AdminDashboard.css'

/**
 * Gated entirely client-side by checking me.is_admin and redirecting non-admins
 * away -- that's a UX convenience, NOT the real access control. The actual
 * security boundary is server-side (@admin_required in routes/admin.py, which
 * re-checks is_admin on every request). A non-admin who somehow loaded this
 * page would just get 403s from every API call here; hiding the page is about
 * not showing staff tooling to the wrong audience, not about security.
 */
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('reports') // 'reports' | 'users'
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reports, setReports] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [error, setError] = useState(null)
  const [banReason, setBanReason] = useState({}) // reportId -> draft reason text

  const loadReports = useCallback(async () => {
    try {
      setReports(await api.adminListReports(statusFilter))
    } catch (err) {
      setError(err.message)
    }
  }, [statusFilter])

  useEffect(() => {
    api.me().then((meData) => {
      setMe(meData)
      if (!meData.is_admin) navigate('/dashboard')
    }).catch(() => {
      clearToken()
      navigate('/login')
    })
  }, [navigate])

  useEffect(() => { if (me?.is_admin) loadReports() }, [me, loadReports])

  async function handleResolve(reportId, action) {
    if (action === 'ban' && !confirm('Ban this user? They will be logged out at their next login attempt.')) return
    try {
      await api.adminResolveReport(reportId, action, banReason[reportId] || '')
      await loadReports()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!searchQuery.trim()) return
    try {
      setSearchResults(await api.adminSearchUsers(searchQuery.trim()))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleBanFromSearch(userId) {
    const reason = prompt('Reason for ban (shown to no one but stored for the record):')
    if (reason === null) return
    try {
      await api.adminBanUser(userId, reason)
      handleSearch({ preventDefault: () => {} })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUnban(userId) {
    try {
      await api.adminUnbanUser(userId)
      handleSearch({ preventDefault: () => {} })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!me || !me.is_admin) return null

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="logo"><span className="logo-dot"></span>Juana</div>
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--coral)', marginTop: 8 }}>
          ADMIN MODE
        </p>
        <Link to="/dashboard" style={{ display: 'block', marginTop: 24, fontSize: 13, color: 'var(--slate)' }}>
          ← Back to app
        </Link>
      </aside>

      <main className="admin-main">
        <h1 style={{ fontSize: 26, marginBottom: 20 }}>Admin</h1>

        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Reports</button>
          <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>User lookup</button>
          <button className={`admin-tab ${tab === 'finance' ? 'active' : ''}`} onClick={() => setTab('finance')}>Finance</button>
          <button className={`admin-tab ${tab === 'kyc' ? 'active' : ''}`} onClick={() => setTab('kyc')}>Verification</button>
        </div>

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

        {tab === 'reports' && (
          <>
            <div className="admin-tabs" style={{ marginBottom: 20 }}>
              {['pending', 'actioned', 'dismissed', 'all'].map((s) => (
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

            {reports.length === 0 && <p style={{ color: 'var(--slate)' }}>No {statusFilter === 'all' ? '' : statusFilter} reports.</p>}

            {reports.map((r) => (
              <div className="report-card" key={r.id}>
                <div className="report-card-head">
                  <span className="report-reason">{r.reason.replace('_', ' ')}</span>
                  <span className="report-time">{new Date(r.created_at).toLocaleString()}</span>
                </div>

                <div className="report-parties">
                  <div>
                    <span className="label">REPORTED</span>
                    <Link to={`/profile/${r.reported_user.id}`}>{r.reported_user.display_name}</Link>
                  </div>
                  <div>
                    <span className="label">REPORTED BY</span>
                    <Link to={`/profile/${r.reporter.id}`}>{r.reporter.display_name}</Link>
                  </div>
                </div>

                {r.details && <div className="report-details">{r.details}</div>}
                {r.resolution_note && (
                  <div className="report-details" style={{ borderLeft: '2px solid var(--lime)' }}>
                    <span className="label" style={{ display: 'block', marginBottom: 4 }}>RESOLUTION NOTE</span>
                    {r.resolution_note}
                  </div>
                )}

                {r.status === 'pending' && (
                  <>
                    <input
                      type="text"
                      placeholder="Optional note (why dismissed / why banned)"
                      value={banReason[r.id] || ''}
                      onChange={(e) => setBanReason({ ...banReason, [r.id]: e.target.value })}
                      style={{
                        width: '100%', marginBottom: 10, background: 'var(--surface-2)', border: '1px solid var(--line)',
                        borderRadius: 10, padding: 10, color: 'var(--paper)', fontSize: 12,
                      }}
                    />
                    <div className="report-actions">
                      <button className="btn-dismiss" onClick={() => handleResolve(r.id, 'dismiss')}>Dismiss</button>
                      <button className="btn-ban" onClick={() => handleResolve(r.id, 'ban')}>Ban user</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'users' && (
          <>
            <form className="admin-search-row" onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search by name or email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="admin-tab active" type="submit">Search</button>
            </form>

            {searchResults.map((u) => (
              <div className="user-result-row" key={u.id}>
                <div className="user-result-info">
                  <div className="name">
                    <Link to={`/profile/${u.id}`}>{u.display_name}</Link>
                    {u.is_banned && <span className="banned-tag" style={{ marginLeft: 8 }}>BANNED</span>}
                  </div>
                  <div className="meta">{u.email} · KYC: {u.kyc_status.toUpperCase()}</div>
                </div>
                {u.is_banned ? (
                  <button className="btn-dismiss" onClick={() => handleUnban(u.id)}>Unban</button>
                ) : (
                  <button className="btn-ban" onClick={() => handleBanFromSearch(u.id)}>Ban</button>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'finance' && <AdminFinance />}
        {tab === 'kyc' && <AdminKyc />}
      </main>
    </div>
  )
}
