import { useEffect, useState } from 'react'

/**
 * Plain <img src="..."> can't send an Authorization header, so it can't load
 * anything behind @jwt_required() — which routes/verification.py's document
 * endpoint deliberately is (see that file's docstring on why KYC documents
 * are never served publicly). This fetches the bytes with the token attached
 * and renders them as a local object URL instead.
 */
export default function AuthedImage({ src, alt, style }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let currentUrl = null
    let cancelled = false

    async function load() {
      try {
        const token = localStorage.getItem('juana_token')
        const res = await fetch(src, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('failed to load')
        const blob = await res.blob()
        currentUrl = URL.createObjectURL(blob)
        if (!cancelled) setObjectUrl(currentUrl)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl) // don't leak blob URLs as the review queue scrolls
    }
  }, [src])

  if (error) return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coral)', fontSize: 11 }}>Failed to load</div>
  if (!objectUrl) return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', fontSize: 11 }}>Loading…</div>
  return <img src={objectUrl} alt={alt} style={style} />
}
