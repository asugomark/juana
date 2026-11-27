import { useEffect, useState } from 'react'
import { api } from '../api/client'

// The mood list lives on the server (GET /nearby/moods) so wording can change without a front-end
// release and can't drift. Fetched once per page load and shared by everything that shows a mood.
let cache = null
let inflight = null

export const LAST_MOOD_KEY = 'juana_last_mood'

export function useMoods() {
  const [moods, setMoods] = useState(cache || [])
  useEffect(() => {
    if (cache) return
    inflight = inflight || api.nearbyMoods()
      .then((m) => { cache = m; return m })
      .catch(() => { inflight = null; return [] }) // allow a retry on the next mount
    let alive = true
    inflight.then((m) => { if (alive) setMoods(m) })
    return () => { alive = false }
  }, [])
  const byKey = Object.fromEntries(moods.map((m) => [m.key, m]))
  return { moods, byKey }
}
