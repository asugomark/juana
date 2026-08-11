const BASE_URL = '/api'

export function getToken() {
  return localStorage.getItem('juana_token')
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // 402 is the pass-gate response shape from routes/messages.py — surface it distinctly
    // so the UI can trigger the paygate modal instead of a generic error toast.
    const error = new Error(data.message || data.error || 'Request failed')
    error.status = res.status
    error.payload = data
    throw error
  }

  return data
}

/**
 * Separate from request() above deliberately -- fetch needs to set its own
 * multipart Content-Type header (with the correct boundary string), which it
 * can only do if we DON'T set Content-Type ourselves. Passing a FormData body
 * through the JSON-only request() above would silently send a broken request
 * (JSON.stringify on a FormData object produces "{}", not the actual file).
 */
async function uploadRequest(path, formData) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: formData })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const error = new Error(data.message || data.error || 'Upload failed')
    error.status = res.status
    error.payload = data
    throw error
  }
  return data
}

export const api = {
  register: (data) => request('/auth/register', { method: 'POST', body: data, auth: false }),
  login: (data) => request('/auth/login', { method: 'POST', body: data, auth: false }),
  me: () => request('/auth/me'),
  updateMe: (patch) => request('/auth/me', { method: 'PATCH', body: patch }),
  uploadPhoto: (file) => {
    const formData = new FormData()
    formData.append('photo', file)
    return uploadRequest('/auth/me/photos', formData)
  },
  deletePhoto: (photoId) => request(`/auth/me/photos/${photoId}`, { method: 'DELETE' }),
  setPrimaryPhoto: (photoId) => request(`/auth/me/photos/${photoId}/primary`, { method: 'POST' }),

  sendHangoutMedia: (hangoutId, file, caption) => {
    const formData = new FormData()
    formData.append('media', file)
    if (caption) formData.append('caption', caption)
    return uploadRequest(`/hangouts/${hangoutId}/messages/media`, formData)
  },
  sendHolaMedia: (otherUserId, file, caption) => {
    const formData = new FormData()
    formData.append('media', file)
    if (caption) formData.append('caption', caption)
    return uploadRequest(`/hola/${otherUserId}/messages/media`, formData)
  },

  statusFeed: () => request('/status/feed'),
  createTextStatus: (text) => request('/status', { method: 'POST', body: { text } }),
  createMediaStatus: (file, caption) => {
    const formData = new FormData()
    formData.append('media', file)
    if (caption) formData.append('caption', caption)
    return uploadRequest('/status', formData)
  },
  deleteStatus: (statusId) => request(`/status/${statusId}`, { method: 'DELETE' }),

  likeUser: (userId) => request(`/users/${userId}/like`, { method: 'POST' }),
  unlikeUser: (userId) => request(`/users/${userId}/like`, { method: 'DELETE' }),
  likeStatus: (userId) => request(`/users/${userId}/like-status`),

  blockUser: (userId) => request(`/users/${userId}/block`, { method: 'POST' }),
  unblockUser: (userId) => request(`/users/${userId}/block`, { method: 'DELETE' }),
  blockStatus: (userId) => request(`/users/${userId}/block-status`),
  listBlocked: () => request('/users/blocked'),

  submitReport: (reportedUserId, reason, details, hangoutId) =>
    request('/reports', { method: 'POST', body: { reported_user_id: reportedUserId, reason, details, hangout_id: hangoutId } }),

  adminListReports: (status = 'pending') => request(`/admin/reports?status=${status}`),
  adminResolveReport: (reportId, action, note) =>
    request(`/admin/reports/${reportId}/resolve`, { method: 'POST', body: { action, note } }),
  adminSearchUsers: (q) => request(`/admin/users/search?q=${encodeURIComponent(q)}`),
  adminBanUser: (userId, reason) => request(`/admin/users/${userId}/ban`, { method: 'POST', body: { reason } }),
  adminUnbanUser: (userId) => request(`/admin/users/${userId}/unban`, { method: 'POST' }),

  adminGetSasaPaySettings: () => request('/admin/settings/sasapay'),
  adminUpdateSasaPaySettings: (data) => request('/admin/settings/sasapay', { method: 'POST', body: data }),
  adminTestSasaPayConnection: () => request('/admin/settings/sasapay/test', { method: 'POST' }),

  submitRating: (hangoutId, stars, comment) =>
    request(`/hangouts/${hangoutId}/rating`, { method: 'POST', body: { stars, comment } }),
  myRating: (hangoutId) => request(`/hangouts/${hangoutId}/rating`),
  ratingSummary: (userId) => request(`/users/${userId}/rating-summary`, { auth: false }),
  listRatings: (userId) => request(`/users/${userId}/ratings`, { auth: false }),

  nearbyHangouts: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/hangouts/nearby?${qs}`)
  },
  getHangout: (id) => request(`/hangouts/${id}`),
  hangoutPreview: (id) => request(`/hangouts/${id}/preview`, { auth: false }),
  createHangout: (data) => request('/hangouts', { method: 'POST', body: data }),
  // phoneNumber only needed when joining a PAID hangout. invitedBy is the
  // referring user's id, read from a share-link visit (see pages/Invite.jsx) —
  // both are optional and independent of each other.
  joinHangout: (id, phoneNumber, invitedBy) =>
    request(`/hangouts/${id}/join`, {
      method: 'POST',
      body: { ...(phoneNumber ? { phone_number: phoneNumber } : {}), ...(invitedBy ? { invited_by: invitedBy } : {}) },
    }),
  leaveHangout: (id) => request(`/hangouts/${id}/leave`, { method: 'POST' }),
  hangoutMembers: (id) => request(`/hangouts/${id}/members`),

  hangoutMessages: (id) => request(`/hangouts/${id}/messages`),
  sendHangoutMessage: (id, body) => request(`/hangouts/${id}/messages`, { method: 'POST', body: { body } }),

  holaInbox: () => request('/hola'),
  holaThread: (otherUserId) => request(`/hola/${otherUserId}/messages`),
  sendHola: (otherUserId, body) => request(`/hola/${otherUserId}/messages`, { method: 'POST', body: { body } }),

  passPricing: () => request('/passes/pricing', { auth: false }),
  passStatus: () => request('/passes/status'),
  // Kicks off a SasaPay STK push / OTP request — does NOT grant the pass yet.
  // Poll passStatus() after this until has_active_pass flips true, or listen for
  // a socket event once one's wired up server-side.
  purchasePass: (tier, phoneNumber, networkCode = '63902') =>
    request('/passes/purchase', { method: 'POST', body: { tier, phone_number: phoneNumber, network_code: networkCode } }),
  confirmPassOtp: (checkoutRequestId, verificationCode) =>
    request('/passes/purchase/confirm-otp', {
      method: 'POST',
      body: { checkout_request_id: checkoutRequestId, verification_code: verificationCode },
    }),

  earningsSummary: () => request('/earnings/summary'),
  earningsByHangout: () => request('/earnings/by-hangout'),
  earningsTransactions: () => request('/earnings/transactions'),
  // Payout is async via SasaPay B2C — returns 202/pending, not instant success.
  // A 403 with error 'kyc_required' means the KYC gate needs to run first.
  withdraw: (phoneNumber) => request('/earnings/withdraw', { method: 'POST', body: { phone_number: phoneNumber } }),

  startVerification: () => request('/verification/start', { method: 'POST' }),

  removeMember: (hangoutId, memberUserId) =>
    request(`/hangouts/${hangoutId}/members/${memberUserId}/remove`, { method: 'POST' }),

  startNearby: (lat, lng, venueId) => request('/nearby/start', { method: 'POST', body: { lat, lng, venue_id: venueId } }),
  endNearby: () => request('/nearby/end', { method: 'POST' }),
  nearbyUsers: (radiusMi = 1) => request(`/nearby/users?radius_mi=${radiusMi}`),

  getUserProfile: (id) => request(`/users/${id}`),
  mutualHangouts: (id) => request(`/users/${id}/mutual-hangouts`),
  userSuggestions: () => request('/users/suggestions'),
}

export function setToken(token) {
  localStorage.setItem('juana_token', token)
}

export function clearToken() {
  localStorage.removeItem('juana_token')
}
