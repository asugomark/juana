import { io } from 'socket.io-client'

let socket = null

export function connectSocket() {
  const token = localStorage.getItem('juana_token')
  if (socket) return socket

  socket = io('/', { auth: { token } })
  return socket
}

export function getSocket() {
  return socket
}
