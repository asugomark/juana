import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import './StatusViewer.css'

const TEXT_IMAGE_DURATION_MS = 5000

/**
 * feed: the full [{author, statuses}] list from the parent, so "next author"
 * navigation works without a separate fetch. startIndex is which author entry
 * to open on. Within an author, statuses play oldest-to-newest (already sorted
 * that way by the backend).
 */
export default function StatusViewer({ feed, startIndex, me, onClose, onChanged }) {
  const [authorIndex, setAuthorIndex] = useState(startIndex)
  const [statusIndex, setStatusIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const videoRef = useRef(null)

  const entry = feed[authorIndex]
  const status = entry?.statuses[statusIndex]
  const isOwn = entry?.author.id === me.id

  function goNext() {
    if (!entry) return
    if (statusIndex < entry.statuses.length - 1) {
      setStatusIndex((i) => i + 1)
    } else if (authorIndex < feed.length - 1) {
      setAuthorIndex((i) => i + 1)
      setStatusIndex(0)
    } else {
      onClose()
    }
  }

  function goPrev() {
    if (statusIndex > 0) {
      setStatusIndex((i) => i - 1)
    } else if (authorIndex > 0) {
      setAuthorIndex((i) => i - 1)
      setStatusIndex(0) // simplification: jumps to the start of the previous author's set, not their last status
    }
  }

  // Progress + auto-advance. Text/image use a fixed timer; video advances on
  // its own 'ended' event instead (handled in the video element below).
  useEffect(() => {
    setProgress(0)
    clearInterval(timerRef.current)
    if (!status || status.kind === 'video') return

    startRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.min(100, (elapsed / TEXT_IMAGE_DURATION_MS) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(timerRef.current)
        goNext()
      }
    }, 50)

    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorIndex, statusIndex])

  async function handleDelete() {
    if (!confirm('Delete this status?')) return
    try {
      await api.deleteStatus(status.id)
      onChanged()
      goNext()
    } catch (err) {
      alert(err.message)
    }
  }

  if (!status) return null

  return (
    <div className="status-overlay">
      <div className="status-modal">
        <div className="status-progress-row">
          {entry.statuses.map((s, i) => (
            <div className="status-progress-track" key={s.id}>
              <div
                className="status-progress-fill"
                style={{ width: i < statusIndex ? '100%' : i === statusIndex ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="status-header">
          <Link to={`/profile/${entry.author.id}`} className="status-header-author">
            <span className="name">{entry.author.display_name}</span>
            <span className="time">{new Date(status.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </Link>
          <div className="status-header-actions">
            {isOwn && <button onClick={handleDelete} aria-label="Delete status">🗑</button>}
            <button onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="status-content" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const clickX = e.clientX - rect.left
          if (clickX < rect.width / 2) goPrev(); else goNext()
        }}>
          {status.kind === 'text' && (
            <div className="status-text-slide">{status.text_content}</div>
          )}
          {status.kind === 'image' && (
            <>
              <img src={status.media_url} alt="" />
              {status.text_content && <div className="status-caption">{status.text_content}</div>}
            </>
          )}
          {status.kind === 'video' && (
            <>
              <video
                ref={videoRef}
                src={status.media_url}
                autoPlay
                onEnded={goNext}
                onTimeUpdate={(e) => setProgress((e.target.currentTime / e.target.duration) * 100)}
              />
              {status.text_content && <div className="status-caption">{status.text_content}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
