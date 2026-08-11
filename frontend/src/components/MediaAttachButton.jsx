import { useRef } from 'react'

/**
 * Just the button + hidden file input — the actual upload call is passed in
 * as onSelect, since HangoutDetail and HolaThread hit different endpoints
 * (sendHangoutMedia vs sendHolaMedia) but want identical UI.
 */
export default function MediaAttachButton({ onSelect, disabled }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files[0]
    e.target.value = '' // allow re-selecting the same file later
    if (file) onSelect(file)
  }

  return (
    <>
      <button
        type="button"
        className="attach-btn"
        aria-label="Attach photo or video"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        📎
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </>
  )
}
