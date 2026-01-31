import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import ProtectedRoute, { getLandingPage } from './ProtectedRoute.jsx'
import { OrgProvider } from './contexts/OrgContext.jsx'
import { supabase } from './supabase'
console.log('[App.jsx] About to import OfflineStatusBar')
import OfflineStatusBar from './components/OfflineStatusBar.jsx'
console.log('[App.jsx] OfflineStatusBar imported:', OfflineStatusBar)

// ============================================================================
// Multi-Tenant App with Org-Scoped Routing
// URL Structure: /:orgSlug/dashboard, /:orgSlug/field-entry, etc.
// ============================================================================

// Import your existing components
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

// Root redirect - sends users to their org-scoped, role-specific landing page
function RootRedirect() {
  const { user, userProfile, loading } = useAuth()
  const [orgSlug, setOrgSlug] = useState(null)
  const [orgLoading, setOrgLoading] = useState(true)

  useEffect(() => {
    async function fetchDefaultOrg() {
      if (!user) {
        setOrgLoading(false)
        return
      }

      try {
        // First check if user is super_admin - they can go to any org
        if (userProfile?.role === 'super_admin') {
          // Get first available org for super admin
          const { data: orgs } = await supabase
            .from('organizations')
            .select('slug')
            .order('name')
            .limit(1)

          if (orgs && orgs.length > 0) {
            setOrgSlug(orgs[0].slug)
          } else {
            setOrgSlug('default')
          }
          setOrgLoading(false)
          return
        }

        // Regular user: get their default membership
        const { data: memberships } = await supabase
          .from('memberships')
          .select('organization:organizations(slug), is_default')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })

        if (memberships && memberships.length > 0) {
          // Prefer default membership, otherwise first one
          const defaultMembership = memberships.find(m => m.is_default) || memberships[0]
          setOrgSlug(defaultMembership.organization?.slug || 'default')
        } else {
          // No memberships - fallback to default org
          // This handles legacy users before multi-tenant migration
          setOrgSlug('default')
        }
      } catch (err) {
        console.error('Error fetching default org:', err)
        setOrgSlug('default')
      }
      setOrgLoading(false)
    }

    if (userProfile) {
      fetchDefaultOrg()
    }
  }, [user, userProfile])

  if (loading || orgLoading) {
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

  // Redirect to org-scoped landing page
  return <Navigate to={`/${orgSlug}${landingPage}`} replace />
}

// Org-scoped routes - all routes within an organization context
function OrgRoutes() {
  return (
    <Routes>
      {/* Field Entry - Inspector */}
      <Route path="field-entry" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorReport />
        </ProtectedRoute>
      } />

      {/* NDT Auditor */}
      <Route path="ndt-auditor" element={
        <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'admin', 'super_admin']}>
          <NDTAuditorDashboard />
        </ProtectedRoute>
      } />

      {/* Auditor Dashboard */}
      <Route path="auditor-dashboard" element={
        <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'admin', 'super_admin']}>
          <AuditorDashboard />
        </ProtectedRoute>
      } />

      {/* Assistant Chief */}
      <Route path="assistant-chief" element={
        <ProtectedRoute allowedRoles={['asst_chief', 'chief', 'admin', 'super_admin']}>
          <AssistantChiefDashboard />
        </ProtectedRoute>
      } />

      {/* Chief Dashboard */}
      <Route path="chief-dashboard" element={
        <ProtectedRoute allowedRoles={['chief', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
          <ChiefDashboard />
        </ProtectedRoute>
      } />

      {/* Chief Construction Summary (EGP Legacy Format) */}
      <Route path="chief-summary" element={
        <ProtectedRoute allowedRoles={['chief', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
          <ChiefConstructionSummary />
        </ProtectedRoute>
      } />

      {/* CMT Dashboard - also accessible via /dashboard alias */}
      <Route path="cmt-dashboard" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'asst_chief', 'exec', 'admin', 'super_admin']}>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="dashboard" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'asst_chief', 'exec', 'admin', 'super_admin']}>
          <Dashboard />
        </ProtectedRoute>
      } />

      {/* EVM Dashboard */}
      <Route path="evm-dashboard" element={
        <ProtectedRoute allowedRoles={['exec', 'cm', 'pm', 'admin', 'super_admin']}>
          <EVMDashboard />
        </ProtectedRoute>
      } />

      {/* Admin Portal */}
      <Route path="admin" element={
        <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
          <AdminPortal />
        </ProtectedRoute>
      } />

      {/* Inspector Profile View */}
      <Route path="inspector-profile/:id" element={
        <ProtectedRoute allowedRoles={['admin', 'super_admin', 'chief', 'asst_chief']}>
          <InspectorProfileView />
        </ProtectedRoute>
      } />

      {/* Catch-all within org scope - redirect to dashboard */}
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <OfflineStatusBar />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Root - redirects to org-scoped landing page */}
          <Route path="/" element={<RootRedirect />} />

          {/* Org-scoped routes */}
          <Route path="/:orgSlug/*" element={
            <OrgProvider>
              <OrgRoutes />
            </OrgProvider>
          } />

          {/* Legacy routes - redirect to root (which will redirect to org-scoped) */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/cmt-dashboard" element={<Navigate to="/" replace />} />
          <Route path="/chief-dashboard" element={<Navigate to="/" replace />} />
          <Route path="/chief" element={<Navigate to="/" replace />} />
          <Route path="/field-entry" element={<Navigate to="/" replace />} />
          <Route path="/inspector" element={<Navigate to="/" replace />} />
          <Route path="/auditor-dashboard" element={<Navigate to="/" replace />} />
          <Route path="/auditor" element={<Navigate to="/" replace />} />
          <Route path="/assistant-chief" element={<Navigate to="/" replace />} />
          <Route path="/ndt-auditor" element={<Navigate to="/" replace />} />
          <Route path="/evm-dashboard" element={<Navigate to="/" replace />} />
          <Route path="/admin" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
