import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatKes } from '../utils/price'
import { normalizePhone } from '../utils/phone'
import { connectSocket } from '../api/socket'
import PaygateModal from '../components/PaygateModal'
import MediaAttachButton from '../components/MediaAttachButton'
import MessageBubble from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'
import Icon from '../components/NavIcons'
import ReportModal from '../components/ReportModal'
import KycGateModal from '../components/KycGateModal'
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
const POLL_MS = 3000
const GIVE_UP_MS = 120000 // after this, stop saying "check your phone" and offer to resend

function JoinPaidHangoutModal({ hangout, onClose, onJoined }) {
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState('form') // form | waiting | slow | failed | error
  const [error, setError] = useState(null)
  const [sentTo, setSentTo] = useState('')
  const pollRef = useRef(null)
  const startedAt = useRef(0)

  const stopPolling = () => clearInterval(pollRef.current)
  useEffect(() => stopPolling, [])

  // Asks "how did THIS payment go?" — not "does this person hold any pass?". The old check said
  // yes instantly to anyone with an old pass, never said no to a cancelled prompt, and had no timeout.
  function startPolling() {
    stopPolling()
    startedAt.current = Date.now()
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.joinStatus(hangout.id)
        if (s.payment === 'completed' || s.is_member) {
          stopPolling()
          clearPendingInvite()
          onJoined()
          return
        }
        if (s.payment === 'failed') {
          stopPolling()
          setStage('failed')
          return
        }
      } catch {
        /* a dropped request shouldn't end the wait — try again next tick */
      }
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        stopPolling()
        setStage('slow')
      }
    }, POLL_MS)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const msisdn = normalizePhone(phone)
    if (!msisdn) {
      setError('Enter a Safaricom number, like 0712 345 678')
      return
    }
    setSentTo(msisdn)
    setStage('waiting')
    try {
      const ref = getPendingInviteHangoutId() === hangout.id ? getPendingInviteRef() : null
      await api.joinHangout(hangout.id, msisdn, ref)
      startPolling()
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
            <p className="lede">This is a paid hangout. Entry is {formatKes(hangout.price_cents)}, and it includes a {{ day: '1-day', week: '1-week', month: '1-month' }[hangout.pass_tier]} messaging pass, so you can chat here and everywhere else on Juana.</p>
            <div style={{ marginTop: 20 }}>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-label="M-Pesa phone number"
                style={{
                  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '13px 16px', color: 'var(--paper)', fontSize: 16,
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
            <p className="lede">Approve the payment prompt sent to {sentTo}. This closes by itself once it's confirmed.</p>
            <button className="unlock-btn" onClick={onClose} type="button">Close — I'll check back</button>
          </div>
        )}
        {stage === 'slow' && (
          <div>
            <div className="modal-icon">⏳</div>
            <h2>Still waiting…</h2>
            <p className="lede">We haven't had confirmation yet. If you already approved the prompt, give it a minute — you'll be let in the moment it lands. If nothing reached your phone, check the number and send it again.</p>
            <button className="unlock-btn" onClick={() => setStage('form')} type="button">Send the prompt again</button>
            <button className="later-btn" onClick={onClose} type="button" style={{ marginTop: 10, width: '100%' }}>Close</button>
          </div>
        )}
        {stage === 'failed' && (
          <div>
            <div className="modal-icon">⚠</div>
            <h2>Payment wasn't completed</h2>
            <p className="lede">It was cancelled or didn't go through (wrong PIN, low balance, or the prompt timed out). You haven't joined and you haven't been charged.</p>
            <button className="unlock-btn" onClick={() => setStage('form')} type="button">Try again</button>
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
  const [passStartsAt, setPassStartsAt] = useState(null) // set when the block is "your pass hasn't started yet"
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showKyc, setShowKyc] = useState(false)
  const [notice, setNotice] = useState(null) // calm, non-error information (e.g. verification under review)
  const [showPaygate, setShowPaygate] = useState(false)
  const [railOpen, setRailOpen] = useState(false) // phones: members/details open as a sheet
  const [reportingMember, setReportingMember] = useState(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [myRating, setMyRating] = useState(null)
  const [error, setError] = useState(null)
  const socketRef = useRef(null)
  const [, setTick] = useState(0)
  // A hangout ends by the clock, not by a click — re-render every 30s so an open screen
  // flips to ended (and the chat closes) on its own.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
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

  // "Verified profiles only" is the usual reason a join is refused — and the only thing the guest
  // can DO about it is verify. So take them straight there, rather than leaving a line of red text
  // above an unchanged screen (which just reads as "I tapped Join and nothing happened").
  function handleVerificationRequired() {
    if (me?.kyc_status === 'pending') {
      setNotice("Your verification is under review. You'll be able to join this hangout as soon as it's approved.")
    } else {
      setShowKyc(true)
    }
  }

  async function handleJoin() {
    setNotice(null)
    setError(null)
    // check before asking for a phone number / payment, not after
    if (hangout.verified_only && !me.is_verified) {
      handleVerificationRequired()
      return
    }
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
      if (err.payload?.error === 'verification_required') handleVerificationRequired()
      else setError(err.message)
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
        setPassStartsAt(err.payload?.pass_starts_at || null)
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
        setPassStartsAt(err.payload?.pass_starts_at || null)
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
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000))
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
    return `${Math.round(mins / 1440)}d ago`
  }
  const timeLeft = (iso) => {
    const mins = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000))
    if (mins < 60) return `in ${mins}m`
    return `in ${Math.floor(mins / 60)}h ${mins % 60}m`
  }
  // server status can be stale on a long-open screen, so also check the clock
  const ended = hangout.status === 'ended' || Date.now() >= new Date(hangout.effective_ends_at).getTime()
  const upcoming = !ended && new Date(hangout.starts_at).getTime() > Date.now()

  return (
    <>
    <Sidebar active="hangouts" me={me} mobileOnly hideTopbar />
    <div className="screen">
      <div className="chat-col">
        <header className="header">
          <Link to="/dashboard" className="back-btn" aria-label="Back to hangouts">←</Link>
          <div className="thumb-lg">{hangout.icon}</div>
          <div className="header-info">
            <div className="title-row">
              <h1>{hangout.title}</h1>
              {ended ? (
                <span className="live-badge ended">ENDED</span>
              ) : upcoming ? (
                <span className="live-badge upcoming">UPCOMING</span>
              ) : (
                <span className="live-badge"><span className="dot"></span>LIVE</span>
              )}
            </div>
            <div className="sub">
              {ended
                ? `ENDED ${timeAgo(hangout.effective_ends_at)} · ${hangout.member_count} WENT`
                : upcoming
                  ? `STARTS ${new Date(hangout.starts_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ${hangout.member_count} GOING`
                  : `ENDS ${timeLeft(hangout.effective_ends_at)} · ${hangout.member_count} HERE`}
              {hangout.venue?.name ? ` · ${hangout.venue.name}` : ''}
            </div>
          </div>
          <div className="header-actions">
            <button className="rail-toggle" aria-label="Members and details" onClick={() => setRailOpen(true)}>
              <Icon name="info" size={18} />
            </button>
            <div className="who-stack">
              {members.slice(0, 5).map((m) => <span key={m.user.id} style={photoStyle(m.user)}></span>)}
            </div>
            {isMember && !ended && (
              <button className="leave-btn" onClick={handleCopyInviteLink}>
                {inviteCopied ? 'Copied ✓' : 'Invite'}
              </button>
            )}
            {!ended && (isMember ? (
              <button className="leave-btn" onClick={handleLeave}>Leave</button>
            ) : (
              <button className="leave-btn" style={{ color: 'var(--lime)', borderColor: 'rgba(198,241,53,0.4)' }} onClick={handleJoin}>
                {hangout.is_paid ? `Join · ${formatKes(hangout.price_cents)}` : 'Join'}
              </button>
            ))}
          </div>
        </header>

        {(notice || error) && (
          <div
            role="alert"
            data-testid="join-notice"
            style={{
              margin: '12px 20px 0', padding: '12px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
              background: notice ? 'rgba(198,241,53,0.08)' : 'rgba(255,111,91,0.12)',
              border: `1px solid ${notice ? 'rgba(198,241,53,0.3)' : 'rgba(255,111,91,0.35)'}`,
              color: notice ? 'var(--paper)' : 'var(--coral)',
            }}
          >
            {notice || error}
          </div>
        )}

        {!isMember ? (
          <div style={{ padding: 40, color: 'var(--slate)' }}>
            {hangout.description}
            <p style={{ marginTop: 16 }}>{ended ? 'This hangout has ended.' : 'Join to see the conversation.'}</p>
            {!ended && hangout.verified_only && !me.is_verified && (
              <div
                data-testid="verify-hint"
                style={{ marginTop: 20, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 13, lineHeight: 1.5 }}
              >
                <strong style={{ color: 'var(--paper)' }}>Verified profiles only.</strong>{' '}
                {me.kyc_status === 'pending'
                  ? "Your verification is under review — you can join as soon as it's approved."
                  : 'Verify your identity once and you can join this and any other verified-only hangout.'}
                {me.kyc_status !== 'pending' && (
                  <button
                    type="button"
                    onClick={() => setShowKyc(true)}
                    style={{ display: 'block', marginTop: 10, background: 'var(--lime)', color: 'var(--ink)', border: 'none', borderRadius: 100, padding: '9px 18px', fontWeight: 700, fontSize: 12 }}
                  >
                    Get verified
                  </button>
                )}
              </div>
            )}
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

            {ended ? (
              <div className="composer">
                <div className="ended-bar">This hangout has ended — the chat is closed, but you can still read it.</div>
              </div>
            ) : locked ? (
              <div className="locked-composer">
                <div className="locked-inner">
                  <span className="lock-ic">🔒</span>
                  <span className="txt">
                    {passStartsAt
                      ? `Your pass starts ${new Date(passStartsAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
                      : 'Your pass has ended — you can still read, but not send'}
                  </span>
                  <button className="cta" onClick={() => setShowPaygate(true)}>{passStartsAt ? 'Get a pass now' : 'Get a pass'}</button>
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

      <aside className={`side-rail ${railOpen ? 'open' : ''}`}>
        <button className="rail-close" onClick={() => setRailOpen(false)}>
          <Icon name="close" size={16} /> Close
        </button>
        <div className="rail-section">
          <h2>About this hangout</h2>
          <div className="info-card">
            <div className="venue-name">{hangout.venue?.name || 'No venue set'}</div>
            {hangout.venue?.address && <div className="venue-addr">{hangout.venue.address}</div>}
            <div className="info-row"><span className="k">HOST</span><span className="v">{hangout.host?.display_name}</span></div>
            <div className="info-row"><span className="k">{upcoming ? 'STARTS' : 'STARTED'}</span><span className="v">{upcoming ? timeLeft(hangout.starts_at) : timeAgo(hangout.starts_at)}</span></div>
            <div className="info-row"><span className="k">{ended ? 'ENDED' : 'ENDS'}</span><span className="v">{ended ? timeAgo(hangout.effective_ends_at) : timeLeft(hangout.effective_ends_at)}</span></div>
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

      {showKyc && <KycGateModal onClose={() => { setShowKyc(false); loadAll() }} />}

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
    </>
  )
}
