import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import ProtectedRoute, { getLandingPage } from './ProtectedRoute.jsx'
console.log('[App.jsx] About to import OfflineStatusBar')
import OfflineStatusBar from './components/OfflineStatusBar.jsx'
console.log('[App.jsx] OfflineStatusBar imported:', OfflineStatusBar)

// ============================================================================
// CHUNK 2: APP.JSX - Role-Based Routing
// Replace your existing App.jsx with this
// ============================================================================

// Import your existing components (adjust paths as needed)
import Login from './Login.jsx'
import InspectorReport from './InspectorReport.jsx'
import Dashboard from './Dashboard.jsx'                    // CMT Dashboard
import EVMDashboard from './EVMDashboard.jsx'
import ChiefDashboard from './ChiefDashboard.jsx'
import AssistantChiefDashboard from './AssistantChiefDashboard.jsx'
import AuditorDashboard from './AuditorDashboard.jsx'
import NDTAuditorDashboard from './NDTAuditorDashboard.jsx'
import AdminPortal from './AdminPortal.jsx'
import InspectorProfileView from './InspectorProfileView.jsx'
import ChiefConstructionSummary from './ChiefConstructionSummary.jsx'

// Root redirect - sends users to their role-specific landing page
function RootRedirect() {
  const { user, userProfile, loading } = useAuth()
  
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  const userRole = userProfile?.user_role || userProfile?.role || 'inspector'
  const landingPage = getLandingPage(userRole)
  
  return <Navigate to={landingPage} replace />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <OfflineStatusBar />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          
          {/* Root - redirects based on role */}
          <Route path="/" element={<RootRedirect />} />
          
          {/* Field Entry - Inspector */}
          <Route path="/field-entry" element={
            <ProtectedRoute allowedRoles={['inspector', 'chief', 'asst_chief', 'admin', 'super_admin']}>
              <InspectorReport />
            </ProtectedRoute>
          } />
          
          {/* NDT Auditor */}
          <Route path="/ndt-auditor" element={
            <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'admin', 'super_admin']}>
              <NDTAuditorDashboard />
            </ProtectedRoute>
          } />
          
          {/* Auditor Dashboard */}
          <Route path="/auditor-dashboard" element={
            <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'admin', 'super_admin']}>
              <AuditorDashboard />
            </ProtectedRoute>
          } />
          
          {/* Assistant Chief */}
          <Route path="/assistant-chief" element={
            <ProtectedRoute allowedRoles={['asst_chief', 'chief', 'admin', 'super_admin']}>
              <AssistantChiefDashboard />
            </ProtectedRoute>
          } />
          
          {/* Chief Dashboard */}
          <Route path="/chief-dashboard" element={
            <ProtectedRoute allowedRoles={['chief', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
              <ChiefDashboard />
            </ProtectedRoute>
          } />

          {/* Chief Construction Summary (EGP Legacy Format) */}
          <Route path="/chief-summary" element={
            <ProtectedRoute allowedRoles={['chief', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
              <ChiefConstructionSummary />
            </ProtectedRoute>
          } />
          
          {/* CMT Dashboard */}
          <Route path="/cmt-dashboard" element={
            <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'asst_chief', 'exec', 'admin', 'super_admin']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          {/* EVM Dashboard */}
          <Route path="/evm-dashboard" element={
            <ProtectedRoute allowedRoles={['exec', 'cm', 'pm', 'admin', 'super_admin']}>
              <EVMDashboard />
            </ProtectedRoute>
          } />
          
          {/* Admin Portal */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
              <AdminPortal />
            </ProtectedRoute>
          } />

          {/* Inspector Profile View */}
          <Route path="/inspector-profile/:id" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin', 'chief', 'asst_chief']}>
              <InspectorProfileView />
            </ProtectedRoute>
          } />
          
          {/* Legacy routes - redirect to new paths */}
          <Route path="/dashboard" element={<Navigate to="/cmt-dashboard" replace />} />
          <Route path="/chief" element={<Navigate to="/chief-dashboard" replace />} />
          <Route path="/inspector" element={<Navigate to="/field-entry" replace />} />
          <Route path="/auditor" element={<Navigate to="/auditor-dashboard" replace />} />
          
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
