import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import { formatKes } from '../utils/price'
import Sidebar from '../components/Sidebar'
import StatusBar from '../components/StatusBar'
import { photoStyle } from '../utils/avatar'
import './Dashboard.css'

/**
 * Scope note: the mockup's "chat preview" panel (live messages inline on the
 * dashboard) is intentionally NOT reproduced here -- that's real-time chat
 * logic that already exists properly in HangoutDetail.jsx. Instead, the top
 * hangout you're an active member of gets a "Continue chat ->" card.
 *
 * Both "Hola inbox" and "Nearby now" here are short PREVIEWS (a handful of
 * rows) -- the full, real versions live at /hola and /nearby. Sidebar links
 * go to those pages now, not a same-page scroll (React Router doesn't
 * auto-scroll to a #hash the way a full page load does, so that never
 * actually worked as navigation).
 */
export default function Dashboard() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [hangouts, setHangouts] = useState([])
  const [inbox, setInbox] = useState([])
  const [nearbyPeople, setNearbyPeople] = useState([])
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [statusFeed, setStatusFeed] = useState([])
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    try {
      const meData = await api.me()
      setMe(meData)

      // Only pass coordinates when we actually have a live nearby session --
      // otherwise the backend correctly falls back to its coarse "recent open
      // hangouts, no distance sort" listing instead of pretending to filter.
      const hangoutParams = meData.nearby_visible && meData.current_lat != null
        ? { lat: meData.current_lat, lng: meData.current_lng }
        : {}

      const [hangoutData, inboxData] = await Promise.all([
        api.nearbyHangouts(hangoutParams),
        api.holaInbox(),
      ])
      setHangouts(hangoutData)
      setInbox(inboxData)

      api.statusFeed().then(setStatusFeed).catch(() => setStatusFeed([]))

      if (meData.nearby_visible) {
        api.nearbyUsers().then(setNearbyPeople).catch(() => setNearbyPeople([]))
      }
    } catch (err) {
      if (err.status === 401) {
        clearToken()
        navigate('/login')
      } else {
        setError(err.message)
      }
    }
  }, [navigate])

  useEffect(() => {
    loadAll()
    // an ended hangout should drop off this list on its own
    const t = setInterval(loadAll, 60000)
    return () => clearInterval(t)
  }, [loadAll])

  async function handleJoin(hangout) {
    if (hangout.is_paid) {
      navigate(`/hangouts/${hangout.id}`)
      return
    }
    try {
      await api.joinHangout(hangout.id)
      loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleNearby() {
    setNearbyBusy(true)
    try {
      if (me.nearby_visible) {
        await api.endNearby()
      } else {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject)
        )
        await api.startNearby(position.coords.latitude, position.coords.longitude)
      }
      await loadAll()
    } catch (err) {
      setError(err.message || 'Could not update nearby visibility -- location permission needed')
    } finally {
      setNearbyBusy(false)
    }
  }

  if (!me) {
    return <div className="app"><main className="main"><p>Loading...</p></main></div>
  }

  const liveHangout = hangouts.find((h) => h.member_count > 0)
  const unreadCount = inbox.length

  return (
    <div className="app">
      <Sidebar active="home" me={me} unreadCount={unreadCount} />

      <main className="main">

        <div className="topbar">
          <div className="greeting">
            <h1>Hey, {me.display_name.split(' ')[0]}.</h1>
            <p>
              {unreadCount > 0 ? `${unreadCount} hola thread${unreadCount === 1 ? '' : 's'}` : 'No new holas'}
              {', '}{hangouts.length} hangout{hangouts.length === 1 ? '' : 's'} nearby right now.
            </p>
          </div>
          <div className="nearby-pill">
            <div className="txt">
              {me.nearby_visible
                ? <>Visible nearby <strong>now</strong></>
                : "Not visible — turn on to see who's around"}
            </div>
            <button
              className="switch"
              style={!me.nearby_visible ? { background: 'var(--surface-3)' } : undefined}
              aria-label="Toggle nearby visibility"
              onClick={toggleNearby}
              disabled={nearbyBusy}
            />
          </div>
        </div>

        <StatusBar feed={statusFeed} me={me} onChanged={() => api.statusFeed().then(setStatusFeed).catch(() => {})} />

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

        <div className="grid">

          <div className="col-main">
            <div className="panel">
              <div className="panel-head">
                <h2>Hangouts near you</h2>
                <span className="see-all">{hangouts.length} live</span>
              </div>

              {hangouts.length === 0 && (
                <p style={{ color: 'var(--slate)', fontSize: 14 }}>
                  Nothing nearby right now. <Link to="/hangouts/new" style={{ color: 'var(--lime)' }}>Start one →</Link>
                </p>
              )}

              {hangouts.slice(0, 4).map((h) => (
                <div className="hangout-card" key={h.id}>
                  <div className="hangout-thumb">{h.icon}</div>
                  <div className="hangout-info">
                    <Link to={`/hangouts/${h.id}`} style={{ color: 'inherit' }}>
                      <div className="title">{h.title}</div>
                    </Link>
                    <div className="meta">
                      {h.distance_mi != null ? `${h.distance_mi} MI · ` : ''}
                      {h.member_count}/{h.capacity} HERE{h.is_paid ? ` · ${formatKes(h.price_cents).toUpperCase()}` : ''}
                    </div>
                    <div className="stack">
                      {Array.from({ length: Math.min(h.member_count, 4) }).map((_, i) => <span key={i}></span>)}
                    </div>
                  </div>
                  <button className="join-btn" onClick={() => handleJoin(h)}>
                    {h.is_paid ? 'View' : 'Join'}
                  </button>
                </div>
              ))}

              {hangouts.length > 4 && (
                <Link to="/nearby" className="nearby-cta" style={{ display: 'block', marginTop: 8 }}>
                  See all {hangouts.length} nearby →
                </Link>
              )}

              {liveHangout && (
                <div className="chat-preview">
                  <div className="chat-preview-head">
                    <span className="live-dot"></span>
                    <span className="title">{liveHangout.title}</span>
                    <span className="count">{liveHangout.member_count} HERE</span>
                  </div>
                  <Link to={`/hangouts/${liveHangout.id}`} className="nearby-cta" style={{ display: 'block' }}>
                    Continue chat →
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="col-side">
            <div className="panel">
              <div className="panel-head">
                <h2>Hola inbox</h2>
                <Link to="/hola" className="see-all">See all →</Link>
              </div>

              {inbox.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 13 }}>No conversations yet.</p>}

              {inbox.slice(0, 4).map((thread) => (
                <Link to={`/hola/${thread.with_user_id}`} className="hola-row" key={thread.with_user_id}>
                  <div className="avatar" style={photoStyle(thread.other_user)}></div>
                  <div className="hola-info">
                    <div className="top-line">
                      <span className="name">{thread.other_user?.display_name || 'Unknown'}</span>
                    </div>
                    <div className="preview unread">
                      {thread.last_message_is_mine ? 'You: ' : ''}{thread.last_message.body}
                    </div>
                  </div>
                  <div className="unread-dot"></div>
                </Link>
              ))}
            </div>

            <div className="panel nearby-panel">
              <div className="panel-head">
                <h2>Nearby now</h2>
                <Link to="/nearby" className="see-all">See all →</Link>
              </div>

              {!me.nearby_visible && (
                <p style={{ color: 'var(--slate)', fontSize: 13 }}>Turn on nearby to see who's around.</p>
              )}

              {me.nearby_visible && nearbyPeople.length === 0 && (
                <p style={{ color: 'var(--slate)', fontSize: 13 }}>No one else nearby right now.</p>
              )}

              {me.nearby_visible && nearbyPeople.slice(0, 4).map((p) => (
                <Link to={`/hola/${p.id}`} className="venue-row" key={p.id} style={{ display: 'flex' }}>
                  <div>
                    <div className="name">{p.display_name}</div>
                    <div className="meta">{p.distance_mi} MI AWAY</div>
                  </div>
                  <span className="count">{p.is_verified ? '✓' : ''}</span>
                </Link>
              ))}

              {me.nearby_visible && (
                <button onClick={toggleNearby} className="nearby-cta" style={{ width: '100%', background: 'none', border: '1px dashed var(--line)' }}>
                  Turn off visibility — you'll disappear instantly
                </button>
              )}
            </div>
          </div>

        </div>

      </main>

    </div>
  )
}
