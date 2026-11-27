import { useRef, useState } from 'react'
import { api } from '../api/client'

export default function CreateStatusModal({ onClose, onPosted }) {
  const [mode, setMode] = useState('text') // 'text' | 'media'
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  function handleFileSelect(e) {
    const f = e.target.files[0]
    if (f) {
      setFile(f)
      setMode('media')
    }
  }

  async function handlePost() {
    setError(null)
    setPosting(true)
    try {
      if (mode === 'text') {
        if (!text.trim()) {
          setError('Write something first.')
          setPosting(false)
          return
        }
        await api.createTextStatus(text.trim())
      } else {
        if (!file) {
          setError('Choose a photo or video first.')
          setPosting(false)
          return
        }
        await api.createMediaStatus(file, caption.trim())
      }
      onPosted()
    } catch (err) {
      setError(err.message)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        <div className="modal-icon">✦</div>
        <h2>Share a status</h2>
        <p className="lede">Visible for 24 hours to people you've messaged or shared a hangout with — not a public feed.</p>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => setMode('text')}
            style={{
              flex: 1, padding: 12, borderRadius: 100, border: 'none', fontWeight: 600, fontSize: 13,
              background: mode === 'text' ? 'var(--lime)' : 'var(--surface-2)',
              color: mode === 'text' ? 'var(--ink)' : 'var(--slate)',
            }}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1, padding: 12, borderRadius: 100, border: 'none', fontWeight: 600, fontSize: 13,
              background: mode === 'media' ? 'var(--lime)' : 'var(--surface-2)',
              color: mode === 'media' ? 'var(--ink)' : 'var(--slate)',
            }}
          >
            {file ? file.name.slice(0, 20) : 'Photo / Video'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {mode === 'text' ? (
          <textarea
            rows={4}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's happening?"
            style={{
              width: '100%', marginTop: 16, background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 12, padding: 14, color: 'var(--paper)', fontSize: 15, fontFamily: "'Fraunces', serif",
            }}
          />
        ) : (
          <input
            type="text"
            maxLength={280}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption (optional)"
            style={{
              width: '100%', marginTop: 16, background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 12, padding: 14, color: 'var(--paper)', fontSize: 14,
            }}
          />
        )}

        {error && <p style={{ color: 'var(--coral)', fontSize: 12, marginTop: 10 }}>{error}</p>}

        <button className="unlock-btn" onClick={handlePost} disabled={posting}>
          {posting ? 'Posting…' : 'Post status'}
        </button>
      </div>
    </div>
  )
}
