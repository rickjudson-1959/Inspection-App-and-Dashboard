import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function InspectorTimesheetForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [timesheetId] = useState(null) // Would be set from URL params for edit mode

  useEffect(() => {
    console.log('InspectorTimesheetForm loaded at:', location.pathname)
  }, [location.pathname])

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '24px' }}>
        <button 
          onClick={() => navigate('/inspector-invoicing')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}
        >
          ← Back to Inspector Invoicing
        </button>
        <h1 style={{ margin: 0, fontSize: '28px', color: '#111827' }}>
          {timesheetId ? 'Edit Timesheet' : 'Create New Timesheet'}
        </h1>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>
          Timesheet form - Coming soon
        </p>
      </div>

      <div style={{ 
        textAlign: 'center', 
        padding: '60px', 
        backgroundColor: '#f9fafb', 
        borderRadius: '12px',
        border: '2px dashed #d1d5db'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>Timesheet Form</h3>
        <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
          The timesheet creation form is under development.
        </p>
      </div>
    </div>
  )
}
