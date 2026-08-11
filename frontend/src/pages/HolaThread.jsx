import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { connectSocket } from '../api/socket'
import PaygateModal from '../components/PaygateModal'
import MediaAttachButton from '../components/MediaAttachButton'
import MessageBubble from '../components/MessageBubble'
import { photoStyle } from '../utils/avatar'
import './HangoutDetail.css' // reuses the same .header/.messages/.msg/.bubble/.composer/.locked-composer styles

export default function HolaThread() {
  const { userId } = useParams()

  const [me, setMe] = useState(null)
  const [otherUser, setOtherUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [showPaygate, setShowPaygate] = useState(false)
  const [error, setError] = useState(null)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)

  const loadAll = useCallback(async () => {
    try {
      const [meData, otherData, msgs] = await Promise.all([
        api.me(),
        api.getUserProfile(userId),
        api.holaThread(userId),
      ])
      setMe(meData)
      setOtherUser(otherData)
      setMessages(msgs)
    } catch (err) {
      setError(err.message)
    }
  }, [userId])

  useEffect(() => { loadAll() }, [loadAll])

  // Live delivery: join our own inbox room once, listen for hola_message events
  // for the whole session (not per-thread) since a message could arrive from
  // anyone -- but only append it here if it belongs to the thread we're viewing.
  useEffect(() => {
    if (!me?.id) return
    const socket = connectSocket()
    socketRef.current = socket
    socket.emit('join_inbox', { user_id: me.id })

    function handleIncoming(msg) {
      const belongsToThisThread = msg.sender.id === userId || msg.recipient_id === userId
      if (belongsToThisThread) {
        setMessages((prev) => [...prev, msg])
      }
    }
    socket.on('hola_message', handleIncoming)
    return () => socket.off('hola_message', handleIncoming)
  }, [me?.id, userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      const msg = await api.sendHola(userId, draft)
      setMessages((prev) => [...prev, msg])
      setDraft('')
      setLocked(false)
    } catch (err) {
      if (err.status === 402) {
        setLocked(true)
      } else {
        setError(err.message)
      }
    }
  }

  async function handleSendMedia(file) {
    try {
      // Emit only reaches the RECIPIENT's room (see routes/media.py), not ours --
      // so unlike the hangout screen, we have to append our own send locally,
      // same as handleSend above already does for text.
      const msg = await api.sendHolaMedia(userId, file)
      setMessages((prev) => [...prev, msg])
      setLocked(false)
    } catch (err) {
      if (err.status === 402) {
        setLocked(true)
      } else {
        setError(err.message)
      }
    }
  }

  if (!otherUser || !me) return <div style={{ padding: 40 }}>Loading…</div>

  return (
    <div className="screen" style={{ gridTemplateColumns: '1fr' }}>
      <div className="chat-col">
        <header className="header">
          <Link to="/hola" className="back-btn" aria-label="Back to inbox">←</Link>
          <Link
            to={`/profile/${otherUser.id}`}
            className="thumb-lg"
            style={photoStyle(otherUser) || { background: 'linear-gradient(135deg, var(--coral), var(--lime))' }}
          ></Link>
          <div className="header-info">
            <div className="title-row">
              <Link to={`/profile/${otherUser.id}`} style={{ color: 'inherit' }}>
                <h1>{otherUser.display_name}</h1>
              </Link>
              {otherUser.is_verified && (
                <span className="live-badge" style={{ color: 'var(--lime)', background: 'rgba(198,241,53,0.12)' }}>✓ VERIFIED</span>
              )}
            </div>
            <div className="sub">{otherUser.occupation || 'Hola'}</div>
          </div>
        </header>

        {error && <p style={{ color: 'var(--coral)', padding: '8px 28px' }}>{error}</p>}

        <div className="messages">
          {messages.length === 0 && (
            <div className="system-msg">Say hi — this is the start of your conversation with {otherUser.display_name}</div>
          )}
          {messages.map((m) => (
            <div className="msg" key={m.id}>
              <div className="msg-avatar" style={photoStyle(m.sender)}></div>
              <div className="msg-content">
                <div className="msg-meta">
                  <span className="name">{m.sender.id === me.id ? 'You' : m.sender.display_name}</span>
                  <span className="time">{new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <MessageBubble message={m} />
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {locked ? (
          <div className="locked-composer" style={{ position: 'static' }}>
            <div className="locked-inner">
              <span className="lock-ic">🔒</span>
              <span className="txt">Your pass has ended — you can still read, but not send</span>
              <button className="cta" onClick={() => setShowPaygate(true)}>Get a pass</button>
            </div>
          </div>
        ) : (
          <div className="composer">
            <form className="composer-inner" onSubmit={handleSend}>
              <MediaAttachButton onSelect={handleSendMedia} />
              <input
                type="text"
                placeholder="Message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" aria-label="Send message">→</button>
            </form>
          </div>
        )}
      </div>

      {showPaygate && (
        <PaygateModal
          onClose={() => setShowPaygate(false)}
          onPurchased={() => {
            setShowPaygate(false)
            setLocked(false)
          }}
        />
      )}
    </div>
  )
}
