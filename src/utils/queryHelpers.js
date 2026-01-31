import { useOrg } from '../contexts/OrgContext.jsx'

/**
 * Add organization filter to Supabase query
 * Super admins bypass filtering unless forceFilter is true
 *
 * @param {Object} query - Supabase query builder
 * @param {string} organizationId - Organization UUID to filter by
 * @param {boolean} isSuperAdmin - Whether current user is super admin
 * @param {boolean} forceFilter - Force filtering even for super admins
 * @returns {Object} - Modified query with organization filter
 */
export function withOrgFilter(query, organizationId, isSuperAdmin, forceFilter = false) {
  // Super admins bypass filtering unless forced
  if (isSuperAdmin && !forceFilter) {
    return query
  }

  if (!organizationId) {
    console.warn('withOrgFilter: No organizationId provided')
    return query
  }

  return query.eq('organization_id', organizationId)
}

/**
 * Hook for org-scoped queries
 * Provides helpers for filtering queries and inserting records with organization_id
 *
 * @returns {Object} - Query helper functions and org context
 */
export function useOrgQuery() {
  const { organizationId, isSuperAdmin } = useOrg()

  return {
    // Current organization ID
    organizationId,

    // Whether user is super admin
    isSuperAdmin,

    /**
     * Add organization filter to a Supabase query
     * @param {Object} query - Supabase query builder
     * @param {boolean} forceFilter - Force filtering even for super admins
     * @returns {Object} - Modified query
     */
    addOrgFilter: (query, forceFilter = false) =>
      withOrgFilter(query, organizationId, isSuperAdmin, forceFilter),

    /**
     * Get the organization_id for insert operations
     * @returns {string|null} - Organization UUID
     */
    getOrgId: () => organizationId,

    /**
     * Check if org context is ready for queries
     * @returns {boolean}
     */
    isReady: () => !!organizationId || isSuperAdmin
  }
}

/**
 * Wrapper for creating org-scoped records
 * Adds organization_id to the record
 *
 * @param {Object} record - Record to insert
 * @param {string} organizationId - Organization UUID
 * @returns {Object} - Record with organization_id
 */
export function withOrgId(record, organizationId) {
  if (!organizationId) {
    console.warn('withOrgId: No organizationId provided')
    return record
  }

  return {
    ...record,
    organization_id: organizationId
  }
}

/**
 * Batch add organization_id to multiple records
 *
 * @param {Array} records - Array of records to insert
 * @param {string} organizationId - Organization UUID
 * @returns {Array} - Records with organization_id
 */
export function withOrgIdBatch(records, organizationId) {
  if (!organizationId) {
    console.warn('withOrgIdBatch: No organizationId provided')
    return records
  }

  return records.map(record => ({
    ...record,
    organization_id: organizationId
  }))
}
