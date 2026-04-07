import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import HostDashboard from './components/HostDashboard'
import ClientConnect from './components/ClientConnect'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/host" element={<HostDashboard />} />
      <Route path="/client" element={<ClientConnect />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
