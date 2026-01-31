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
      console.log('[OrgContext] loadMemberships - user:', user?.id, 'isSuperAdmin:', isSuperAdmin)
      if (!user) {
        console.log('[OrgContext] No user, setting loading=false')
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

          console.log('[OrgContext] Super admin orgs fetched:', data?.length)
          const mappedMemberships = data?.map(org => ({
            organization_id: org.id,
            organization: org,
            role: 'super_admin',
            is_default: false
          })) || []
          setMemberships(mappedMemberships)
          // If no orgSlug in URL, we can set loading=false now
          if (!orgSlug) {
            setLoading(false)
          }
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

          console.log('[OrgContext] Regular user memberships fetched:', data?.length)
          setMemberships(data || [])
        }
      } catch (err) {
        console.error('[OrgContext] Membership fetch error:', err)
        setError('Failed to load organization data')
        setLoading(false)
      }
    }

    loadMemberships()
  }, [user, isSuperAdmin])

  // Validate and load current organization from slug
  useEffect(() => {
    async function loadOrganization() {
      console.log('[OrgContext] loadOrganization - orgSlug:', orgSlug, 'memberships:', memberships.length, 'user:', user?.id)
      if (!orgSlug) {
        console.log('[OrgContext] No orgSlug, setting loading=false')
        setLoading(false)
        return
      }

      // Wait for memberships to load first (unless no user)
      if (!user) {
        console.log('[OrgContext] No user in loadOrganization, setting loading=false')
        setLoading(false)
        return
      }

      // If no memberships after loading, allow access to 'default' org for backward compatibility
      // This handles legacy users who haven't been assigned to an org yet
      console.log('[OrgContext] Proceeding to load org from DB')

      try {
        // Find org by slug
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, name, slug')
          .eq('slug', orgSlug)
          .single()

        console.log('[OrgContext] Org query result - org:', org?.slug, 'error:', orgError)
        if (orgError || !org) {
          console.error('[OrgContext] Organization not found:', orgSlug)
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

        // Check if user has access (super_admin, membership, or legacy user accessing default)
        const hasMembership = memberships.some(m => m.organization_id === org.id)
        const isLegacyAccessToDefault = memberships.length === 0 && org.slug === 'default'

        if (!isSuperAdmin && !hasMembership && !isLegacyAccessToDefault) {
          console.warn('Access denied to organization:', orgSlug)
          setError('Access denied to this organization')

          // Redirect to default org
          const defaultMembership = memberships.find(m => m.is_default) || memberships[0]
          if (defaultMembership?.organization?.slug) {
            const pathWithoutOrg = location.pathname.replace(`/${orgSlug}`, '') || '/dashboard'
            navigate(`/${defaultMembership.organization.slug}${pathWithoutOrg}`, { replace: true })
          } else {
            // No memberships at all - redirect to default org
            const pathWithoutOrg = location.pathname.replace(`/${orgSlug}`, '') || '/dashboard'
            navigate(`/default${pathWithoutOrg}`, { replace: true })
          }
          setLoading(false)
          return
        }

        console.log('[OrgContext] Access granted, setting currentOrganization:', org.slug)
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
