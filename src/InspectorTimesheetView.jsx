import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'

export default function InspectorTimesheetView() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [timesheet, setTimesheet] = useState(null)

  useEffect(() => {
    if (id) {
      loadTimesheet()
    }
  }, [id])

  async function loadTimesheet() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('inspector_timesheets')
        .select(`
          *,
          inspector_profiles (
            id,
            company_name
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setTimesheet(data)
    } catch (err) {
      console.error('Error loading timesheet:', err)
    }
    setLoading(false)
  }

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
          Timesheet Details
        </h1>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>
          View and manage timesheet
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          Loading...
        </div>
      ) : timesheet ? (
        <div style={{ 
          backgroundColor: '#f9fafb', 
          borderRadius: '12px',
          padding: '24px'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <strong>Inspector:</strong> {timesheet.inspector_profiles?.company_name || 'Unknown'}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <strong>Status:</strong> {timesheet.status || 'Draft'}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <strong>Period:</strong> {timesheet.period_start ? new Date(timesheet.period_start).toLocaleDateString() : '-'} - {timesheet.period_end ? new Date(timesheet.period_end).toLocaleDateString() : '-'}
          </div>
          <p style={{ color: '#6b7280' }}>
            Timesheet detail view - Coming soon
          </p>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          backgroundColor: '#fee2e2', 
          borderRadius: '12px',
          border: '1px solid #fecaca'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Timesheet Not Found</h3>
          <p style={{ margin: '0 0 16px 0', color: '#b91c1c' }}>
            The requested timesheet could not be found.
          </p>
          <button
            onClick={() => navigate('/inspector-invoicing')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
