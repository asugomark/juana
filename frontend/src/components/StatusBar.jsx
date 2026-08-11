import { useState } from 'react'
import { photoStyle } from '../utils/avatar'
import CreateStatusModal from './CreateStatusModal'
import StatusViewer from './StatusViewer'
import './StatusBar.css'

/**
 * feed shape: [{ author, statuses: [...] }, ...] from GET /status/feed.
 * The viewer's own entry (if any) is just whichever one has author.id === me.id --
 * the backend always includes it, no separate "my status" call needed.
 */
export default function StatusBar({ feed, me, onChanged }) {
  const [viewingIndex, setViewingIndex] = useState(null) // index into feed, or null when closed
  const [showCreate, setShowCreate] = useState(false)

  const myEntry = feed.find((f) => f.author.id === me.id)
  const others = feed.filter((f) => f.author.id !== me.id)

  function handleMyCircleClick() {
    if (myEntry) {
      setViewingIndex(feed.indexOf(myEntry))
    } else {
      setShowCreate(true)
    }
  }

  return (
    <div className="status-bar">
      <div className="status-item" onClick={handleMyCircleClick} role="button" tabIndex={0}>
        <div className={`status-ring ${myEntry ? 'has-status' : 'empty'}`}>
          <div className="status-avatar" style={photoStyle(me)}></div>
          {!myEntry && <span className="status-add">+</span>}
        </div>
        <span className="status-label">Your status</span>
      </div>

      {others.map((entry) => (
        <div
          className="status-item"
          key={entry.author.id}
          onClick={() => setViewingIndex(feed.indexOf(entry))}
          role="button"
          tabIndex={0}
        >
          <div className="status-ring has-status">
            <div className="status-avatar" style={photoStyle(entry.author)}></div>
          </div>
          <span className="status-label">{entry.author.display_name.split(' ')[0]}</span>
        </div>
      ))}

      {viewingIndex !== null && (
        <StatusViewer
          feed={feed}
          startIndex={viewingIndex}
          me={me}
          onClose={() => setViewingIndex(null)}
          onChanged={onChanged}
        />
      )}

      {showCreate && (
        <CreateStatusModal
          onClose={() => setShowCreate(false)}
          onPosted={() => {
            setShowCreate(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
