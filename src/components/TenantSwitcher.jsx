import React from 'react'
import { useOrg } from '../contexts/OrgContext.jsx'

export default function TenantSwitcher({ compact = false }) {
  const {
    currentOrganization,
    memberships,
    isSuperAdmin,
    switchOrganization
  } = useOrg()

  // Only show for super_admin (God Mode)
  // Regular users (including admins) stay in their assigned organization
  if (!isSuperAdmin) {
    return null
  }

  const handleChange = (e) => {
    const newSlug = e.target.value
    if (newSlug !== currentOrganization?.slug) {
      switchOrganization(newSlug)
    }
  }

  if (compact) {
    return (
      <select
        value={currentOrganization?.slug || ''}
        onChange={handleChange}
        style={{
          padding: '6px 10px',
          borderRadius: '4px',
          border: '1px solid #ced4da',
          backgroundColor: isSuperAdmin ? '#fff3cd' : 'white',
          fontSize: '13px',
          cursor: 'pointer'
        }}
        aria-label="Select organization"
      >
        {memberships.map(m => (
          <option key={m.organization_id} value={m.organization?.slug}>
            {m.organization?.name}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      backgroundColor: isSuperAdmin ? '#fff3cd' : '#e7f3ff',
      borderRadius: '6px',
      marginBottom: '10px'
    }}>
      <span style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>
        {isSuperAdmin ? 'Tenant:' : 'Organization:'}
      </span>
      <select
        value={currentOrganization?.slug || ''}
        onChange={handleChange}
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          border: '1px solid #ced4da',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          minWidth: '180px',
          flex: 1
        }}
        aria-label="Select organization"
      >
        {memberships.map(m => (
          <option key={m.organization_id} value={m.organization?.slug}>
            {m.organization?.name}
          </option>
        ))}
      </select>
      {isSuperAdmin && (
        <span style={{
          fontSize: '10px',
          color: '#856404',
          backgroundColor: '#ffeeba',
          padding: '2px 6px',
          borderRadius: '3px',
          fontWeight: '600'
        }}>
          SUPER ADMIN
        </span>
      )}
    </div>
  )
}
