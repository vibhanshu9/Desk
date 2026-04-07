/**
 * WebSocket signaling client.
 *
 * URL resolution order (runtime, not baked at build):
 *  1. VITE_SIGNAL_URL env var (explicit override)
 *  2. Auto-derived from window.location → same host, /ws path
 *     http://host  → ws://host/ws
 *     https://host → wss://host/ws   (works on orchids.cloud, any VPS)
 */

function getSignalUrl() {
  const envUrl = import.meta.env.VITE_SIGNAL_URL
  if (envUrl) return envUrl
  
  // Fallback to explicitly defined ngrok url just in case Vite hasn't restarted
  const hardcodedNgrok = 'wss://59ca-122-164-126-153.ngrok-free.app/ws'
  if (hardcodedNgrok) return hardcodedNgrok

  const { protocol, host } = window.location
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${host}/ws`
}

export class SignalClient {
  constructor(handlers) {
    this.handlers = handlers
    this.ws = null
    this.reconnectTimer = null
    this.shouldReconnect = true
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    const url = getSignalUrl()
    console.log('[signal] Connecting to', url)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      clearTimeout(this.reconnectTimer)
      console.log('[signal] Connected')
      this.handlers.onOpen?.()
    }

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        this.handlers.onMessage?.(msg)
      } catch (e) {
        console.error('[signal] Parse error', e)
      }
    }

    this.ws.onclose = (evt) => {
      console.log('[signal] Closed', evt.code)
      this.handlers.onClose?.()
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000)
      }
    }

    this.ws.onerror = (err) => {
      console.error('[signal] Error', err)
    }
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    } else {
      console.warn('[signal] send() dropped — not connected')
    }
  }

  disconnect() {
    this.shouldReconnect = false
    clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}
