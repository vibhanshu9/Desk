require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const express = require('express')
const http    = require('http')
const path    = require('path')
const { WebSocketServer, WebSocket } = require('ws')
const { v4: uuidv4 } = require('uuid')

const PORT = parseInt(process.env.SIGNALING_PORT || process.env.PORT || '3000', 10)
const HOST = process.env.SIGNALING_HOST || '0.0.0.0'
const NODE_ENV = process.env.NODE_ENV || 'development'

// ──────────────────────────────────────────────────────────────
//  Session store:  sessionId → { host: ws, clients: Map<id,ws> }
// ──────────────────────────────────────────────────────────────
const sessions = new Map()

const app    = express()
const server = http.createServer(app)

// WebSocket server on path /ws  (proxied by Vite in dev, nginx in prod)
const wss = new WebSocketServer({ server, path: '/ws' })

// ──────────────────────────────────────────────────────────────
//  HTTP middleware
// ──────────────────────────────────────────────────────────────
app.use(express.json())

// Wide-open CORS in dev; restrict in prod via reverse proxy
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Health check
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  sessions: sessions.size,
  env: NODE_ENV,
  uptime: Math.floor(process.uptime()),
}))

// ── Serve built React frontend (production / single-port mode) ─
const distPath = path.join(__dirname, '../../client/dist')
app.use(express.static(distPath))
app.get('*', (req, res, next) => {
  // Don't intercept /ws or /health
  if (req.path.startsWith('/ws') || req.path === '/health') return next()
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next()   // dist not built yet — fine in dev (Vite serves frontend)
  })
})

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

function cleanup(ws) {
  sessions.forEach((session, sessionId) => {
    if (session.host === ws) {
      session.clients.forEach((clientWs) => {
        send(clientWs, { type: 'host-disconnected' })
      })
      sessions.delete(sessionId)
      console.log(`[session] Host left → session ${sessionId} removed`)
    } else {
      session.clients.forEach((clientWs, clientId) => {
        if (clientWs === ws) {
          session.clients.delete(clientId)
          send(session.host, { type: 'client-left', clientId })
          console.log(`[session] Client ${clientId} left session ${sessionId}`)
        }
      })
    }
  })
}

// ──────────────────────────────────────────────────────────────
//  WebSocket signaling
// ──────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  ws.id = uuidv4()
  ws.isAlive = true
  console.log(`[ws] New connection ${ws.id} from ${req.socket.remoteAddress}`)

  ws.on('pong', () => { ws.isAlive = true })

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    switch (msg.type) {

      case 'register-host': {
        const { sessionId } = msg
        if (!sessionId) return
        if (sessions.has(sessionId)) {
          send(ws, { type: 'error', message: 'Session ID already taken.' })
          return
        }
        sessions.set(sessionId, { host: ws, clients: new Map() })
        ws.sessionId = sessionId
        ws.role = 'host'
        send(ws, { type: 'registered', sessionId })
        console.log(`[session] Host registered: ${sessionId}`)
        break
      }

      case 'join-session': {
        const { sessionId } = msg
        const session = sessions.get(sessionId)
        if (!session) {
          send(ws, { type: 'host-not-found' })
          return
        }
        const clientId = ws.id
        session.clients.set(clientId, ws)
        ws.sessionId = sessionId
        ws.role = 'client'
        ws.clientId = clientId
        send(session.host, { type: 'client-joined', clientId })
        console.log(`[session] Client ${clientId} joined ${sessionId}`)
        break
      }

      case 'offer': {
        const session = sessions.get(ws.sessionId)
        if (!session) return
        const targetWs = session.clients.get(msg.to)
        send(targetWs, { type: 'offer', sdp: msg.sdp, from: ws.id })
        break
      }

      case 'answer': {
        const session = sessions.get(ws.sessionId)
        if (!session) return
        send(session.host, { type: 'answer', sdp: msg.sdp, from: ws.id })
        break
      }

      case 'ice-candidate': {
        const session = sessions.get(ws.sessionId)
        if (!session) return
        if (ws.role === 'host') {
          const targetWs = session.clients.get(msg.to)
          send(targetWs, { type: 'ice-candidate', candidate: msg.candidate, from: ws.id })
        } else {
          send(session.host, { type: 'ice-candidate', candidate: msg.candidate, from: ws.id })
        }
        break
      }

      default: break
    }
  })

  ws.on('close', () => {
    cleanup(ws)
    console.log(`[ws] Closed: ${ws.id}`)
  })

  ws.on('error', (err) => {
    console.error(`[ws] Error on ${ws.id}:`, err.message)
    cleanup(ws)
  })
})

// Keep-alive ping every 25s
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { ws.terminate(); return }
    ws.isAlive = false
    ws.ping()
  })
}, 25_000)

// ──────────────────────────────────────────────────────────────
//  Start
// ──────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`🚀 RemoteDesk signaling server`)
  console.log(`   Listening on  ${HOST}:${PORT}`)
  console.log(`   WebSocket at  ws://localhost:${PORT}/ws`)
  console.log(`   Health check  http://localhost:${PORT}/health`)
  console.log(`   Environment   ${NODE_ENV}`)
})
