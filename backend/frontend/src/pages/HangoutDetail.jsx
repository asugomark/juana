import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { connectSocket } from '../api/socket'
import PaygateModal from '../components/PaygateModal'
import MediaAttachButton from '../components/MediaAttachButton'
import MessageBubble from '../components/MessageBubble'
import ReportModal from '../components/ReportModal'
import StarRating from '../components/StarRating'
import { photoStyle } from '../utils/avatar'
import { getPendingInviteRef, getPendingInviteHangoutId, clearPendingInvite } from '../utils/invite'
import './HangoutDetail.css'

/**
 * Two separate paygate-style modals live on this page, and they are NOT
 * interchangeable even though they look alike:
 *   - JoinPaidHangoutModal below hits POST /hangouts/:id/join with a phone
 *     number -- it both adds you as a member AND kicks off the SasaPay
 *     collection for the hangout's pass tier.
 *   - PaygateModal (imported) hits POST /passes/purchase -- a standalone
 *     pass with no hangout attached, used when an EXISTING member's pass
 *     has expired mid-conversation.
 * Using the wrong one for the wrong situation either takes someone's phone
 * number without joining them to anything, or charges for a generic pass
 * when what they actually wanted was into this specific hangout.
 */
function JoinPaidHangoutModal({ hangout, onClose, onJoined }) {
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState('form') // form | waiting | error
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => () => clearInterval(pollRef.current), [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      setError('Enter your number in the format 2547XXXXXXXX')
      return
    }
    setStage('waiting')
    try {
      const ref = getPendingInviteHangoutId() === hangout.id ? getPendingInviteRef() : null
      await api.joinHangout(hangout.id, phone, ref)
      pollRef.current = setInterval(async () => {
        const status = await api.passStatus()
        if (status.has_active_pass) {
          clearInterval(pollRef.current)
          clearPendingInvite()
          onJoined()
        }
      }, 3000)
    } catch (err) {
      setStage('error')
      setError(err.message)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        {stage === 'form' && (
          <form onSubmit={handleSubmit}>
            <div className="modal-icon">{hangout.icon}</div>
            <h2>Join {hangout.title}</h2>
            <p className="lede">This is a paid hangout — joining grants a {hangout.pass_tier} pass, which also unlocks messaging everywhere else on Juana.</p>
            <div style={{ marginTop: 20 }}>
              <input
                type="tel"
                placeholder="2547XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '13px 16px', color: 'var(--paper)', fontSize: 14,
                }}
              />
            </div>
            {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 8 }}>{error}</p>}
            <button type="submit" className="unlock-btn">Request payment to join</button>
          </form>
        )}
        {stage === 'waiting' && (
          <div>
            <div className="modal-icon">📱</div>
            <h2>Check your phone</h2>
            <p className="lede">Approve the payment prompt sent to {phone}. This closes automatically once it's confirmed.</p>
            <button className="unlock-btn" onClick={onClose} type="button">Close — I'll check back</button>
          </div>
        )}
        {stage === 'error' && (
          <div>
            <div className="modal-icon">⚠</div>
            <h2>Couldn't start the payment</h2>
            <p className="lede" style={{ color: 'var(--coral)' }}>{error}</p>
            <button className="unlock-btn" onClick={() => setStage('form')} type="button">Try again</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HangoutDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [me, setMe] = useState(null)
  const [hangout, setHangout] = useState(null)
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [isMember, setIsMember] = useState(false)
  const [locked, setLocked] = useState(false) // true once a send has been blocked by the pass gate
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showPaygate, setShowPaygate] = useState(false)
  const [reportingMember, setReportingMember] = useState(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [myRating, setMyRating] = useState(null)
  const [error, setError] = useState(null)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)

  const loadAll = useCallback(async () => {
    try {
      const [meData, hangoutData, memberData] = await Promise.all([
        api.me(),
        api.getHangout(id),
        api.hangoutMembers(id),
      ])
      setMe(meData)
      setHangout(hangoutData)
      setMembers(memberData)
      const memberNow = memberData.some((m) => m.user.id === meData.id)
      setIsMember(memberNow)

      if (memberNow) {
        const msgs = await api.hangoutMessages(id)
        setMessages(msgs)
        api.myRating(id).then(setMyRating).catch(() => setMyRating(null))
      }
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!isMember) return
    const socket = connectSocket()
    socketRef.current = socket
    socket.emit('join_hangout', { hangout_id: id })
    socket.on('hangout_message', (msg) => setMessages((prev) => [...prev, msg]))
    return () => {
      socket.emit('leave_hangout', { hangout_id: id })
      socket.off('hangout_message')
    }
  }, [id, isMember])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleJoin() {
    if (hangout.is_paid) {
      setShowJoinModal(true)
      return
    }
    try {
      const ref = getPendingInviteHangoutId() === id ? getPendingInviteRef() : null
      await api.joinHangout(id, undefined, ref)
      clearPendingInvite()
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLeave() {
    try {
      await api.leaveHangout(id)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      await api.sendHangoutMessage(id, draft)
      setDraft('')
      setLocked(false)
    } catch (err) {
      if (err.status === 402) {
        setLocked(true) // shows the locked-composer bar; PaygateModal opens only when they tap "Get a pass"
      } else {
        setError(err.message)
      }
    }
  }

  async function handleSendMedia(file) {
    try {
      await api.sendHangoutMedia(id, file)
      setLocked(false)
      // No local append needed -- the socket 'hangout_message' event we're already
      // listening to delivers this same message back to us, same as any other sender.
    } catch (err) {
      if (err.status === 402) {
        setLocked(true)
      } else {
        setError(err.message)
      }
    }
  }

  function handleCopyInviteLink() {
    const link = `${window.location.origin}/invite/${id}?ref=${me.id}`
    navigator.clipboard.writeText(link).then(() => {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  async function handleSubmitRating(stars) {
    try {
      await api.submitRating(id, stars, myRating?.comment || '')
      setMyRating({ stars, comment: myRating?.comment || null })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(memberUserId) {
    if (!confirm('Remove this person from the hangout?')) return
    try {
      await api.removeMember(id, memberUserId)
      await loadAll()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!hangout || !me) return <div style={{ padding: 40 }}>Loading…</div>

  const isHost = hangout.host?.id === me.id
  const invitedByMeCount = members.filter((m) => m.invited_by_user_id === me.id).length
  const timeAgo = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.round(mins / 60)}h ago`
  }

  return (
    <div className="screen">
      <div className="chat-col">
        <header className="header">
          <Link to="/dashboard" className="back-btn" aria-label="Back to hangouts">←</Link>
          <div className="thumb-lg">{hangout.icon}</div>
          <div className="header-info">
            <div className="title-row">
              <h1>{hangout.title}</h1>
              <span className="live-badge"><span className="dot"></span>LIVE</span>
            </div>
            <div className="sub">
              {hangout.venue?.name ? `${hangout.venue.name} · ` : ''}
              STARTED {timeAgo(hangout.starts_at)} · {hangout.member_count} HERE
            </div>
          </div>
          <div className="header-actions">
            <div className="who-stack">
              {members.slice(0, 5).map((m) => <span key={m.user.id} style={photoStyle(m.user)}></span>)}
            </div>
            {isMember && (
              <button className="leave-btn" onClick={handleCopyInviteLink}>
                {inviteCopied ? 'Copied ✓' : 'Invite'}
              </button>
            )}
            {isMember ? (
              <button className="leave-btn" onClick={handleLeave}>Leave</button>
            ) : (
              <button className="leave-btn" style={{ color: 'var(--lime)', borderColor: 'rgba(198,241,53,0.4)' }} onClick={handleJoin}>
                {hangout.is_paid ? `Join · ${hangout.pass_tier} pass` : 'Join'}
              </button>
            )}
          </div>
        </header>

        {error && <p style={{ color: 'var(--coral)', padding: '8px 28px' }}>{error}</p>}

        {!isMember ? (
          <div style={{ padding: 40, color: 'var(--slate)' }}>
            {hangout.description}
            <p style={{ marginTop: 16 }}>Join to see the conversation.</p>
          </div>
        ) : (
          <>
            <div className="messages">
              <div className="system-msg">You're in {hangout.title}</div>
              {messages.map((m) => (
                <div className="msg" key={m.id}>
                  <div className="msg-avatar" style={photoStyle(m.sender)}></div>
                  <div className="msg-content">
                    <div className="msg-meta">
                      <span className="name">{m.sender.display_name}</span>
                      {m.sender.id === hangout.host?.id && <span className="host-tag">HOST</span>}
                      {m.sender.id !== me.id && (
                        <Link to={`/hola/${m.sender.id}`} className="dm-link">MESSAGE {m.sender.display_name.split(' ')[0].toUpperCase()} →</Link>
                      )}
                      <span className="time">{new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <MessageBubble message={m} />
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {locked ? (
              <div className="locked-composer">
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
                    placeholder="Message the group…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" aria-label="Send message">→</button>
                </form>
                <div className="composer-note">Visible to everyone in this hangout · leave anytime</div>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="side-rail">
        <div className="rail-section">
          <h2>About this hangout</h2>
          <div className="info-card">
            <div className="venue-name">{hangout.venue?.name || 'No venue set'}</div>
            {hangout.venue?.address && <div className="venue-addr">{hangout.venue.address}</div>}
            <div className="info-row"><span className="k">HOST</span><span className="v">{hangout.host?.display_name}</span></div>
            <div className="info-row"><span className="k">STARTED</span><span className="v">{timeAgo(hangout.starts_at)}</span></div>
            <div className="info-row"><span className="k">CAPACITY</span><span className="v">{hangout.member_count}/{hangout.capacity}</span></div>
          </div>
          {invitedByMeCount > 0 && (
            <p style={{ fontSize: 12, color: 'var(--lime)', marginTop: 10 }}>
              {invitedByMeCount} {invitedByMeCount === 1 ? 'person' : 'people'} joined via your invite →
            </p>
          )}
          {hangout.description && <p className="desc">{hangout.description}</p>}
        </div>

        <div className="rail-section">
          <h2>Who's here · {members.length}</h2>
          {members.map((m) => (
            <div className="member-row" key={m.user.id}>
              <Link to={`/profile/${m.user.id}`} style={{ display: 'contents' }}>
                <div className={`avatar ${m.role === 'host' ? 'host' : ''}`} style={photoStyle(m.user)}></div>
                <div className="member-info">
                  <div className="name">{m.user.display_name}{m.user.id === me.id ? ' (you)' : ''}</div>
                  <div className="tag">{m.role === 'host' ? 'Host' : `Joined ${timeAgo(m.joined_at)}`}</div>
                </div>
              </Link>
              {m.user.id !== me.id && (
                <>
                  <Link to={`/hola/${m.user.id}`} className="msg-btn">MESSAGE →</Link>
                  <button
                    className="msg-btn"
                    style={{ opacity: 1, color: 'var(--slate)', marginLeft: 8, background: 'none', border: 'none' }}
                    onClick={() => setReportingMember(m.user)}
                  >
                    REPORT
                  </button>
                </>
              )}
              {isHost && m.user.id !== me.id && (
                <button
                  className="msg-btn"
                  style={{ opacity: 1, color: 'var(--coral)', marginLeft: 8, background: 'none', border: 'none' }}
                  onClick={() => handleRemove(m.user.id)}
                >
                  REMOVE
                </button>
              )}
            </div>
          ))}
        </div>

        {reportingMember && (
          <ReportModal
            reportedUserId={reportingMember.id}
            reportedUserName={reportingMember.display_name}
            hangoutId={id}
            onClose={() => setReportingMember(null)}
          />
        )}

        {isMember && !isHost && (
          <div className="rail-section">
            <h2>Rate this hangout</h2>
            <div className="info-card">
              <StarRating value={myRating?.stars || 0} onChange={handleSubmitRating} size={22} />
              {myRating && (
                <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 8 }}>
                  Rated — tap a star to change it.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="rail-section">
          <div className="safety-strip">
            <span className="ic">◎</span>
            <span>{hangout.host?.display_name} can remove anyone from this hangout. See something off? Report or leave — either takes one tap.</span>
          </div>
        </div>
      </aside>

      {showJoinModal && (
        <JoinPaidHangoutModal
          hangout={hangout}
          onClose={() => setShowJoinModal(false)}
          onJoined={async () => {
            setShowJoinModal(false)
            await loadAll()
          }}
        />
      )}

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
