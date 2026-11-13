/**
 * Carries a hangout invite (which hangout + who shared it) across the gap
 * between "visited a public /invite/:id link" and "finished registering" --
 * two separate page loads that otherwise have no way to talk to each other.
 * sessionStorage (not localStorage) is deliberate: this context should NOT
 * survive closing the tab or leaking into some unrelated future session.
 */
const HANGOUT_KEY = 'juana_invite_hangout_id'
const REF_KEY = 'juana_invite_ref_id'

export function setPendingInvite(hangoutId, refUserId) {
  sessionStorage.setItem(HANGOUT_KEY, hangoutId)
  if (refUserId) sessionStorage.setItem(REF_KEY, refUserId)
}

export function getPendingInviteHangoutId() {
  return sessionStorage.getItem(HANGOUT_KEY)
}

export function getPendingInviteRef() {
  return sessionStorage.getItem(REF_KEY)
}

export function clearPendingInvite() {
  sessionStorage.removeItem(HANGOUT_KEY)
  sessionStorage.removeItem(REF_KEY)
}
