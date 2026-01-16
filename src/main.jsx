import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import AdminPortal from './AdminPortal.jsx'
import Dashboard from './Dashboard.jsx'
import EVMDashboard from './EVMDashboard.jsx'
import InspectorApp from './InspectorApp.jsx'
import ReportViewer from './ReportViewer.jsx'
import ReconciliationDashboard from './ReconciliationDashboard.jsx'
import ChangeManagement from './ChangeManagement.jsx'
import ReportsPage from './ReportsPage.jsx'
import ContractorLEMs from './ContractorLEMs.jsx'
import ChiefDashboard from './ChiefDashboard.jsx'
import AssistantChiefDashboard from "./AssistantChiefDashboard.jsx"
import NDTAuditorDashboard from './NDTAuditorDashboard.jsx'
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

  // Admin "god mode" - super_admin and admin can access any route
  if (userProfile && (userProfile.role === 'super_admin' || userProfile.role === 'admin')) {
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
  if (userProfile?.role === 'chief_inspector') {
    return <Navigate to="/chief" replace />
  }

  // Default redirect for admins to admin portal
  if (userProfile?.role === 'super_admin' || userProfile?.role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  return <Navigate to="/" replace />
}

function AppRoutes() {
  const { user, userProfile, loading, signOut } = useAuth()

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
      case 'chief_inspector':
        return '/chief'
      case 'pm':
      case 'cm':
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

      <Route path="/auditor-dashboard" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'chief_inspector']}>
          <NDTAuditorDashboard />
        </ProtectedRoute>
      } />
      <Route path="/chief" element={
        <ProtectedRoute allowedRoles={["super_admin", "admin", "chief_inspector"]}>
          <ChiefDashboard />
        </ProtectedRoute>
      } />

      <Route path="/assistant-chief" element={
        <ProtectedRoute allowedRoles={["super_admin", "admin", "chief_inspector", "assistant_chief_inspector"]}>
          <AssistantChiefDashboard />
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

      {/* Report Viewer - for viewing individual reports */}
      <Route path="/report" element={
        <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pm', 'cm', 'chief_inspector', 'inspector']}>
          <ReportViewer />
        </ProtectedRoute>
      } />

      {/* Inspector routes - now uses InspectorApp with My Reports */}
      <Route path="/inspector" element={
        <ProtectedRoute>
          <InspectorApp user={userProfile} onSignOut={signOut} />
        </ProtectedRoute>
      } />

      <Route path="/my-reports" element={
        <ProtectedRoute>
          <InspectorApp user={userProfile} onSignOut={signOut} />
        </ProtectedRoute>
      } />

      <Route path="/report/edit/:reportId" element={
        <ProtectedRoute>
          <InspectorApp user={userProfile} onSignOut={signOut} />
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
