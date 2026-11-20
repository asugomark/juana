import { io } from 'socket.io-client'

let socket = null

export function connectSocket() {
  const token = localStorage.getItem('juana_token')
  if (socket) return socket

  // When deployed behind Nginx reverse proxy on the same domain, default to current origin.
  // Can be overridden via VITE_SOCKET_URL (e.g., https://api.yourdomain.com) if hosted separately.
  const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin
  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
