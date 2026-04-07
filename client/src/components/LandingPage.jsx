import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-dark px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-6xl mb-4">🖥️</div>
        <h1 className="text-4xl font-bold text-white mb-2">RemoteDesk</h1>
        <p className="text-gray-400 text-lg">Secure, low-latency remote desktop powered by WebRTC</p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-xl">
        {/* Host */}
        <button
          onClick={() => navigate('/host')}
          className="flex-1 card hover:border-primary transition-all duration-200 hover:shadow-[0_0_24px_rgba(108,99,255,0.3)] text-left cursor-pointer group"
        >
          <div className="text-3xl mb-3">📡</div>
          <h2 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">Share My Screen</h2>
          <p className="text-gray-400 text-sm">Become a host. Generate a session ID and let clients connect to view and control your screen.</p>
        </button>

        {/* Client */}
        <button
          onClick={() => navigate('/client')}
          className="flex-1 card hover:border-primary transition-all duration-200 hover:shadow-[0_0_24px_rgba(108,99,255,0.3)] text-left cursor-pointer group"
        >
          <div className="text-3xl mb-3">🔌</div>
          <h2 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">Connect to Screen</h2>
          <p className="text-gray-400 text-sm">Enter a session ID to connect to a host's screen and take remote control.</p>
        </button>
      </div>

      {/* Footer */}
      <p className="mt-12 text-gray-600 text-sm text-center">
        WebRTC encrypted • No data stored • Open source
      </p>
    </div>
  )
}
