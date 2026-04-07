import { useEffect, useRef, useCallback, useState } from 'react'
import { createPeerConnection } from '../lib/webrtc'
import { SignalClient } from '../lib/signal'

/**
 * useHost - hook for the host (sharer) side.
 * Now connects to the signaling server immediately on mount.
 */
export function useHost(sessionId) {
  const [status, setStatus]             = useState('connecting') // connecting | ready | sharing | connected | error
  const [error, setError]               = useState(null)
  const [clientCount, setClientCount]   = useState(0)
  const [pendingRequests, setPendingRequests] = useState([]) // Array of clientIds
  
  const pcRef      = useRef(null)   // RTCPeerConnection (per client)
  const streamRef  = useRef(null)
  const signalRef  = useRef(null)
  const controlWsRef = useRef(null) // Connection to local native agent

  useEffect(() => {
    let reconnectTimer = null
    const connectToAgent = () => {
      const ws = new WebSocket('ws://localhost:4001')
      ws.onopen = () => console.log('[host] Connected to native agent for control')
      ws.onclose = () => {
        controlWsRef.current = null
        reconnectTimer = setTimeout(connectToAgent, 5000)
      }
      ws.onerror = () => {} // Hide console errors for missing agent
      controlWsRef.current = ws
    }
    connectToAgent()
    return () => {
      clearTimeout(reconnectTimer)
      controlWsRef.current?.close()
    }
  }, [])

  const applyRemoteControl = useCallback((data) => {
    if (controlWsRef.current && controlWsRef.current.readyState === WebSocket.OPEN) {
      controlWsRef.current.send(JSON.stringify(data))
    } else {
      console.log('[host] Remote control event (agent offline):', data)
    }
  }, [])

  const createOffer = useCallback(async (clientId) => {
    const stream = streamRef.current
    const signal = signalRef.current
    if (!stream || !signal) return

    console.log('[host] Creating offer for client:', clientId)
    const pc = createPeerConnection()
    pcRef.current = pc

    // Add screen tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    // Data channel for remote control
    const dc = pc.createDataChannel('control', { ordered: true })
    dc.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        applyRemoteControl(data)
      } catch {}
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        signal.send({ type: 'ice-candidate', candidate, to: clientId })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('[host] Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') setStatus('connected')
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setStatus(streamRef.current ? 'sharing' : 'ready')
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal.send({ type: 'offer', sdp: pc.localDescription, to: clientId })
  }, [applyRemoteControl])

  // Initialize signaling on mount
  useEffect(() => {
    if (!sessionId) return

    const signal = new SignalClient({
      onOpen: () => {
        console.log('[host] Signaling open, registering:', sessionId)
        signal.send({ type: 'register-host', sessionId })
      },
      onMessage: async (msg) => {
        switch (msg.type) {
          case 'registered':
            console.log('[host] Registered successfully')
            setStatus('ready')
            break
          case 'client-joined':
            setPendingRequests(prev => {
              if (!prev.includes(msg.clientId)) return [...prev, msg.clientId]
              return prev
            })
            break
          case 'answer':
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            }
            break
          case 'ice-candidate':
            if (pcRef.current && msg.candidate) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
            }
            break
          case 'client-left':
            setClientCount(c => Math.max(0, c - 1))
            setPendingRequests(prev => prev.filter(id => id !== msg.clientId))
            break
          case 'error':
            setError(msg.message)
            setStatus('error')
            break
          default:
            break
        }
      },
      onClose: () => {
        setStatus('disconnected')
      },
    })

    signal.connect()
    signalRef.current = signal

    return () => {
      signal.disconnect()
    }
  }, [sessionId, createOffer])

  const startSharing = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, cursor: 'always' },
        audio: false,
      })
      
      streamRef.current = stream
      setStatus('sharing')

      // Stop handling if user kills the share via browser UI
      stream.getTracks()[0].onended = () => stopSharing()

      return stream
    } catch (err) {
      console.error('[host] Screen capture failed:', err)
      throw err
    }
  }, [createOffer])

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    setClientCount(0)
    setPendingRequests([])
    
    // Switch state back to ready if signaling is still up
    if (signalRef.current?.ws?.readyState === WebSocket.OPEN) {
      setStatus('ready')
    } else {
      setStatus('disconnected')
    }
  }, [])

  const acceptRequest = useCallback(async (clientId) => {
    setPendingRequests(prev => prev.filter(id => id !== clientId))
    
    if (!streamRef.current) {
      try {
        await startSharing()
      } catch (err) {
        return // User cancelled screen selection
      }
    }
    
    await createOffer(clientId)
    setClientCount(c => c + 1)
  }, [startSharing, createOffer])

  const denyRequest = useCallback((clientId) => {
    setPendingRequests(prev => prev.filter(id => id !== clientId))
    if (signalRef.current) {
      signalRef.current.send({ type: 'host-rejected', to: clientId })
    }
  }, [])

  return { status, error, clientCount, pendingRequests, startSharing, stopSharing, acceptRequest, denyRequest }
}
