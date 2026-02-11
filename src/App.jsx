import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import ProtectedRoute, { getLandingPage } from './ProtectedRoute.jsx'
import { OrgProvider } from './contexts/OrgContext.jsx'
import { supabase } from './supabase'
import OfflineStatusBar from './components/OfflineStatusBar.jsx'
import UpdatePrompt from './components/UpdatePrompt.jsx'

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
import InspectorApp from './InspectorApp.jsx'
import ReportViewer from './ReportViewer.jsx'
import ReconciliationDashboard from './ReconciliationDashboard.jsx'
import ChangeManagement from './ChangeManagement.jsx'
import ReportsPage from './ReportsPage.jsx'
import ContractorLEMs from './ContractorLEMs.jsx'
import ResetPassword from './ResetPassword.jsx'
import InspectorInvoicingDashboard from './InspectorInvoicingDashboard.jsx'
import HireOnPackage from './HireOnPackage.jsx'
import TimesheetEditor from './TimesheetEditor.jsx'
import TimesheetReview from './TimesheetReview.jsx'
import ReferenceLibrary from './ReferenceLibrary.jsx'
import WeldingChiefDashboard from './WeldingChiefDashboard.jsx'

// Root redirect - sends users to their org-scoped, role-specific landing page
function RootRedirect() {
  const { user, userProfile, loading } = useAuth()
  const [orgSlug, setOrgSlug] = useState(null)
  const [orgLoading, setOrgLoading] = useState(true)

  useEffect(() => {
    async function fetchDefaultOrg() {
      if (!user || !userProfile) {
        setOrgLoading(false)
        return
      }

      try {
        // First check if user is super_admin - default to Default Organization
        if (userProfile?.role === 'super_admin') {
          setOrgSlug('default')
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
    } else if (!loading && !user) {
      // Not loading and no user - definitely not logged in
      setOrgLoading(false)
    }
    // If loading is false but user exists without userProfile, wait for profile to load
  }, [user, userProfile, loading])

  // Wait for auth to finish loading
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    )
  }

  // If user exists but profile hasn't loaded yet, wait
  if (user && !userProfile) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading profile...</p>
      </div>
    )
  }

  // Wait for org to finish loading
  if (orgLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading organization...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const userRole = userProfile?.role || userProfile?.user_role || 'inspector'
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
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorReport />
        </ProtectedRoute>
      } />

      {/* NDT Auditor */}
      <Route path="ndt-auditor" element={
        <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'chief_inspector', 'admin', 'super_admin']}>
          <NDTAuditorDashboard />
        </ProtectedRoute>
      } />

      {/* Auditor Dashboard */}
      <Route path="auditor-dashboard" element={
        <ProtectedRoute allowedRoles={['ndt_auditor', 'chief', 'chief_inspector', 'admin', 'super_admin']}>
          <AuditorDashboard />
        </ProtectedRoute>
      } />

      {/* Assistant Chief */}
      <Route path="assistant-chief" element={
        <ProtectedRoute allowedRoles={['asst_chief', 'chief', 'chief_inspector', 'admin', 'super_admin']}>
          <AssistantChiefDashboard />
        </ProtectedRoute>
      } />

      {/* Chief Dashboard */}
      <Route path="chief-dashboard" element={
        <ProtectedRoute allowedRoles={['chief', 'chief_inspector', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
          <ChiefDashboard />
        </ProtectedRoute>
      } />

      {/* Chief Construction Summary (EGP Legacy Format) */}
      <Route path="chief-summary" element={
        <ProtectedRoute allowedRoles={['chief', 'chief_inspector', 'asst_chief', 'cm', 'pm', 'admin', 'super_admin']}>
          <ChiefConstructionSummary />
        </ProtectedRoute>
      } />

      {/* CMT Dashboard - also accessible via /dashboard alias */}
      <Route path="cmt-dashboard" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'exec', 'admin', 'super_admin']}>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="dashboard" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'exec', 'admin', 'super_admin']}>
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
        <ProtectedRoute allowedRoles={['admin', 'super_admin', 'chief', 'chief_inspector', 'asst_chief']}>
          <InspectorProfileView />
        </ProtectedRoute>
      } />

      {/* Reconciliation Dashboard */}
      <Route path="reconciliation" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ReconciliationDashboard />
        </ProtectedRoute>
      } />

      {/* Change Management */}
      <Route path="changes" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ChangeManagement />
        </ProtectedRoute>
      } />

      {/* Reports Page */}
      <Route path="reports" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ReportsPage />
        </ProtectedRoute>
      } />

      {/* Contractor LEMs */}
      <Route path="contractor-lems" element={
        <ProtectedRoute allowedRoles={['cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ContractorLEMs />
        </ProtectedRoute>
      } />

      {/* Report Viewer */}
      <Route path="report" element={
        <ProtectedRoute allowedRoles={['inspector', 'cm', 'pm', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ReportViewer />
        </ProtectedRoute>
      } />

      {/* Inspector App */}
      <Route path="inspector" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorApp />
        </ProtectedRoute>
      } />

      {/* My Reports */}
      <Route path="my-reports" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorApp />
        </ProtectedRoute>
      } />

      {/* Report Edit */}
      <Route path="report/edit/:reportId" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorApp />
        </ProtectedRoute>
      } />

      {/* Inspector Invoicing */}
      <Route path="inspector-invoicing" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <InspectorInvoicingDashboard />
        </ProtectedRoute>
      } />

      {/* Hire-On Package */}
      <Route path="hire-on" element={
        <ProtectedRoute>
          <HireOnPackage />
        </ProtectedRoute>
      } />

      {/* Timesheet Editor */}
      <Route path="timesheet" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <TimesheetEditor />
        </ProtectedRoute>
      } />

      {/* Timesheet Review */}
      <Route path="timesheet-review" element={
        <ProtectedRoute allowedRoles={['chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <TimesheetReview />
        </ProtectedRoute>
      } />

      {/* Reference Library */}
      <Route path="reference-library" element={
        <ProtectedRoute allowedRoles={['inspector', 'chief', 'chief_inspector', 'asst_chief', 'admin', 'super_admin']}>
          <ReferenceLibrary />
        </ProtectedRoute>
      } />

      {/* Welding Chief Dashboard */}
      <Route path="welding-chief" element={
        <ProtectedRoute allowedRoles={['welding_chief', 'chief', 'chief_inspector', 'admin', 'super_admin']}>
          <WeldingChiefDashboard />
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
        <UpdatePrompt />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

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
