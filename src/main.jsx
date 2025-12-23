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
import ReportsPage from './ReportsPage.jsx'
import ContractorLEMs from './ContractorLEMs.jsx'
import Login from './Login.jsx'
import ResetPassword from './ResetPassword.jsx'
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
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} replace /> : <Login onLogin={() => {}} />} />

      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
          <AdminPortal />
        </ProtectedRoute>
      } />

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

      <Route path="/evm" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector', 'executive']}>
          <EVMDashboard />
        </ProtectedRoute>
      } />

      <Route path="/reconciliation" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ReconciliationDashboard />
        </ProtectedRoute>
      } />

      <Route path="/changes" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ChangeManagement />
        </ProtectedRoute>
      } />

      <Route path="/reports" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ReportsPage />
        </ProtectedRoute>
      } />

      <Route path="/contractor-lems" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector']}>
          <ContractorLEMs />
        </ProtectedRoute>
      } />

      <Route path="/inspector" element={
        <ProtectedRoute>
          <InspectorReport />
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
