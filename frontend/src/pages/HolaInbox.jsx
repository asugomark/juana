import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearToken } from '../api/client'
import Sidebar from '../components/Sidebar'
import { photoStyle } from '../utils/avatar'
import './Dashboard.css' // reuses .app/.main/.panel/.hola-row etc — same hub-page shell as Dashboard
import './HolaInbox.css'

export default function HolaInbox() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [inbox, setInbox] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [meData, inboxData] = await Promise.all([api.me(), api.holaInbox()])
      setMe(meData)
      setInbox(inboxData)
      // Suggestions are ranked by interest overlap -- if the person hasn't
      // filled in interests on their profile yet, the backend returns an
      // empty list rather than an unranked "everyone" dump. See routes/users.py.
      api.userSuggestions().then(setSuggestions).catch(() => setSuggestions([]))
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

  if (!me) return <div className="app"><main className="main"><p>Loading…</p></main></div>

  return (
    <div className="app">
      <Sidebar active="hola" me={me} unreadCount={inbox.length} />

      <main className="main">
        <div className="topbar">
          <div className="greeting">
            <h1>Hola</h1>
            <p>{inbox.length === 0 ? 'No conversations yet' : `${inbox.length} conversation${inbox.length === 1 ? '' : 's'}`}</p>
          </div>
        </div>

        {error && <p style={{ color: 'var(--coral)', marginBottom: 16 }}>{error}</p>}

        <div className="panel" style={{ maxWidth: 640, marginBottom: 24 }}>
          {inbox.length === 0 && (
            <p style={{ color: 'var(--slate)', fontSize: 14 }}>
              Join a hangout and message someone from there, or find people on{' '}
              <Link to="/nearby" style={{ color: 'var(--lime)' }}>Nearby</Link>.
            </p>
          )}

          {inbox.map((thread) => (
            <Link to={`/hola/${thread.with_user_id}`} className="hola-row" key={thread.with_user_id}>
              <div className="avatar" style={photoStyle(thread.other_user)}></div>
              <div className="hola-info">
                <div className="top-line">
                  <span className="name">
                    {thread.other_user?.display_name || 'Unknown'}
                    {thread.other_user?.is_verified && <span style={{ color: 'var(--lime)', marginLeft: 5, fontSize: 11 }}>✓</span>}
                  </span>
                  <span className="time">{new Date(thread.last_message.created_at).toLocaleDateString()}</span>
                </div>
                <div className="preview unread">
                  {thread.last_message_is_mine ? 'You: ' : ''}{thread.last_message.body}
                </div>
              </div>
              <div className="unread-dot"></div>
            </Link>
          ))}
        </div>

        {suggestions.length > 0 && (
          <div className="panel" style={{ maxWidth: 640 }}>
            <div className="panel-head">
              <h2>People you might like</h2>
              <span className="see-all">SHARED INTERESTS</span>
            </div>
            {suggestions.map((p) => (
              <Link to={`/profile/${p.id}`} className="suggestion-row" key={p.id}>
                <div className="avatar" style={photoStyle(p)}></div>
                <div className="suggestion-info">
                  <div className="top-line">
                    <span className="name">{p.display_name}{p.age ? `, ${p.age}` : ''}</span>
                    {p.is_verified && <span style={{ color: 'var(--lime)', fontSize: 11 }}>✓</span>}
                  </div>
                  <div className="shared-tags">
                    {p.shared_interests.slice(0, 3).map((tag) => (
                      <span className="tag-mini" key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <span className="msg-mini">HOLA →</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
