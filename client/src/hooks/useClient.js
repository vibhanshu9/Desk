import { useEffect, useRef, useCallback, useState } from 'react'
import { createPeerConnection } from '../lib/webrtc'
import { SignalClient } from '../lib/signal'

/**
 * useClient – connects to a host session via WebRTC.
 * Handles:
 *  - Receiving remote screen stream
 *  - Sending mouse moves (throttled), clicks, scroll, keyboard events
 *    over the WebRTC data channel
 */
export function useClient(videoRef) {
  const [status, setStatus]     = useState('idle')
  const [error, setError]       = useState(null)
  const pcRef     = useRef(null)
  const dcRef     = useRef(null)
  const signalRef = useRef(null)

  // ─── Mouse tracking state ──────────────────────────────────────────────────
  const lastMousePos = useRef({ x: 0, y: 0 })
  const mouseMoveRaf = useRef(null)     // requestAnimationFrame id
  const pendingMove  = useRef(null)     // latest pending mouse position

  // Send over data channel if open
  const sendControl = useCallback((payload) => {
    const dc = dcRef.current
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(payload))
    }
  }, [])

  // ─── Throttled mouse move via rAF ──────────────────────────────────────────
  const scheduleMouseMove = useCallback(() => {
    if (mouseMoveRaf.current) return           // already scheduled
    mouseMoveRaf.current = requestAnimationFrame(() => {
      mouseMoveRaf.current = null
      if (pendingMove.current) {
        sendControl(pendingMove.current)
        pendingMove.current = null
      }
    })
  }, [sendControl])

  // ─── Event helpers ─────────────────────────────────────────────────────────
  const getRelativePos = useCallback((el, clientX, clientY) => {
    const rect = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top)  / rect.height)),
    }
  }, [])

  const attachInputListeners = useCallback((el) => {
    if (!el) return

    // Mouse move – batched via rAF, not every pixel
    const onMouseMove = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      if (
        Math.abs(pos.x - lastMousePos.current.x) > 0.0002 ||
        Math.abs(pos.y - lastMousePos.current.y) > 0.0002
      ) {
        lastMousePos.current = pos
        pendingMove.current = { type: 'mousemove', ...pos }
        scheduleMouseMove()
      }
    }

    // Mouse buttons (left=0, middle=1, right=2)
    const onMouseDown = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      sendControl({ type: 'mousedown', button: e.button, ...pos })
    }

    const onMouseUp = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      sendControl({ type: 'mouseup', button: e.button, ...pos })
    }

    const onClick = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      sendControl({ type: 'click', button: e.button, ...pos })
    }

    const onDblClick = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      sendControl({ type: 'dblclick', button: e.button, ...pos })
    }

    const onContextMenu = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      sendControl({ type: 'contextmenu', ...pos })
    }

    // Scroll – throttled via rAF (passive: false needed to prevent default)
    let scrollRaf = null
    let pendingScroll = null
    const onWheel = (e) => {
      e.preventDefault()
      const pos = getRelativePos(el, e.clientX, e.clientY)
      pendingScroll = {
        type: 'scroll',
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ...pos,
      }
      if (!scrollRaf) {
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null
          if (pendingScroll) {
            sendControl(pendingScroll)
            pendingScroll = null
          }
        })
      }
    }

    // Keyboard – forward all keys when video is focused
    const onKeyDown = (e) => {
      e.preventDefault()
      sendControl({
        type: 'keydown',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
      })
    }
    const onKeyUp = (e) => {
      e.preventDefault()
      sendControl({
        type: 'keyup',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
      })
    }

    el.addEventListener('mousemove',   onMouseMove,   { passive: true })
    el.addEventListener('mousedown',   onMouseDown,   { passive: false })
    el.addEventListener('mouseup',     onMouseUp,     { passive: false })
    el.addEventListener('click',       onClick,       { passive: false })
    el.addEventListener('dblclick',    onDblClick,    { passive: false })
    el.addEventListener('contextmenu', onContextMenu, { passive: false })
    el.addEventListener('wheel',       onWheel,       { passive: false, capture: true })
    el.addEventListener('keydown',     onKeyDown,     { passive: false })
    el.addEventListener('keyup',       onKeyUp,       { passive: false })

    return () => {
      el.removeEventListener('mousemove',   onMouseMove)
      el.removeEventListener('mousedown',   onMouseDown)
      el.removeEventListener('mouseup',     onMouseUp)
      el.removeEventListener('click',       onClick)
      el.removeEventListener('dblclick',    onDblClick)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel',       onWheel, { capture: true })
      el.removeEventListener('keydown',     onKeyDown)
      el.removeEventListener('keyup',       onKeyUp)
      cancelAnimationFrame(scrollRaf)
      cancelAnimationFrame(mouseMoveRaf.current)
    }
  }, [sendControl, getRelativePos, scheduleMouseMove])

  // ─── Connect to session ────────────────────────────────────────────────────
  const connect = useCallback((sessionId) => {
    setStatus('connecting')
    setError(null)

    const signal = new SignalClient({
      onOpen: () => {
        signal.send({ type: 'join-session', sessionId })
      },
      onMessage: async (msg) => {
        switch (msg.type) {
          case 'offer': {
            const pc = createPeerConnection()
            pcRef.current = pc

            pc.ondatachannel = (evt) => {
              const dc = evt.channel
              dcRef.current = dc
              dc.onopen = () => {
                setStatus('connected')
                // Attach input listeners once data channel is ready
                if (videoRef.current) {
                  videoRef.current.focus()
                  attachInputListeners(videoRef.current)
                }
              }
              dc.onclose = () => setStatus('disconnected')
            }

            pc.ontrack = (evt) => {
              if (videoRef.current && evt.streams[0]) {
                videoRef.current.srcObject = evt.streams[0]
              }
            }

            pc.onicecandidate = ({ candidate }) => {
              if (candidate) {
                signal.send({ type: 'ice-candidate', candidate, to: msg.from })
              }
            }

            pc.onconnectionstatechange = () => {
              if (pc.connectionState === 'failed') {
                setStatus('error')
                setError('Connection failed. Check network / TURN config.')
              }
            }

            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            signal.send({ type: 'answer', sdp: pc.localDescription, to: msg.from })
            break
          }
          case 'ice-candidate':
            if (pcRef.current && msg.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
            }
            break
          case 'host-not-found':
            setStatus('error')
            setError('Session not found. Make sure the host is sharing.')
            break
          case 'host-rejected':
            setStatus('error')
            setError('Host denied your connection request.')
            break
          case 'host-disconnected':
            setStatus('disconnected')
            break
          default:
            break
        }
      },
      onClose: () => {
        if (status !== 'connected') setStatus('disconnected')
      },
    })

    signal.connect()
    signalRef.current = signal
  }, [videoRef, attachInputListeners])

  const disconnect = useCallback(() => {
    pcRef.current?.close()
    signalRef.current?.disconnect()
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
    setError(null)
  }, [videoRef])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { status, error, connect, disconnect }
}
