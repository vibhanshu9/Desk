import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClient } from '../hooks/useClient'

const STATUS_CONFIG = {
  idle:         { color: 'bg-gray-500',   label: 'Disconnected' },
  connecting:   { color: 'bg-yellow-400', label: 'Connecting...' },
  connected:    { color: 'bg-green-400',  label: 'Connected' },
  disconnected: { color: 'bg-red-400',    label: 'Disconnected' },
  error:        { color: 'bg-red-500',    label: 'Error' },
}

export default function ClientConnect() {
  const navigate = useNavigate()
  const [sessionInput, setSessionInput] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const videoRef      = useRef(null)
  const containerRef  = useRef(null)

  const { status, error, connect, disconnect } = useClient(videoRef)

  const handleConnect = useCallback(() => {
    const id = sessionInput.trim().toUpperCase()
    if (!id) return
    connect(id)
  }, [sessionInput, connect])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleConnect()
  }, [handleConnect])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // When connected, make video focusable for keyboard forwarding
  useEffect(() => {
    if (status === 'connected' && videoRef.current) {
      videoRef.current.focus()
    }
  }, [status])

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle
  const isActive = ['connecting', 'connected'].includes(status)

  return (
    <div className="min-h-screen bg-dark p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { disconnect(); navigate('/') }} className="text-gray-400 hover:text-white transition-colors">← Back</button>
          <h1 className="text-2xl font-bold">Connect to Remote</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left panel */}
          <div className="flex flex-col gap-4">
            {/* Status */}
            <div className="card">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Status</h2>
              <div className="flex items-center gap-2">
                <span className={`status-dot ${cfg.color} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
                <span className="font-semibold">{cfg.label}</span>
              </div>
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </div>

            {/* Session input */}
            <div className="card">
              <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Session ID</h2>
              <input
                type="text"
                className="input-field mb-3 uppercase tracking-widest text-lg font-bold"
                placeholder="XXXX-XXXX"
                value={sessionInput}
                onChange={e => setSessionInput(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={9}
                disabled={isActive}
                spellCheck={false}
              />
              {!isActive ? (
                <button
                  onClick={handleConnect}
                  disabled={!sessionInput.trim()}
                  className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              ) : (
                <button onClick={disconnect} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-6 rounded-xl w-full transition-all">
                  Disconnect
                </button>
              )}
            </div>

            {/* Controls */}
            {status === 'connected' && (
              <div className="card">
                <h2 className="text-sm text-gray-400 mb-3 uppercase tracking-widest">Controls</h2>
                <button onClick={toggleFullscreen} className="btn-secondary w-full mb-2">
                  {isFullscreen ? '⊡ Exit Fullscreen' : '⛶ Fullscreen'}
                </button>
                <p className="text-gray-500 text-xs">Click on the screen to enable keyboard & mouse control.</p>
              </div>
            )}

            {/* Tips */}
            <div className="card text-sm text-gray-400 space-y-1.5">
              <p>🖱 Mouse moves are tracked smoothly.</p>
              <p>⌨️ Keyboard forwarded when screen is focused.</p>
              <p>🖱 Scroll wheel supported.</p>
              <p>🔒 Encrypted WebRTC stream.</p>
            </div>
          </div>

          {/* Remote screen */}
          <div className="lg:col-span-2" ref={containerRef}>
            <div className="card h-full min-h-[340px] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm text-gray-400 uppercase tracking-widest">Remote Screen</h2>
                {status === 'connected' && (
                  <span className="text-xs text-green-400 font-semibold">● LIVE</span>
                )}
              </div>
              <div
                className="flex-1 rounded-xl overflow-hidden bg-black relative select-none"
                style={{ cursor: status === 'connected' ? 'none' : 'default' }}
              >
                {/* Remote video — tabIndex makes it focusable for keyboard events */}
                <video
                  ref={videoRef}
                  id="remote-screen"
                  autoPlay
                  playsInline
                  tabIndex={0}
                  className="w-full h-full object-contain outline-none"
                  style={{ pointerEvents: status === 'connected' ? 'auto' : 'none' }}
                />

                {/* Custom cursor overlay */}
                {status === 'connected' && <CursorOverlay videoRef={videoRef} />}

                {/* Placeholder */}
                {status !== 'connected' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 pointer-events-none">
                    {status === 'connecting' ? (
                      <>
                        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                        <p>Connecting to host...</p>
                      </>
                    ) : (
                      <>
                        <div className="text-5xl mb-3">🔌</div>
                        <p>Enter a session ID to connect</p>
                      </>
                    )}
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

/**
 * CursorOverlay – renders a custom cursor that mirrors the real cursor position
 * within the video element (since we hide the real cursor with cursor:none).
 */
function CursorOverlay({ videoRef }) {
  const cursorRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const move = (e) => {
      if (!cursorRef.current) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      cursorRef.current.style.transform = `translate(${x}px, ${y}px)`
      cursorRef.current.style.opacity = '1'
    }

    const leave = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = '0'
    }

    el.addEventListener('mousemove', move, { passive: true })
    el.addEventListener('mouseleave', leave, { passive: true })
    return () => {
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseleave', leave)
    }
  }, [videoRef])

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none absolute top-0 left-0 z-10 opacity-0 transition-opacity duration-100"
      style={{ willChange: 'transform' }}
    >
      {/* SVG arrow cursor */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 2L8 18L11 11L18 8L2 2Z" fill="white" stroke="black" strokeWidth="1.5"/>
      </svg>
    </div>
  )
}
