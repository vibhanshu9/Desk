/**
 * WebRTC peer connection factory.
 * STUN servers from VITE_STUN_SERVERS (comma-separated) or defaults.
 * TURN server from VITE_TURN_SERVER / _USERNAME / _PASSWORD.
 */

function parseStunServers() {
  const raw = import.meta.env.VITE_STUN_SERVERS || ''
  if (!raw) return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
  return raw.split(',').map(url => ({ urls: url.trim() }))
}

export function createPeerConnection() {
  const iceServers = parseStunServers()

  const turnServer = import.meta.env.VITE_TURN_SERVER
  const turnUser   = import.meta.env.VITE_TURN_USERNAME
  const turnPass   = import.meta.env.VITE_TURN_PASSWORD

  if (turnServer && turnUser && turnPass) {
    iceServers.push({
      urls: turnServer,
      username: turnUser,
      credential: turnPass,
    })
  }

  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10,
  })
}
