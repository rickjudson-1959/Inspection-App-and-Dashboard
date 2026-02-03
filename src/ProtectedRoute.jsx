import React from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { useOrg } from './contexts/OrgContext.jsx'

// ============================================================================
// PROTECTED ROUTE - Role-Based Access Control with Multi-Tenant Support
// January 2026 - Pipe-Up Pipeline Inspector SaaS
//
// Ensures users can only access routes they're authorized for.
// Validates organization access and redirects unauthorized users.
// ============================================================================

// Role hierarchy and landing pages (relative paths without org prefix)
export const ROLE_CONFIG = {
  admin: {
    landingPage: '/admin',
    displayName: 'Administrator',
    canAccess: ['admin', 'field-entry', 'auditor-dashboard', 'ndt-auditor', 'chief-dashboard', 'assistant-chief', 'cmt-dashboard', 'evm-dashboard', 'inspector-profile', 'dashboard', 'chief-summary', 'welding-chief']
  },
  exec: {
    landingPage: '/evm-dashboard',
    displayName: 'Executive',
    canAccess: ['evm-dashboard', 'cmt-dashboard', 'dashboard']
  },
  cm: {
    landingPage: '/cmt-dashboard',
    displayName: 'Construction Manager',
    canAccess: ['cmt-dashboard', 'evm-dashboard', 'chief-dashboard', 'chief-summary', 'dashboard']
  },
  pm: {
    landingPage: '/cmt-dashboard',
    displayName: 'Project Manager',
    canAccess: ['cmt-dashboard', 'evm-dashboard', 'chief-dashboard', 'chief-summary', 'dashboard']
  },
  chief: {
    landingPage: '/chief-dashboard',
    displayName: 'Chief Inspector',
    canAccess: ['chief-dashboard', 'cmt-dashboard', 'auditor-dashboard', 'ndt-auditor', 'field-entry', 'inspector-profile', 'chief-summary', 'dashboard', 'welding-chief']
  },
  chief_inspector: {
    landingPage: '/chief-dashboard',
    displayName: 'Chief Inspector',
    canAccess: ['chief-dashboard', 'cmt-dashboard', 'auditor-dashboard', 'ndt-auditor', 'field-entry', 'inspector-profile', 'chief-summary', 'dashboard', 'welding-chief']
  },
  asst_chief: {
    landingPage: '/assistant-chief',
    displayName: 'Assistant Chief Inspector',
    canAccess: ['assistant-chief', 'chief-dashboard', 'cmt-dashboard', 'field-entry', 'inspector-profile', 'chief-summary', 'dashboard']
  },
  ndt_auditor: {
    landingPage: '/ndt-auditor',
    displayName: 'NDT Auditor',
    canAccess: ['ndt-auditor', 'auditor-dashboard']
  },
  welding_chief: {
    landingPage: '/welding-chief',
    displayName: 'Welding Chief',
    canAccess: ['welding-chief', 'chief-dashboard', 'auditor-dashboard', 'ndt-auditor', 'field-entry', 'inspector-profile', 'chief-summary', 'dashboard']
  },
  inspector: {
    landingPage: '/inspector',
    displayName: 'Field Inspector',
    canAccess: ['inspector', 'field-entry', 'inspector-invoicing', 'timesheet', 'my-reports', 'reference-library']
  },
  super_admin: {
    landingPage: '/admin',
    displayName: 'Super Administrator',
    canAccess: ['admin', 'field-entry', 'auditor-dashboard', 'ndt-auditor', 'chief-dashboard', 'assistant-chief', 'cmt-dashboard', 'evm-dashboard', 'inspector-profile', 'dashboard', 'chief-summary', 'welding-chief']
  }
}

// Get landing page for a role (returns relative path)
export function getLandingPage(role) {
  return ROLE_CONFIG[role]?.landingPage || '/field-entry'
}

// Check if a role can access a route
export function canAccessRoute(role, routePath) {
  // Remove leading slash, org slug, and query params for matching
  let cleanPath = routePath.replace(/^\//, '').split('?')[0]

  // Remove org slug if present (first segment of path)
  const segments = cleanPath.split('/')
  if (segments.length > 1) {
    // Check if first segment looks like an org slug (not a known route)
    const knownRoutes = ['admin', 'field-entry', 'auditor-dashboard', 'ndt-auditor', 'chief-dashboard',
                         'assistant-chief', 'cmt-dashboard', 'evm-dashboard', 'inspector-profile',
                         'dashboard', 'chief-summary', 'login', 'welding-chief']
    if (!knownRoutes.includes(segments[0])) {
      // First segment is likely org slug, remove it
      cleanPath = segments.slice(1).join('/')
    }
  }

  // Admin and super_admin can access everything
  if (role === 'admin' || role === 'super_admin') {
    return true
  }

  const config = ROLE_CONFIG[role]
  if (!config) return false

  // Check exact match first
  if (config.canAccess.includes(cleanPath)) return true

  // Check base path for dynamic routes (e.g., inspector-profile/abc123 -> inspector-profile)
  const basePath = cleanPath.split('/')[0]
  return config.canAccess.includes(basePath)
}

// Get display name for a role
export function getRoleDisplayName(role) {
  return ROLE_CONFIG[role]?.displayName || role
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #e0e0e0',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 20px'
        }} />
        <p style={{ color: '#666' }}>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

// ProtectedRoute component with multi-tenant support
function ProtectedRoute({ children, requiredRoles = [], allowedRoles = [] }) {
  const { user, userProfile, loading: authLoading } = useAuth()
  const location = useLocation()
  const { orgSlug } = useParams()

  // Try to get org context - may not be available if not within OrgProvider
  let orgContext = { loading: false, error: null, currentOrganization: null }
  try {
    orgContext = useOrg() || orgContext
  } catch (e) {
    // useOrg called outside of OrgProvider - that's okay for some routes
  }

  const { loading: orgLoading, error: orgError, currentOrganization } = orgContext

  // Show loading state while auth or org is being determined
  if (authLoading || orgLoading) {
    return <LoadingSpinner />
  }

  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Get user's role (prefer 'role' field over legacy 'user_role')
  const userRole = userProfile?.role || userProfile?.user_role || 'inspector'

  // Organization error handling (not found or access denied)
  if (orgError && orgSlug) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h2 style={{ color: '#dc3545', marginBottom: '16px' }}>Access Error</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>{orgError}</p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  // Helper to build org-scoped redirect path
  const getOrgScopedPath = (path) => {
    if (orgSlug) {
      return `/${orgSlug}${path}`
    }
    // If no orgSlug in URL, redirect to root which will resolve the org
    return '/'
  }

  // If specific roles are required, check against them
  if (requiredRoles.length > 0) {
    if (!requiredRoles.includes(userRole)) {
      // User doesn't have required role - redirect to their org-scoped landing page
      const landingPage = getLandingPage(userRole)
      return <Navigate to={getOrgScopedPath(landingPage)} replace />
    }
  }

  // If allowed roles are specified, check against them
  if (allowedRoles.length > 0) {
    if (allowedRoles.includes(userRole) || userRole === 'admin' || userRole === 'super_admin') {
      // User's role is explicitly allowed - render children
      return children
    }
    // User's role is not in allowedRoles
    const landingPage = getLandingPage(userRole)
    return <Navigate to={getOrgScopedPath(landingPage)} replace />
  }

  // No allowedRoles specified - use canAccessRoute check
  const currentPath = location.pathname
  if (!canAccessRoute(userRole, currentPath)) {
    const landingPage = getLandingPage(userRole)
    return <Navigate to={getOrgScopedPath(landingPage)} replace />
  }

  // User is authorized - render the children
  return children
}

export default ProtectedRoute
