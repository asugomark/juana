import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import Sidebar from '../components/Sidebar'
import { photoStyle } from '../utils/avatar'
import './Dashboard.css'
import './Nearby.css'

/**
 * How Nearby actually works, end to end:
 *
 * 1. Visibility is a SESSION, not a setting. Tapping the toggle grabs your
 *    current browser geolocation once and sends it to POST /nearby/start,
 *    which stores current_lat/current_lng on your User row plus an expiry
 *    (default 2h — see utils/geo.py). It does NOT track you continuously;
 *    your position is a single snapshot from the moment you turned it on.
 * 2. While visible, two independent things become possible:
 *      - GET /nearby/users returns other users who ALSO currently have an
 *        active nearby session, sorted by distance from your snapshot.
 *      - GET /hangouts/nearby, when given your lat/lng, sorts and filters
 *        hangouts by real distance instead of just listing everything open.
 * 3. Turning it off (POST /nearby/end) doesn't just hide you — it deletes
 *    current_lat/current_lng from your row entirely. There's nothing left
 *    to leak even if someone had a stale reference to it.
 * 4. If you never turn it on, hangout browsing still works — it just falls
 *    back to an unsorted "recently created, open" list with no distance
 *    filtering, since there's no coordinate to sort against.
 *
 * Radar note: the backend only ever gives us DISTANCE, never bearing/angle —
 * that's deliberate (see the privacy note on the safety strip below: "nothing
 * more precise than roughly how far away"). So the angle each ping sits at on
 * the radar is evenly spread by index, not a real compass direction. Distance
 * FROM CENTER does map to real distance_mi. Don't read direction off this as
 * meaningful — only proximity.
 */
function radarPosition(index, total, distanceMi, maxDistance) {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2
  const radiusPct = 18 + (Math.min(distanceMi / (maxDistance || 1), 1) * 34) // 18%–52% from center
  const top = 50 + radiusPct * Math.sin(angle)
  const left = 50 + radiusPct * Math.cos(angle)
  return { top: `${top}%`, left: `${left}%` }
}

export default function Nearby() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [people, setPeople] = useState([])
  const [hangouts, setHangouts] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const meData = await api.me()
      setMe(meData)

      if (meData.nearby_visible && meData.current_lat != null) {
        const [peopleData, hangoutData] = await Promise.all([
          api.nearbyUsers(),
          api.nearbyHangouts({ lat: meData.current_lat, lng: meData.current_lng }),
        ])
        setPeople(peopleData)
        setHangouts(hangoutData)
      } else {
        setPeople([])
        setHangouts(await api.nearbyHangouts()) // coarse fallback, no distance data
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

  useEffect(() => { load() }, [load])

  async function toggleNearby() {
    setBusy(true)
    setError(null)
    try {
      if (me.nearby_visible) {
        await api.endNearby()
      } else {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        )
        await api.startNearby(position.coords.latitude, position.coords.longitude)
      }
      await load()
    } catch (err) {
      setError(err.message || 'Could not update visibility — check your location permission')
    } finally {
      setBusy(false)
    }
  }

  // Radar entries: people + hangouts-with-distance, laid out around the center.
  const radarItems = useMemo(() => {
    const items = [
      ...people.map((p) => ({ type: 'person', label: p.display_name, distance: p.distance_mi, verified: p.is_verified })),
      ...hangouts.filter((h) => h.distance_mi != null).map((h) => ({ type: 'hangout', label: h.title, distance: h.distance_mi, memberCount: h.member_count })),
    ]
    const maxDistance = Math.max(...items.map((i) => i.distance), 0.5)
    return items.map((item, i) => ({ ...item, pos: radarPosition(i, items.length, item.distance, maxDistance) }))
  }, [people, hangouts])

  if (!me) return <div className="app"><main className="main"><p>Loading…</p></main></div>

  const venueName = hangouts.find((h) => h.venue?.name)?.venue?.name

  return (
    <div className="app">
      <Sidebar active="nearby" me={me} />

      <main className="main">
        <div className="topbar">
          <div className="greeting">
            <h1>Nearby</h1>
            <p>See who's around and what's happening — only while you're visible.</p>
          </div>
          <div className="nearby-pill">
            <div className="txt">{me.nearby_visible ? <>Visible <strong>now</strong></> : 'Not visible'}</div>
            <button
              className="switch"
              style={!me.nearby_visible ? { background: 'var(--surface-3)' } : undefined}
              aria-label="Toggle nearby visibility"
              onClick={toggleNearby}
              disabled={busy}
            />
          </div>
        </div>

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

        {!me.nearby_visible ? (
          <div className="off-state">
            <div className="ic">◎</div>
            <h2>You're not visible right now</h2>
            <p>Turn on Nearby to see who else is around and what's happening near you. Nobody sees you unless you switch this on — and you can disappear again anytime, instantly.</p>
            <button className="off-btn" onClick={toggleNearby} disabled={busy}>
              {busy ? 'Getting your location…' : 'Turn on Nearby'}
            </button>
          </div>
        ) : (
          <>
            <div className="radar-panel">
              <div className="radar-frame" aria-hidden="true">
                <div className="ring"></div>
                <div className="ring r2"></div>
                <div className="ring r3"></div>
                <div className="ring r4"></div>
                <div className="sweep"></div>
                <div className="you-dot"></div>
                <div className="you-label">YOU</div>

                {radarItems.map((item, i) => (
                  <div key={i}>
                    <div className={`ping ${item.type === 'hangout' ? 'lime' : ''}`} style={{ ...item.pos, animationDelay: `${(i % 5) * 0.4}s` }}></div>
                    <span className="solo-tag" style={{ top: `calc(${item.pos.top} - 14px)`, left: `calc(${item.pos.left} + 10px)` }}>
                      {item.label} · {item.distance}mi
                    </span>
                  </div>
                ))}
              </div>

              <div className="radar-side">
                <span className="eyebrow">Live {venueName ? `at ${venueName}` : 'near you'}</span>
                <h2 style={{ marginTop: 8 }}>{venueName || 'Your area'}</h2>
                <p>Anyone else with Nearby turned on shows up on your radar — nothing more precise than roughly how far away. Turn it off and you disappear instantly, for everyone.</p>
                <div className="radar-stat">
                  <div><div className="num">{people.length}</div><div className="lbl">PEOPLE NEARBY</div></div>
                  <div><div className="num">{hangouts.length}</div><div className="lbl">HANGOUTS OPEN</div></div>
                </div>
                <div className="venue-chip">
                  <span className="ic">◎</span>
                  <span>Visible this session</span>
                </div>
              </div>
            </div>

            <div className="grid">
              <div className="panel">
                <div className="panel-head">
                  <h2>Hangouts here</h2>
                  <span className="see-all">{hangouts.length}</span>
                </div>

                {hangouts.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 14 }}>Nothing open right now.</p>}

                {hangouts.map((h) => (
                  <div className="hangout-row" key={h.id}>
                    <div className="ic">{h.icon}</div>
                    <div className="info">
                      <Link to={`/hangouts/${h.id}`} style={{ color: 'inherit' }}>
                        <div className="t">{h.title}</div>
                      </Link>
                      <div className="m">
                        {h.distance_mi != null ? `${h.distance_mi} MI · ` : ''}
                        {h.member_count} HERE{h.is_paid ? ` · ${h.pass_tier.toUpperCase()} PASS` : ''}
                      </div>
                    </div>
                    <Link to={`/hangouts/${h.id}`} className="join-btn">View</Link>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>People here</h2>
                  <span className="see-all">{people.length}</span>
                </div>

                {people.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 13 }}>No one else nearby right now.</p>}

                {people.map((p) => (
                  <Link to={`/profile/${p.id}`} className="person-row" key={p.id}>
                    <div className="person-avatar" style={photoStyle(p)}></div>
                    <div className="person-info">
                      <div className="top">
                        <span className="name">{p.display_name}</span>
                        {p.is_verified
                          ? <span className="verified-mark">✓</span>
                          : <span className="unverified-mark">NOT VERIFIED</span>}
                      </div>
                      <div className="m">{p.distance_mi} MI AWAY</div>
                    </div>
                    <span className="msg-mini">HOLA →</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="safety-strip">
              <span className="ic">🛡</span>
              <span><strong>Only people who've turned this on can see you</strong> — nothing here is passive tracking. Distance shown is approximate, never exact. Meeting up? Keep it public and let someone know where you'll be.</span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
