/**
 * Captures the browser's install prompt as soon as it fires (once per session)
 * and exposes it to whichever component needs it. Module-level state, not React
 * state, because the event can fire before any particular component has mounted
 * — a plain JS module is a singleton that's "listening" from the moment the app
 * loads, regardless of route.
 */
let deferredPrompt = null
let installAvailable = false
const listeners = new Set()

function notify() {
  listeners.forEach((cb) => cb(installAvailable))
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    installAvailable = true
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installAvailable = false
    notify()
  })
}

export function isInstallAvailable() {
  return installAvailable
}

export function onInstallAvailabilityChange(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function isIos() {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** True when the app is already running as an installed PWA — no point offering install then. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null
  installAvailable = false
  notify()
  return choice.outcome === 'accepted'
}
