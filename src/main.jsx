import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import AdminPortal from './AdminPortal.jsx'
import Dashboard from './Dashboard.jsx'
import EVMDashboard from './EVMDashboard.jsx'
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

  // Redirect based on role
  if (userProfile?.role === 'inspector') {
    return <Navigate to="/inspector" replace />
  }
  if (userProfile?.role === 'executive') {
    return <Navigate to="/evm" replace />
  }

  return <Navigate to="/" replace />
}

function AppRoutes() {
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

  // Redirect based on role after login
  function getDefaultRoute() {
    if (!userProfile) return '/login'
    switch (userProfile.role) {
      case 'super_admin':
      case 'admin':
        return '/admin'
      case 'executive':
        return '/evm'
      case 'pm':
      case 'cm':
      case 'chief_inspector':
        return '/dashboard'
      case 'inspector':
        return '/inspector'
      default:
        return '/login'
    }
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} replace /> : <Login onLogin={() => {}} />} />

      {/* Admin Portal - super_admin and admin only */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
          <AdminPortal />
        </ProtectedRoute>
      } />

      {/* Executive Dashboard - for PM, CM, Chief, Admin */}
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <Dashboard />
        </ProtectedRoute>
      } />

      {/* EVM Dashboard - for executives and above */}
      <Route path="/evm" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector', 'executive']}>
          <EVMDashboard />
        </ProtectedRoute>
      } />

      {/* Reconciliation - view for PM/CM/Chief, edit for admin */}
      <Route path="/reconciliation" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ReconciliationDashboard />
        </ProtectedRoute>
      } />

      {/* Change Orders - view for PM/CM/Chief, edit for admin */}
      <Route path="/changes" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ChangeManagement />
        </ProtectedRoute>
      } />

      {/* Inspector Form - all authenticated users can access */}
      <Route path="/inspector" element={
        <ProtectedRoute>
          <InspectorReport />
        </ProtectedRoute>
      } />

      {/* Catch all */}
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