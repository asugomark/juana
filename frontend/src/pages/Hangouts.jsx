import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import Sidebar from '../components/Sidebar'
import './Dashboard.css'

export default function Hangouts() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [hangouts, setHangouts] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const meData = await api.me()
      setMe(meData)
      // Pass the viewer's live coords when available so results are distance-sorted,
      // same fallback behavior as the Nearby page when visibility is off.
      const params = meData.nearby_visible && meData.current_lat != null
        ? { lat: meData.current_lat, lng: meData.current_lng }
        : {}
      setHangouts(await api.nearbyHangouts(params))
    } catch (err) {
      if (err.status === 401) {
        clearToken()
        navigate('/login')
      } else {
        setError(err.message)
      }
    }
  }, [navigate])

  useEffect(() => { load() }, [load])

  async function handleJoin(hangout) {
    if (hangout.is_paid) {
      navigate(`/hangouts/${hangout.id}`) // paid join needs a phone number -- that flow lives on the detail screen
      return
    }
    try {
      await api.joinHangout(hangout.id)
      navigate(`/hangouts/${hangout.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!me) return <div className="app"><main className="main"><p>Loading…</p></main></div>

  const recommended = hangouts.filter((h) => h.matched_interests.length > 0)
  const rest = hangouts.filter((h) => h.matched_interests.length === 0)

  function HangoutRow({ h, showMatch }) {
    return (
      <div className="hangout-card">
        <div className="hangout-thumb">{h.icon}</div>
        <div className="hangout-info">
          <Link to={`/hangouts/${h.id}`} style={{ color: 'inherit' }}>
            <div className="title">{h.title}</div>
          </Link>
          <div className="meta">
            {h.distance_mi != null ? `${h.distance_mi} MI · ` : ''}
            {h.member_count}/{h.capacity} HERE{h.is_paid ? ` · ${h.pass_tier.toUpperCase()} PASS` : ''}
          </div>
          {showMatch && h.matched_interests.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {h.matched_interests.map((tag) => (
                <span key={tag} style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--lime)',
                  background: 'rgba(198,241,53,0.12)', padding: '3px 9px', borderRadius: 100,
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>
        <button className="join-btn" onClick={() => handleJoin(h)}>
          {h.is_paid ? 'View' : 'Join'}
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar active="hangouts" me={me} />

      <main className="main">
        <div className="topbar">
          <div className="greeting">
            <h1>Hangouts</h1>
            <p>{hangouts.length} open right now.</p>
          </div>
          <Link to="/hangouts/new" className="join-btn" style={{ padding: '12px 22px', fontSize: 13 }}>
            + Create a hangout
          </Link>
        </div>

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

        {recommended.length > 0 && (
          <div className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <h2>Recommended for you</h2>
              <span className="see-all">BASED ON YOUR INTERESTS</span>
            </div>
            {recommended.map((h) => <HangoutRow h={h} showMatch key={h.id} />)}
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h2>{recommended.length > 0 ? 'Everything else' : 'All open hangouts'}</h2>
          </div>
          {rest.length === 0 && recommended.length === 0 && (
            <p style={{ color: 'var(--slate)', fontSize: 14 }}>
              Nothing open right now. <Link to="/hangouts/new" style={{ color: 'var(--lime)' }}>Start one →</Link>
            </p>
          )}
          {rest.map((h) => <HangoutRow h={h} key={h.id} />)}
        </div>

        {!me.interests?.length && (
          <p style={{ color: 'var(--slate)', fontSize: 12, marginTop: 16 }}>
            Add interests to your <Link to={`/profile/${me.id}`} style={{ color: 'var(--lime)' }}>profile</Link> to get hangout recommendations here.
          </p>
        )}
      </main>
    </div>
  )
}
