import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { supabase } from '../supabase'

const OrgContext = createContext({})

export function OrgProvider({ children }) {
  const { orgSlug } = useParams()
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [currentOrganization, setCurrentOrganization] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isSuperAdmin = userProfile?.role === 'super_admin'

  // Fetch user's memberships
  useEffect(() => {
    async function loadMemberships() {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        if (isSuperAdmin) {
          // Super admin sees all organizations
          const { data, error: orgError } = await supabase
            .from('organizations')
            .select('id, name, slug')
            .order('name')

          if (orgError) {
            console.error('Error fetching organizations for super admin:', orgError)
            setError('Failed to load organizations')
            setLoading(false)
            return
          }

          setMemberships(data?.map(org => ({
            organization_id: org.id,
            organization: org,
            role: 'super_admin',
            is_default: false
          })) || [])
        } else {
          // Regular users see their memberships
          const { data, error: membershipError } = await supabase
            .from('memberships')
            .select(`
              id,
              organization_id,
              role,
              is_default,
              organization:organizations(id, name, slug)
            `)
            .eq('user_id', user.id)

          if (membershipError) {
            console.error('Error fetching memberships:', membershipError)
            setError('Failed to load memberships')
            setLoading(false)
            return
          }

          setMemberships(data || [])
        }
      } catch (err) {
        console.error('Membership fetch error:', err)
        setError('Failed to load organization data')
      }
    }

    loadMemberships()
  }, [user, isSuperAdmin])

  // Validate and load current organization from slug
  useEffect(() => {
    async function loadOrganization() {
      if (!orgSlug) {
        setLoading(false)
        return
      }

      // Wait for memberships to load first (unless no user)
      if (!user) {
        setLoading(false)
        return
      }

      if (memberships.length === 0 && !isSuperAdmin) {
        // Still loading memberships, wait
        return
      }

      try {
        // Find org by slug
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, name, slug')
          .eq('slug', orgSlug)
          .single()

        if (orgError || !org) {
          console.error('Organization not found:', orgSlug)
          setError('Organization not found')
          setLoading(false)

          // Redirect to default org if available
          const defaultMembership = memberships.find(m => m.is_default) || memberships[0]
          if (defaultMembership?.organization?.slug) {
            const pathWithoutOrg = location.pathname.replace(`/${orgSlug}`, '') || '/dashboard'
            navigate(`/${defaultMembership.organization.slug}${pathWithoutOrg}`, { replace: true })
          }
          return
        }

        // Check if user has access (super_admin or membership)
        const hasMembership = memberships.some(m => m.organization_id === org.id)

        if (!isSuperAdmin && !hasMembership) {
          console.warn('Access denied to organization:', orgSlug)
          setError('Access denied to this organization')

          // Redirect to default org
          const defaultMembership = memberships.find(m => m.is_default) || memberships[0]
          if (defaultMembership?.organization?.slug) {
            const pathWithoutOrg = location.pathname.replace(`/${orgSlug}`, '') || '/dashboard'
            navigate(`/${defaultMembership.organization.slug}${pathWithoutOrg}`, { replace: true })
          }
          setLoading(false)
          return
        }

        setCurrentOrganization(org)
        setError(null)
        setLoading(false)
      } catch (err) {
        console.error('Error loading organization:', err)
        setError('Failed to load organization')
        setLoading(false)
      }
    }

    loadOrganization()
  }, [orgSlug, memberships, isSuperAdmin, navigate, location.pathname, user])

  // Switch organization
  const switchOrganization = useCallback((newOrgSlug) => {
    if (newOrgSlug === currentOrganization?.slug) {
      return // Already on this org
    }

    // Get current path without org slug
    const currentPath = location.pathname
    const pathWithoutOrg = currentPath.replace(`/${orgSlug}`, '') || '/dashboard'

    navigate(`/${newOrgSlug}${pathWithoutOrg}`)
  }, [orgSlug, currentOrganization, location.pathname, navigate])

  // Get default organization slug for redirects
  const getDefaultOrgSlug = useCallback(() => {
    // First try to find the default membership
    const defaultMembership = memberships.find(m => m.is_default)
    if (defaultMembership?.organization?.slug) {
      return defaultMembership.organization.slug
    }

    // Fallback to first membership
    if (memberships.length > 0 && memberships[0]?.organization?.slug) {
      return memberships[0].organization.slug
    }

    // Last resort: 'default' organization
    return 'default'
  }, [memberships])

  // Get current membership (user's role in current org)
  const getCurrentMembership = useCallback(() => {
    if (!currentOrganization) return null
    return memberships.find(m => m.organization_id === currentOrganization.id)
  }, [currentOrganization, memberships])

  const value = {
    // Current organization
    currentOrganization,
    organizationId: currentOrganization?.id,
    organizationSlug: currentOrganization?.slug,
    organizationName: currentOrganization?.name,

    // User's memberships
    memberships,
    currentMembership: getCurrentMembership(),

    // Permissions
    isSuperAdmin,

    // Actions
    switchOrganization,
    getDefaultOrgSlug,

    // State
    loading,
    error
  }

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const context = useContext(OrgContext)
  if (!context) {
    console.warn('useOrg must be used within an OrgProvider')
  }
  return context
}

// Export for use in components that need org-aware routing
export function useOrgPath() {
  const { organizationSlug } = useOrg()

  // Helper to prefix paths with org slug
  const orgPath = useCallback((path) => {
    if (!organizationSlug) return path
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `/${organizationSlug}${normalizedPath}`
  }, [organizationSlug])

  return { orgPath, organizationSlug }
}
