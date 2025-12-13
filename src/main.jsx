import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import App from './App.jsx'
import InspectorReport from './InspectorReport.jsx'
import ReconciliationDashboard from './ReconciliationDashboard.jsx'
import ChangeManagement from './ChangeManagement.jsx'
import Login from './Login.jsx'
import './index.css'
import './App.css'

function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, userProfile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length === 0) {
    return children
  }

  if (userProfile && allowedRoles.includes(userProfile.role)) {
    return children
  }

  if (userProfile?.role === 'inspector') {
    return <Navigate to="/inspector" replace />
  }

  return <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={() => {}} />} />

      <Route path="/" element={
        <ProtectedRoute allowedRoles={['admin', 'pm', 'cm', 'chief_inspector', 'executive']}>
          <App />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin', 'pm', 'cm', 'chief_inspector', 'executive']}>
          <App />
        </ProtectedRoute>
      } />

      <Route path="/inspector" element={
        <ProtectedRoute>
          <InspectorReport />
        </ProtectedRoute>
      } />

      <Route path="/reconciliation" element={
        <ProtectedRoute allowedRoles={['admin', 'pm', 'cm', 'chief_inspector']}>
          <ReconciliationDashboard />
        </ProtectedRoute>
      } />
      <Route path="/changes" element={
        <ProtectedRoute allowedRoles={['admin', 'pm', 'cm', 'chief_inspector']}>
          <ChangeManagement />
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)