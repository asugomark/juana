import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import ReportModal from '../components/ReportModal'
import StarRating from '../components/StarRating'
import KycGateModal from '../components/KycGateModal'
import './Profile.css'

const MAX_PHOTOS = 6

/**
 * Scope notes:
 * - Photos are real now: multipart upload to POST /api/auth/me/photos, stored
 *   on local disk by the backend (see config.py's UPLOAD_FOLDER comment for
 *   why that needs to become S3/Cloudinary before production), served back as
 *   relative /uploads/... URLs. Position 0 is the primary photo shown as the
 *   main tile; the rest are the thumb-strip, clickable to promote to primary.
 * - "Active now" isn't shown -- the backend doesn't track a last-seen/presence
 *   signal, only nearby_visible (a different thing: "sharing live location"
 *   vs. "was recently online"). Showing it against nearby_visible would say
 *   something the data doesn't actually support.
 * - Editing is inline, only visible on your own profile (id === me.id).
 */
export default function Profile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [mutualHangouts, setMutualHangouts] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [likeStatus, setLikeStatus] = useState({ liked_by_me: false, matched: false })
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [showMatchBanner, setShowMatchBanner] = useState(false)
  const [ratingSummary, setRatingSummary] = useState({ average: null, count: 0 })
  const [reviews, setReviews] = useState([])
  const [showReport, setShowReport] = useState(false)
  const [showKyc, setShowKyc] = useState(false)

  const isOwnProfile = me && profile && me.id === profile.id

  function formFromProfile(profileData) {
    return {
      bio: profileData.bio || '',
      occupation: profileData.occupation || '',
      city: profileData.city || '',
      interests: (profileData.interests || []).join(', '),
      prompt_question: profileData.prompt?.question || '',
      prompt_answer: profileData.prompt?.answer || '',
    }
  }

  const load = useCallback(async () => {
    try {
      const meData = await api.me()
      setMe(meData)
      const profileData = id === meData.id ? meData : await api.getUserProfile(id)
      setProfile(profileData)
      setForm(formFromProfile(profileData))
      api.ratingSummary(id).then(setRatingSummary).catch(() => {})
      api.listRatings(id).then(setReviews).catch(() => setReviews([]))
      if (id !== meData.id) {
        api.mutualHangouts(id).then(setMutualHangouts).catch(() => setMutualHangouts([]))
        api.likeStatus(id).then(setLikeStatus).catch(() => {})
        api.blockStatus(id).then((s) => setBlockedByMe(s.blocked_by_me)).catch(() => {})
      }
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  function startEditing() {
    setForm(formFromProfile(profile))
    setSaved(false)
    setError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setForm(formFromProfile(profile)) // discard unsaved changes rather than leaving stale edits sitting in state
    setError(null)
    setEditing(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateMe({
        bio: form.bio,
        occupation: form.occupation,
        city: form.city,
        interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
        prompt_question: form.prompt_question,
        prompt_answer: form.prompt_answer,
      })
      setMe(updated)
      setProfile(updated)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files[0]
    e.target.value = '' // lets the same file be re-selected later if needed
    if (!file) return

    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError('Photos must be JPG, PNG, or WEBP.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Photo must be under 8MB.')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const updated = await api.uploadPhoto(file)
      setMe(updated)
      setProfile(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSetPrimary(photoId) {
    try {
      const updated = await api.setPrimaryPhoto(photoId)
      setMe(updated)
      setProfile(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeletePhoto(photoId, e) {
    e.stopPropagation() // don't trigger the "set primary" click on the same tile
    if (!confirm('Remove this photo?')) return
    try {
      const updated = await api.deletePhoto(photoId)
      setMe(updated)
      setProfile(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleLike() {
    try {
      if (likeStatus.liked_by_me) {
        await api.unlikeUser(profile.id)
        setLikeStatus({ liked_by_me: false, matched: false })
      } else {
        const result = await api.likeUser(profile.id)
        setLikeStatus({ liked_by_me: true, matched: result.matched })
        if (result.matched) setShowMatchBanner(true)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleBlock() {
    if (!blockedByMe && !confirm(`Block ${profile.display_name}? They won't be able to message you or appear in your Nearby/suggestions, and you won't appear in theirs.`)) {
      return
    }
    try {
      if (blockedByMe) {
        await api.unblockUser(profile.id)
        setBlockedByMe(false)
      } else {
        await api.blockUser(profile.id)
        setBlockedByMe(true)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (!profile) return <div style={{ padding: 40 }}>Loading…</div>

  const photos = profile.photos || []
  const primaryPhoto = photos[0]
  const interestCount = form ? form.interests.split(',').map((s) => s.trim()).filter(Boolean).length : 0

  return (
    <>
      <div className="topbar">
        <button className="back-btn" aria-label="Back" onClick={() => navigate(-1)}>←</button>
        <div className="topbar-actions">
          {!isOwnProfile && <button className="icon-btn" aria-label="Report" onClick={() => setShowReport(true)}>⚑</button>}
          <button className="icon-btn" aria-label="More options">⋯</button>
        </div>
      </div>

      {showMatchBanner && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
          background: 'var(--lime)', color: 'var(--ink)', padding: '14px 24px', borderRadius: 100,
          fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          It's a match with {profile.display_name}! 🎉
          <button onClick={() => setShowMatchBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div className="page">
        <div className="layout">

          <div className="photo-col">
            <div className="photo-main">
              {primaryPhoto ? (
                <img src={primaryPhoto.url} alt={`${profile.display_name}'s photo`} className="photo-img" />
              ) : (
                <div className="fake-face"></div>
              )}
              <div className="photo-badges">
                <span className={profile.is_verified ? 'verified-chip' : 'unverified-chip'}>
                  {profile.is_verified ? '✓ VERIFIED' : 'NOT VERIFIED'}
                </span>
              </div>
            </div>

            {isOwnProfile && !profile.is_verified && (
              <p style={{ fontSize: 12, marginTop: 10 }}>
                {profile.kyc_status === 'pending' ? (
                  <span style={{ color: 'var(--slate)' }}>Verification submitted — under review.</span>
                ) : (
                  <button
                    onClick={() => setShowKyc(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--lime)', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
                  >
                    Get verified →
                  </button>
                )}
              </p>
            )}

            {isOwnProfile && (
              <>
                <div className="thumb-strip">
                  {photos.map((p, i) => (
                    <div
                      key={p.id}
                      className={`thumb ${i === 0 ? 'active' : ''}`}
                      onClick={() => i !== 0 && handleSetPrimary(p.id)}
                      role="button"
                      tabIndex={0}
                      title={i === 0 ? 'Primary photo' : 'Click to make primary'}
                      style={{ backgroundImage: `url(${p.url})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', cursor: i === 0 ? 'default' : 'pointer' }}
                    >
                      <button
                        className="thumb-remove"
                        onClick={(e) => handleDeletePhoto(p.id, e)}
                        aria-label="Remove photo"
                      >✕</button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <div className="thumb thumb-add" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0}>
                      {uploading ? '…' : '+'}
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 8 }}>
                  {photos.length}/{MAX_PHOTOS} photos · tap a thumbnail to make it primary
                </p>
              </>
            )}

            <div className="cta-stack">
              {isOwnProfile ? (
                <button className="btn-hola" onClick={editing ? cancelEditing : startEditing}>
                  {editing ? 'Cancel editing' : 'Edit profile'}
                </button>
              ) : (
                <>
                  <Link to={`/hola/${profile.id}`} className="btn-hola">Send a Hola →</Link>
                  <button className="btn-like" onClick={handleToggleLike}>
                    {likeStatus.liked_by_me ? '♥ Liked' : '♡ Like'}{likeStatus.matched ? ' · Matched' : ''}
                  </button>
                  <button
                    className="btn-like"
                    onClick={handleToggleBlock}
                    style={blockedByMe ? { color: 'var(--coral)', borderColor: 'rgba(255,111,91,0.4)' } : undefined}
                  >
                    {blockedByMe ? 'Unblock' : 'Block'}
                  </button>
                </>
              )}
            </div>
          </div>

          {showReport && (
            <ReportModal
              reportedUserId={profile.id}
              reportedUserName={profile.display_name}
              onClose={() => setShowReport(false)}
            />
          )}

          {showKyc && (
            <KycGateModal
              onClose={() => {
                setShowKyc(false)
                load() // picks up the new 'pending' kyc_status right away, no manual refresh needed
              }}
            />
          )}

          <div className="info-col">
            <div className="name-row">
              <h1>{profile.display_name}</h1>
              <span className="age">{profile.age}</span>
            </div>
            <div className="meta-line">
              {profile.occupation && <span>{profile.occupation}</span>}
              {profile.occupation && profile.city && <span>·</span>}
              {profile.city && <span>{profile.city}</span>}
            </div>

            {ratingSummary.count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <StarRating value={ratingSummary.average} readOnly size={15} />
                <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                  {ratingSummary.average} · {ratingSummary.count} {ratingSummary.count === 1 ? 'rating' : 'ratings'} as host
                </span>
              </div>
            )}

            {saved && <p style={{ color: 'var(--lime)', marginTop: 16, fontSize: 13 }}>✓ Profile saved</p>}
            {error && <p style={{ color: 'var(--coral)', marginTop: 16 }}>{error}</p>}

            {editing ? (
              <form onSubmit={handleSave} style={{ marginTop: 28 }}>
                <div className="section">
                  <h2>About</h2>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Tell people a bit about yourself"
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, color: 'var(--paper)', fontSize: 14 }}
                  />
                </div>
                <div className="section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <h2>Occupation</h2>
                    <input
                      value={form.occupation}
                      maxLength={120}
                      onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                      style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--paper)', fontSize: 14 }}
                    />
                  </div>
                  <div>
                    <h2>City</h2>
                    <input
                      value={form.city}
                      maxLength={120}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--paper)', fontSize: 14 }}
                    />
                  </div>
                </div>
                <div className="section">
                  <h2>Interests (comma-separated, up to 10)</h2>
                  <input
                    value={form.interests}
                    onChange={(e) => setForm({ ...form, interests: e.target.value })}
                    placeholder="Board games, Trivia, Coffee"
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--paper)', fontSize: 14 }}
                  />
                  <p style={{ fontSize: 11, color: interestCount > 10 ? 'var(--coral)' : 'var(--slate)', marginTop: 6 }}>
                    {interestCount}/10 {interestCount > 10 ? '— only the first 10 will be saved' : ''}
                  </p>
                </div>
                <div className="section">
                  <h2>A prompt</h2>
                  <input
                    value={form.prompt_question}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, prompt_question: e.target.value })}
                    placeholder="MY IDEAL HANGOUT IS…"
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--paper)', fontSize: 14, marginBottom: 8 }}
                  />
                  <textarea
                    rows={2}
                    maxLength={280}
                    value={form.prompt_answer}
                    onChange={(e) => setForm({ ...form, prompt_answer: e.target.value })}
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, color: 'var(--paper)', fontSize: 14 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="submit" className="btn-hola" disabled={saving} style={{ width: 'auto', padding: '12px 28px' }}>
                    {saving ? 'Saving…' : 'Save profile'}
                  </button>
                  <button type="button" className="btn-like" onClick={cancelEditing} style={{ width: 'auto', padding: '12px 28px' }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                {!isOwnProfile && mutualHangouts.length > 0 && (
                  <div className="mutual-strip">
                    <div className="stack"><span></span><span></span></div>
                    <div className="txt">You've both been in <strong>{mutualHangouts[0].title}</strong></div>
                  </div>
                )}

                {profile.bio && (
                  <div className="section">
                    <h2>About</h2>
                    <p className="bio">{profile.bio}</p>
                  </div>
                )}

                {profile.interests?.length > 0 && (
                  <div className="section">
                    <h2>Interests</h2>
                    <div className="tag-row">
                      {profile.interests.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                    </div>
                  </div>
                )}

                {profile.prompt && (
                  <div className="section">
                    <h2>A prompt</h2>
                    <div className="prompt-card">
                      <div className="q">{profile.prompt.question}</div>
                      <div className="a">{profile.prompt.answer}</div>
                    </div>
                  </div>
                )}

                {!isOwnProfile && mutualHangouts.length > 0 && (
                  <div className="section">
                    <h2>Hangouts in common</h2>
                    {mutualHangouts.map((h) => (
                      <Link to={`/hangouts/${h.id}`} className="hangout-mini" key={h.id} style={{ display: 'flex' }}>
                        <div className="ic">{h.icon}</div>
                        <div className="info">
                          <div className="t">{h.title}</div>
                          <div className="m">{h.member_count} MEMBERS</div>
                        </div>
                        <span className="together-tag">SHARED</span>
                      </Link>
                    ))}
                  </div>
                )}

                {reviews.length > 0 && (
                  <div className="section">
                    <h2>Reviews as host</h2>
                    {reviews.slice(0, 10).map((r) => (
                      <div className="prompt-card" key={r.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <StarRating value={r.stars} readOnly size={13} />
                          <span style={{ fontSize: 11, color: 'var(--slate)', fontFamily: "'Space Mono', monospace" }}>
                            {r.hangout_title}
                          </span>
                        </div>
                        {r.comment && <div style={{ fontSize: 13, color: 'var(--paper)' }}>{r.comment}</div>}
                        <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 6 }}>— {r.rater.display_name}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!profile.bio && !profile.interests?.length && !profile.prompt && (
                  <p style={{ color: 'var(--slate)', marginTop: 24, fontSize: 14 }}>
                    {isOwnProfile ? "You haven't filled out your profile yet." : "This person hasn't filled out their profile yet."}
                  </p>
                )}

                {!isOwnProfile && (
                  <div className="safety-note">
                    <span className="ic">◎</span>
                    <span>
                      {profile.is_verified
                        ? 'Verified profiles have completed ID and liveness checks. Still meeting up? Keep it in public and let someone know where you\'ll be.'
                        : "This profile hasn't completed identity verification. Be extra cautious, meet in public, and let someone know where you'll be."}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
