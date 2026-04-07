import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHost } from '../hooks/useHost'

function generateSessionId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) id += '-'
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

const STATUS_CONFIG = {
  connecting:   { color: 'bg-yellow-400', label: 'Connecting signaling...' },
  ready:        { color: 'bg-green-400',  label: 'Ready to share' },
  sharing:      { color: 'bg-primary',    label: 'Waiting for client...' },
  connected:    { color: 'bg-primary',    label: 'Client connected' },
  disconnected: { color: 'bg-red-400',    label: 'Disconnected' },
  error:        { color: 'bg-red-500',    label: 'Error' },
}

export default function HostDashboard() {
  const navigate = useNavigate()
  const [sessionId]  = useState(generateSessionId)
  const [copied, setCopied] = useState(false)
  const localVideoRef = useRef(null)

  const { status, error, clientCount, pendingRequests, startSharing, stopSharing, acceptRequest, denyRequest } = useHost(sessionId)

  const handleStartSharing = useCallback(async () => {
    try {
      const stream = await startSharing()
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    } catch {}
  }, [startSharing])

  const handleStop = useCallback(() => {
    stopSharing()
    if (localVideoRef.current) localVideoRef.current.srcObject = null
  }, [stopSharing])

  const copySessionId = useCallback(async () => {
    await navigator.clipboard.writeText(sessionId).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [sessionId])

  const cfg = STATUS_CONFIG[status] || { color: 'bg-gray-500', label: status || 'Idle' }

  return (
    <div className="min-h-screen bg-dark p-4">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white transition-colors">← Back</button>
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left panel */}
          <div className="flex flex-col gap-4">
            {/* Status */}
            <div className="card">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Status</h2>
              <div className="flex items-center gap-2">
                <span className={`status-dot ${cfg.color} ${['connecting', 'sharing'].includes(status) ? 'animate-pulse' : ''}`} />
                <span className="font-semibold">{cfg.label}</span>
              </div>
              {status === 'connected' && (
                <p className="text-green-400 text-sm mt-1">{clientCount} client(s) connected</p>
              )}
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>

            {/* Session ID */}
            <div className="card">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Session ID</h2>
              <div className="flex items-center gap-2">
                <code className="text-2xl font-bold tracking-widest text-primary flex-1">{sessionId}</code>
                <button
                  onClick={copySessionId}
                  className="text-sm btn-secondary py-1.5 px-3 rounded-lg"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-2">Share this code with the person you want to give access to.</p>
            </div>

            {/* Controls */}
            <div className="card">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Controls</h2>
              
              {status === 'connecting' && (
                <button disabled className="btn-primary w-full opacity-50 cursor-not-allowed">
                  Connecting...
                </button>
              )}

              {/* Remove Start Sharing button, we wait for incoming requests */}

              {['sharing', 'connected'].includes(status) && (
                <button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-6 rounded-xl w-full transition-all">
                  Stop Sharing
                </button>
              )}

              {['disconnected', 'error'].includes(status) && (
                <button onClick={() => window.location.reload()} className="btn-secondary w-full">
                  Retry Connection
                </button>
              )}
            </div>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="card border-2 border-primary animate-in fade-in slide-in-from-top-2">
                <h2 className="text-sm text-primary font-bold mb-3 uppercase tracking-widest">Connection Request</h2>
                <p className="text-gray-300 text-sm mb-4">A client wants to connect to your screen.</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => acceptRequest(pendingRequests[0])} className="btn-primary w-full">Give Full Access</button>
                  <button onClick={() => denyRequest(pendingRequests[0])} className="btn-secondary w-full">Deny</button>
                </div>
                {pendingRequests.length > 1 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">+{pendingRequests.length - 1} more waiting</p>
                )}
              </div>
            )}


            {/* Info */}
            <div className="card text-sm text-gray-400 space-y-2">
              <p>🔒 Screen stream is end-to-end encrypted via WebRTC.</p>
              <p>🖱 Clients can control your mouse & keyboard.</p>
              <p>📡 Session expires when you stop sharing.</p>
            </div>
          </div>

          {/* Video preview */}
          <div className="lg:col-span-2">
            <div className="card h-full min-h-[340px] flex flex-col">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Local Preview</h2>
              <div className="flex-1 rounded-xl overflow-hidden bg-black relative">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
                {['idle', 'ready'].includes(status) && pendingRequests.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                    <div className="text-5xl mb-3">🖥️</div>
                    <p>Share your Session ID for the client to connect</p>
                  </div>
                )}
                {pendingRequests.length > 0 && ['idle', 'ready'].includes(status) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-primary bg-black/60 backdrop-blur-sm z-10">
                    <div className="text-5xl mb-3 animate-bounce">🔔</div>
                    <p className="font-semibold text-lg">Connection Request Pending...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
