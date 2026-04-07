import { useEffect, useRef, useCallback, useState } from 'react'
import { createPeerConnection } from '../lib/webrtc'
import { SignalClient } from '../lib/signal'

export function useHost(sessionId) {
  const [status, setStatus]       = useState('idle')   // idle | sharing | connected | error
  const [clientCount, setClientCount] = useState(0)
  const pcRef      = useRef(null)   // RTCPeerConnection (per client)
  const dcRef      = useRef(null)   // DataChannel for control
  const streamRef  = useRef(null)
  const signalRef  = useRef(null)

  const applyRemoteControl = useCallback((data) => {
    // In browser context, host can't inject OS events — relay to mac-agent via data channel feedback
    // The data channel message is forwarded to the mac-agent ws proxy
    console.log('[host] remote control:', data)
  }, [])

  const startSharing = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, cursor: 'always' },
        audio: false,
      })
      streamRef.current = stream
      setStatus('sharing')
      return stream
    } catch (err) {
      console.error('Screen capture failed', err)
      setStatus('error')
      throw err
    }
  }, [])

  const initSignaling = useCallback((stream) => {
    const signal = new SignalClient({
      onOpen: () => {
        signal.send({ type: 'register-host', sessionId })
        setStatus('sharing')
      },
      onMessage: async (msg) => {
        switch (msg.type) {
          case 'client-joined':
            setClientCount(c => c + 1)
            await createOffer(stream, signal, msg.clientId)
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
            break
          default:
            break
        }
      },
      onClose: () => setStatus('disconnected'),
    })
    signal.connect()
    signalRef.current = signal
  }, [sessionId])

  const createOffer = async (stream, signal, clientId) => {
    const pc = createPeerConnection()
    pcRef.current = pc

    // Add screen tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    // Data channel for remote control events
    const dc = pc.createDataChannel('control', { ordered: true })
    dcRef.current = dc
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
      if (pc.connectionState === 'connected') setStatus('connected')
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) setStatus('sharing')
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal.send({ type: 'offer', sdp: pc.localDescription, to: clientId })
  }

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    signalRef.current?.disconnect()
    setStatus('idle')
    setClientCount(0)
  }, [])

  useEffect(() => {
    return () => stopSharing()
  }, [stopSharing])

  return { status, clientCount, startSharing, initSignaling, stopSharing }
}
