import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

// ============================================================================
// PROTECTED ROUTE - Role-Based Access Control
// January 2026 - Pipe-Up Pipeline Inspector SaaS
// 
// Ensures users can only access routes they're authorized for.
// Redirects unauthorized users to their appropriate landing page.
// ============================================================================

// Role hierarchy and landing pages
export const ROLE_CONFIG = {
  admin: {
    landingPage: '/admin',
    displayName: 'Administrator',
    canAccess: ['admin', 'field-entry', 'auditor-dashboard', 'ndt-auditor', 'chief-dashboard', 'assistant-chief', 'cmt-dashboard', 'evm-dashboard']
  },
  exec: {
    landingPage: '/evm-dashboard',
    displayName: 'Executive',
    canAccess: ['evm-dashboard', 'cmt-dashboard']
  },
  cm: {
    landingPage: '/cmt-dashboard',
    displayName: 'Construction Manager',
    canAccess: ['cmt-dashboard', 'evm-dashboard', 'chief-dashboard']
  },
  pm: {
    landingPage: '/cmt-dashboard',
    displayName: 'Project Manager',
    canAccess: ['cmt-dashboard', 'evm-dashboard', 'chief-dashboard']
  },
  chief: {
    landingPage: '/chief-dashboard',
    displayName: 'Chief Inspector',
    canAccess: ['chief-dashboard', 'cmt-dashboard', 'auditor-dashboard', 'ndt-auditor', 'field-entry']
  },
  asst_chief: {
    landingPage: '/assistant-chief',
    displayName: 'Assistant Chief Inspector',
    canAccess: ['assistant-chief', 'chief-dashboard', 'cmt-dashboard', 'field-entry']
  },
  ndt_auditor: {
    landingPage: '/ndt-auditor',
    displayName: 'NDT Auditor',
    canAccess: ['ndt-auditor', 'auditor-dashboard']
  },
  inspector: {
    landingPage: '/field-entry',
    displayName: 'Field Inspector',
    canAccess: ['field-entry']
  },
  super_admin: {
    landingPage: '/admin',
    displayName: 'Super Administrator',
    canAccess: ['admin', 'field-entry', 'auditor-dashboard', 'ndt-auditor', 'chief-dashboard', 'assistant-chief', 'cmt-dashboard', 'evm-dashboard']
  }
}

// Get landing page for a role
export function getLandingPage(role) {
  return ROLE_CONFIG[role]?.landingPage || '/field-entry'
}

// Check if a role can access a route
export function canAccessRoute(role, routePath) {
  // Remove leading slash and query params for matching
  const cleanPath = routePath.replace(/^\//, '').split('?')[0]
  
  // Admin and super_admin can access everything
  if (role === 'admin' || role === 'super_admin') {
    return true
  }
  
  const config = ROLE_CONFIG[role]
  if (!config) return false
  
  return config.canAccess.includes(cleanPath)
}

// Get display name for a role
export function getRoleDisplayName(role) {
  return ROLE_CONFIG[role]?.displayName || role
}

// ProtectedRoute component
function ProtectedRoute({ children, requiredRoles = [], allowedRoles = [] }) {
  const { user, userProfile, loading } = useAuth()
  const location = useLocation()
  
  // Show loading state while auth is being determined
  if (loading) {
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
  
  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  
  // Get user's role
  const userRole = userProfile?.user_role || userProfile?.role || 'inspector'
  
  // If specific roles are required, check against them
  if (requiredRoles.length > 0) {
    if (!requiredRoles.includes(userRole)) {
      // User doesn't have required role - redirect to their landing page
      const landingPage = getLandingPage(userRole)
      return <Navigate to={landingPage} replace />
    }
  }
  
  // If allowed roles are specified, check against them
  if (allowedRoles.length > 0) {
    if (!allowedRoles.includes(userRole) && userRole !== 'admin' && userRole !== 'super_admin') {
      const landingPage = getLandingPage(userRole)
      return <Navigate to={landingPage} replace />
    }
  }
  
  // Check if user can access the current route
  const currentPath = location.pathname
  if (!canAccessRoute(userRole, currentPath)) {
    const landingPage = getLandingPage(userRole)
    return <Navigate to={landingPage} replace />
  }
  
  // User is authorized - render the children
  return children
}

export default ProtectedRoute
