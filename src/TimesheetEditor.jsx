import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import { useOrgPath } from './contexts/OrgContext.jsx'

export default function TimesheetEditor() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, userProfile } = useAuth()
  const { addOrgFilter, getOrgId } = useOrgQuery()
  const { orgPath } = useOrgPath()

  const timesheetId = searchParams.get('id')
  const inspectorProfileId = searchParams.get('inspector')
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timesheet, setTimesheet] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [inspectorProfile, setInspectorProfile] = useState(null)
  const [rateCard, setRateCard] = useState(null)
  const [availableInspectors, setAvailableInspectors] = useState([])
  
  // Form state for new timesheet
  const [selectedInspector, setSelectedInspector] = useState(inspectorProfileId || '')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [periodType, setPeriodType] = useState('biweekly')
  const [projectName, setProjectName] = useState('EGP Pipeline Project')
  const [clientName, setClientName] = useState('FortisBC')
  const [spreadName, setSpreadName] = useState('')
  
  // Date overlap warning
  const [dateOverlapWarning, setDateOverlapWarning] = useState(null)

  // Calculated totals
  const [totals, setTotals] = useState({
    fieldDays: 0,
    perDiemDays: 0,
    truckDays: 0,
    totalKms: 0,
    atvDays: 0,
    electronicsDays: 0,
    fobDays: 0
  })

  useEffect(() => {
    if (timesheetId) {
      loadExistingTimesheet()
    } else {
      loadAvailableInspectors()
    }
  }, [timesheetId])

  useEffect(() => {
    calculateTotals()
  }, [lineItems])

  // Check for date overlaps when dates or inspector changes
  useEffect(() => {
    async function checkDateOverlap() {
      if (!selectedInspector || !periodStart || !periodEnd) {
        setDateOverlapWarning(null)
        return
      }

      try {
        const { data: existingTimesheets, error } = await supabase
          .from('inspector_timesheets')
          .select('id, period_start, period_end, status')
          .eq('inspector_profile_id', selectedInspector)
          .in('status', ['submitted', 'admin_review', 'chief_review', 'approved', 'paid'])

        if (error) {
          console.error('Error checking date overlap:', error)
          return
        }

        if (existingTimesheets && existingTimesheets.length > 0) {
          // Skip current timesheet if editing
          const otherTimesheets = timesheetId 
            ? existingTimesheets.filter(ts => ts.id !== timesheetId)
            : existingTimesheets

          for (const ts of otherTimesheets) {
            const existingStart = new Date(ts.period_start)
            const existingEnd = new Date(ts.period_end)
            const newStart = new Date(periodStart)
            const newEnd = new Date(periodEnd)
            
            if (newStart <= existingEnd && newEnd >= existingStart) {
              setDateOverlapWarning({
                period_start: ts.period_start,
                period_end: ts.period_end,
                status: ts.status
              })
              return
            }
          }
        }
        
        setDateOverlapWarning(null)
      } catch (err) {
        console.error('Error checking date overlap:', err)
      }
    }

    checkDateOverlap()
  }, [selectedInspector, periodStart, periodEnd, timesheetId])

  async function loadAvailableInspectors() {
    setLoading(true)
    try {
      // Check if user is an inspector (not admin/chief)
      const isInspector = userProfile?.role === 'inspector'
      
      if (isInspector) {
        // Inspector can only create timesheets for themselves
        // Find their inspector_profile by matching user_id
        const { data: myProfile } = await supabase
          .from('inspector_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (myProfile) {
          setAvailableInspectors([myProfile])
          setSelectedInspector(myProfile.id)
          setInspectorProfile(myProfile)
          await loadRateCard(myProfile.id)
        } else {
          alert('No inspector profile found. Please contact admin to set up your profile.')
        }
      } else {
        // Admin/Chief can select any inspector
        const { data } = await supabase
          .from('inspector_profiles')
          .select('*')
          .eq('cleared_to_work', true)
          .order('company_name')
        
        setAvailableInspectors(data || [])
        
        // If inspector is pre-selected, load their info
        if (inspectorProfileId) {
          const inspector = (data || []).find(i => i.id === inspectorProfileId)
          if (inspector) {
            setInspectorProfile(inspector)
            await loadRateCard(inspectorProfileId)
          }
        }
      }
    } catch (err) {
      console.error('Error loading inspectors:', err)
    }
    setLoading(false)
  }

  async function loadExistingTimesheet() {
    setLoading(true)
    try {
      // Load timesheet
      const { data: ts } = await supabase
        .from('inspector_timesheets')
        .select('*')
        .eq('id', timesheetId)
        .single()
      
      if (ts) {
        setTimesheet(ts)
        setPeriodStart(ts.period_start)
        setPeriodEnd(ts.period_end)
        setPeriodType(ts.period_type)
        setProjectName(ts.project_name || '')
        setClientName(ts.client_name || '')
        setSpreadName(ts.spread_name || '')
        setSelectedInspector(ts.inspector_profile_id)
        
        // Load inspector profile
        const { data: profile } = await supabase
          .from('inspector_profiles')
          .select('*')
          .eq('id', ts.inspector_profile_id)
          .single()
        
        if (profile) setInspectorProfile(profile)
        
        // Load rate card
        await loadRateCard(ts.inspector_profile_id)
        
        // Load line items
        const { data: lines } = await supabase
          .from('inspector_timesheet_lines')
          .select('*')
          .eq('timesheet_id', timesheetId)
          .order('work_date')
        
        setLineItems(lines || [])
      }
    } catch (err) {
      console.error('Error loading timesheet:', err)
    }
    setLoading(false)
  }

  async function loadRateCard(profileId) {
    const { data } = await supabase
      .from('inspector_rate_cards')
      .select('*')
      .eq('inspector_profile_id', profileId)
      .eq('is_active', true)
      .maybeSingle()
    
    if (data) {
      setRateCard(data)
    } else {
      // Use default rates if no rate card exists
      setRateCard({
        daily_field_rate: 900,
        per_diem_rate: 180,
        meal_allowance: 70,
        truck_rate: 160,
        km_rate: 1.10,
        km_threshold: 150,
        electronics_rate: 15,
        mob_demob_km_max: 500
      })
    }
  }

  async function handleInspectorChange(profileId) {
    setSelectedInspector(profileId)
    const inspector = availableInspectors.find(i => i.id === profileId)
    if (inspector) {
      setInspectorProfile(inspector)
      await loadRateCard(profileId)
    }
  }

  async function generateFromDailyTickets() {
    if (!selectedInspector || !periodStart || !periodEnd) {
      alert('Please select an inspector and date range first')
      return
    }
    
    setLoading(true)
    
    try {
      // Get inspector's name from profile
      const inspector = availableInspectors.find(i => i.id === selectedInspector) || inspectorProfile
      if (!inspector) {
        alert('Inspector profile not found')
        setLoading(false)
        return
      }

      // ========== CHECK FOR ALREADY INVOICED DATES ==========
      // Get all dates that have already been invoiced (submitted, approved, or paid timesheets)
      const { data: existingTimesheets, error: tsError } = await supabase
        .from('inspector_timesheets')
        .select('id, period_start, period_end, status')
        .eq('inspector_profile_id', selectedInspector)
        .in('status', ['submitted', 'admin_review', 'chief_review', 'approved', 'paid'])
      
      if (tsError) {
        console.error('Error checking existing timesheets:', tsError)
      }

      // Check if requested date range overlaps with any existing timesheet
      if (existingTimesheets && existingTimesheets.length > 0) {
        // Skip the current timesheet if we're editing
        const otherTimesheets = timesheetId 
          ? existingTimesheets.filter(ts => ts.id !== timesheetId)
          : existingTimesheets

        for (const ts of otherTimesheets) {
          // Check for date overlap
          const existingStart = new Date(ts.period_start)
          const existingEnd = new Date(ts.period_end)
          const newStart = new Date(periodStart)
          const newEnd = new Date(periodEnd)
          
          // Overlap exists if: newStart <= existingEnd AND newEnd >= existingStart
          if (newStart <= existingEnd && newEnd >= existingStart) {
            alert(`Cannot use this date range.\n\nDates ${ts.period_start} to ${ts.period_end} have already been invoiced (Status: ${ts.status.toUpperCase()}).\n\nPlease select a different date range.`)
            setLoading(false)
            return
          }
        }
      }
      // ========== END DUPLICATE CHECK ==========

      // Get the user profile to find the inspector name used in daily tickets
      const { data: userProfileData } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', inspector.user_id)
        .maybeSingle()
      
      const inspectorName = userProfileData?.full_name || inspector.company_name
      
      // Fetch daily tickets for this inspector in the date range
      const { data: tickets, error } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('inspector_name', inspectorName)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('date')
      
      if (error) {
        console.error('Error fetching tickets:', error)
        alert('Error fetching daily tickets')
        setLoading(false)
        return
      }

      if (!tickets || tickets.length === 0) {
        alert(`No daily tickets found for ${inspectorName} between ${periodStart} and ${periodEnd}`)
        setLoading(false)
        return
      }

      // Group tickets by date to consolidate into one line per day
      const ticketsByDate = {}
      tickets.forEach(ticket => {
        if (!ticketsByDate[ticket.date]) {
          ticketsByDate[ticket.date] = []
        }
        ticketsByDate[ticket.date].push(ticket)
      })

      // Generate one line item per date
      const sortedDates = Object.keys(ticketsByDate).sort()
      const kmThreshold = rateCard?.km_threshold || 150
      
      const newLineItems = sortedDates.map((date, index) => {
        const dayTickets = ticketsByDate[date]
        
        // Combine all activities and equipment from all tickets on this day
        const allActivities = []
        let totalKmsForDay = 0
        let hasATV = false
        let hasRadio = false
        let hasFOB = false
        let hasTruck = true // Assume everyone has a truck for field days

        dayTickets.forEach(ticket => {
          // Get activities
          const activities = ticket.activity_blocks || []
          activities.forEach(a => {
            if (a.activityType && !allActivities.includes(a.activityType)) {
              allActivities.push(a.activityType)
            }
          })

          // Get kilometers (use inspector_mileage field from report)
          totalKmsForDay += ticket.inspector_mileage || ticket.km_driven || 0

          // Get equipment from inspector_equipment array
          const equipment = ticket.inspector_equipment || []
          if (equipment.includes('ATV') || equipment.includes('UTV')) {
            hasATV = true
          }
          if (equipment.includes('Radio')) {
            hasRadio = true
          }
          if (equipment.includes('Gas Fob') || equipment.includes('Fob') || equipment.includes('FOB')) {
            hasFOB = true
          }
        })
        
        const workDescription = allActivities.length > 0 
          ? allActivities.join(', ') 
          : 'Field Inspection'
        
        // Calculate excess KMs (over threshold)
        const excessKms = Math.max(0, totalKmsForDay - kmThreshold)
        
        return {
          daily_ticket_id: dayTickets[0].id, // Reference first ticket of the day
          work_date: date,
          work_description: workDescription,
          is_field_day: true,
          is_per_diem: true, // Default to per diem, user can adjust
          is_meals_only: false,
          is_truck_day: hasTruck,
          is_atv: hasATV,
          is_electronics: hasRadio,
          is_fob: hasFOB,
          is_mobilization: false, // User adds MOB manually
          is_demobilization: false, // User adds DEMOB manually
          total_kms: totalKmsForDay,
          excess_kms: excessKms,
          auto_populated: true,
          manually_adjusted: false,
          line_order: index + 1
        }
      })

      setLineItems(newLineItems)
      
    } catch (err) {
      console.error('Error generating timesheet:', err)
      alert('Error generating timesheet: ' + err.message)
    }
    
    setLoading(false)
  }

  function calculateTotals() {
    const newTotals = {
      fieldDays: lineItems.filter(l => l.is_field_day).length,
      perDiemDays: lineItems.filter(l => l.is_per_diem).length,
      truckDays: lineItems.filter(l => l.is_truck_day).length,
      totalKms: lineItems.reduce((sum, l) => sum + (l.total_kms || 0), 0),
      atvDays: lineItems.filter(l => l.is_atv).length,
      electronicsDays: lineItems.filter(l => l.is_electronics).length,
      fobDays: lineItems.filter(l => l.is_fob).length,
      hasMobilization: lineItems.some(l => l.is_mobilization),
      hasDemobilization: lineItems.some(l => l.is_demobilization)
    }
    setTotals(newTotals)
  }

  function updateLineItem(index, field, value) {
    const updated = [...lineItems]
    updated[index] = { 
      ...updated[index], 
      [field]: value,
      manually_adjusted: true 
    }
    
    // Recalculate excess KMs if total KMs changed
    if (field === 'total_kms') {
      const kmThreshold = rateCard?.km_threshold || 150
      const isMobDemob = updated[index].is_mobilization || updated[index].is_demobilization
      updated[index].excess_kms = isMobDemob ? 0 : Math.max(0, value - kmThreshold)
    }
    
    setLineItems(updated)
  }

  async function saveTimesheet(status = 'draft') {
    if (!selectedInspector || !periodStart || !periodEnd) {
      alert('Please fill in all required fields')
      return
    }
    
    if (lineItems.length === 0) {
      alert('Please generate or add line items first')
      return
    }
    
    setSaving(true)
    
    try {
      let tsId = timesheetId
      
      // Calculate invoice totals
      const subtotal = calculateInvoiceTotal()
      const invoiceTotal = subtotal * 1.05 // Add GST
      
      const timesheetData = {
        inspector_profile_id: selectedInspector,
        rate_card_id: rateCard?.id && typeof rateCard.id === 'string' && rateCard.id.includes('-') ? rateCard.id : null,
        period_start: periodStart,
        period_end: periodEnd,
        period_type: periodType,
        project_name: projectName,
        client_name: clientName,
        spread_name: spreadName,
        total_field_days: totals.fieldDays,
        total_per_diem_days: totals.perDiemDays,
        total_truck_days: totals.truckDays,
        total_kms: totals.totalKms,
        total_atv_days: totals.atvDays,
        total_electronics_days: totals.electronicsDays,
        total_fob_days: totals.fobDays,
        has_mobilization: totals.hasMobilization,
        has_demobilization: totals.hasDemobilization,
        invoice_subtotal: subtotal,
        invoice_total: invoiceTotal,
        status: status,
        updated_at: new Date().toISOString(),
        organization_id: getOrgId()
      }
      
      if (tsId) {
        // Update existing
        const { error } = await supabase
          .from('inspector_timesheets')
          .update(timesheetData)
          .eq('id', tsId)
        
        if (error) throw error
      } else {
        // Create new
        const { data, error } = await supabase
          .from('inspector_timesheets')
          .insert(timesheetData)
          .select()
          .single()
        
        if (error) throw error
        tsId = data.id
        setTimesheet(data)
      }
      
      // Delete existing line items and re-insert
      await supabase
        .from('inspector_timesheet_lines')
        .delete()
        .eq('timesheet_id', tsId)
      
      // Insert line items (database will auto-generate IDs)
      const lineItemsToInsert = lineItems.map(line => ({
        timesheet_id: tsId,
        work_date: line.work_date,
        work_description: line.work_description,
        is_field_day: line.is_field_day,
        is_per_diem: line.is_per_diem,
        is_meals_only: line.is_meals_only,
        is_truck_day: line.is_truck_day,
        is_electronics: line.is_electronics,
        is_mobilization: line.is_mobilization,
        is_demobilization: line.is_demobilization,
        total_kms: line.total_kms,
        excess_kms: line.excess_kms,
        auto_populated: line.auto_populated,
        manually_adjusted: line.manually_adjusted,
        line_order: line.line_order,
        notes: line.notes || null,
        organization_id: getOrgId()
      }))
      
      const { error: linesError } = await supabase
        .from('inspector_timesheet_lines')
        .insert(lineItemsToInsert)
      
      if (linesError) throw linesError
      
      if (status === 'submitted') {
        alert('Timesheet submitted for review!')
        navigate(orgPath('/inspector-invoicing'))
      } else {
        alert('Timesheet saved!')
      }
      
    } catch (err) {
      console.error('Error saving timesheet:', err)
      alert('Error saving timesheet: ' + err.message)
    }
    
    setSaving(false)
  }

  function calculateInvoiceTotal() {
    if (!rateCard) return 0
    
    let total = 0
    total += totals.fieldDays * (rateCard.daily_field_rate || 0)
    total += totals.perDiemDays * (rateCard.per_diem_rate || 0)
    total += totals.truckDays * (rateCard.truck_rate || 0)
    total += totals.electronicsDays * (rateCard.electronics_rate || 0)
    
    return total
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', { 
      style: 'currency', 
      currency: 'CAD',
      minimumFractionDigits: 2
    }).format(amount || 0)
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  // Set default date range (last 2 weeks)
  useEffect(() => {
    if (!periodStart && !periodEnd && !timesheetId) {
      const today = new Date()
      const twoWeeksAgo = new Date(today)
      twoWeeksAgo.setDate(today.getDate() - 14)
      
      setPeriodEnd(today.toISOString().split('T')[0])
      setPeriodStart(twoWeeksAgo.toISOString().split('T')[0])
    }
  }, [])

  if (loading && timesheetId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading timesheet...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px 40px' }}>
        <button 
          onClick={() => navigate(orgPath('/inspector-invoicing'))}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}
        >
          ← Back to Inspector Invoicing
        </button>
        <h1 style={{ margin: 0, fontSize: '24px' }}>
          {timesheetId ? '📋 Edit Timesheet' : '📋 Create New Timesheet'}
        </h1>
        <p style={{ margin: '8px 0 0 0', opacity: 0.8 }}>
          {inspectorProfile?.company_name || 'Select an inspector to begin'}
        </p>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        
        {/* Setup Section */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>Timesheet Setup</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                Inspector <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={selectedInspector}
                onChange={(e) => handleInspectorChange(e.target.value)}
                disabled={!!timesheetId || userProfile?.role === 'inspector'}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              >
                <option value="">Select Inspector...</option>
                {availableInspectors.map(insp => (
                  <option key={insp.id} value={insp.id}>{insp.company_name}</option>
                ))}
              </select>
              {userProfile?.role === 'inspector' && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Creating invoice for your own profile
                </p>
              )}
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                Period Start <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                Period End <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
          </div>
          
          {/* Date Overlap Warning */}
          {dateOverlapWarning && (
            <div style={{ 
              marginTop: '16px', 
              padding: '16px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>
                  Date Range Already Invoiced
                </div>
                <div style={{ color: '#b91c1c', fontSize: '14px' }}>
                  The period <strong>{dateOverlapWarning.period_start}</strong> to <strong>{dateOverlapWarning.period_end}</strong> has 
                  already been invoiced (Status: <strong>{dateOverlapWarning.status.toUpperCase()}</strong>).
                  Please select a different date range.
                </div>
              </div>
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px', marginTop: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>Period Type</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              >
                <option value="biweekly">Bi-Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>Client</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>Spread</label>
              <input
                type="text"
                value={spreadName}
                onChange={(e) => setSpreadName(e.target.value)}
                placeholder="e.g., Spread A"
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>
          </div>
          
          <div style={{ marginTop: '24px' }}>
            <button
              onClick={generateFromDailyTickets}
              disabled={!selectedInspector || !periodStart || !periodEnd || loading || dateOverlapWarning}
              style={{
                padding: '12px 24px',
                backgroundColor: dateOverlapWarning ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: (!selectedInspector || !periodStart || !periodEnd || loading || dateOverlapWarning) ? 'not-allowed' : 'pointer',
                opacity: (!selectedInspector || !periodStart || !periodEnd || loading || dateOverlapWarning) ? 0.5 : 1
              }}
            >
              {loading ? '⏳ Loading...' : '🔄 Auto-Populate from Daily Tickets'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {lineItems.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
              <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '500' }}>Field Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e40af' }}>{totals.fieldDays}</div>
              <div style={{ fontSize: '12px', color: '#3b82f6' }}>{formatCurrency(totals.fieldDays * (rateCard?.daily_field_rate || 0))}</div>
            </div>
            <div style={{ backgroundColor: '#d1fae5', padding: '16px', borderRadius: '8px', border: '1px solid #6ee7b7' }}>
              <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>Per Diem Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#065f46' }}>{totals.perDiemDays}</div>
              <div style={{ fontSize: '12px', color: '#059669' }}>{formatCurrency(totals.perDiemDays * (rateCard?.per_diem_rate || 0))}</div>
            </div>
            <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
              <div style={{ fontSize: '13px', color: '#92400e', fontWeight: '500' }}>Total KMs</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#92400e' }}>{totals.totalKms}</div>
              <div style={{ fontSize: '12px', color: '#d97706' }}>Truck Days: {totals.truckDays}</div>
            </div>
            <div style={{ backgroundColor: '#ede9fe', padding: '16px', borderRadius: '8px', border: '1px solid #c4b5fd' }}>
              <div style={{ fontSize: '13px', color: '#5b21b6', fontWeight: '500' }}>Invoice Total</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#5b21b6' }}>{formatCurrency(calculateInvoiceTotal())}</div>
              <div style={{ fontSize: '12px', color: '#7c3aed' }}>+ GST</div>
            </div>
          </div>
        )}

        {/* Line Items Table */}
        {lineItems.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>
              Timesheet Lines ({lineItems.length} days)
            </h3>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>Work Description</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Field Day</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Per Diem</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Truck</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>KMs</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>ATV</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>Radio</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600', whiteSpace: 'nowrap' }}>FOB</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => (
                    <tr 
                      key={index} 
                      style={{ 
                        backgroundColor: line.is_mobilization ? '#dbeafe' : line.is_demobilization ? '#fef3c7' : 'white',
                        borderBottom: '1px solid #e5e7eb'
                      }}
                    >
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '500' }}>{formatDate(line.work_date)}</div>
                        {line.is_mobilization && <span style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: '600' }}>📦 MOB</span>}
                        {line.is_demobilization && <span style={{ fontSize: '11px', color: '#d97706', fontWeight: '600' }}>📦 DEMOB</span>}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <input
                          type="text"
                          value={line.work_description || ''}
                          onChange={(e) => updateLineItem(index, 'work_description', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px' }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_field_day}
                          onChange={(e) => updateLineItem(index, 'is_field_day', e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_per_diem}
                          onChange={(e) => updateLineItem(index, 'is_per_diem', e.target.checked)}
                          disabled={line.is_mobilization || line.is_demobilization}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_truck_day}
                          onChange={(e) => updateLineItem(index, 'is_truck_day', e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <input
                          type="number"
                          value={line.total_kms || 0}
                          onChange={(e) => updateLineItem(index, 'total_kms', parseInt(e.target.value) || 0)}
                          style={{ width: '70px', padding: '6px', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '13px', textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_atv}
                          onChange={(e) => updateLineItem(index, 'is_atv', e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_electronics}
                          onChange={(e) => updateLineItem(index, 'is_electronics', e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={line.is_fob}
                          onChange={(e) => updateLineItem(index, 'is_fob', e.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f3f4f6', fontWeight: '600' }}>
                    <td style={{ padding: '12px 8px' }}>TOTALS</td>
                    <td style={{ padding: '12px 8px' }}></td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.fieldDays}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.perDiemDays}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.truckDays}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totals.totalKms}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.atvDays}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.electronicsDays}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>{totals.fobDays}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Rate Card Summary */}
        {rateCard && lineItems.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>Invoice Preview</h3>
            
            <table style={{ width: '100%', maxWidth: '500px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>Daily field rate ({totals.fieldDays} days × {formatCurrency(rateCard.daily_field_rate)})</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(totals.fieldDays * rateCard.daily_field_rate)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>Per diem ({totals.perDiemDays} days × {formatCurrency(rateCard.per_diem_rate)})</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(totals.perDiemDays * rateCard.per_diem_rate)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>4x4 Truck ({totals.truckDays} days × {formatCurrency(rateCard.truck_rate)})</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(totals.truckDays * rateCard.truck_rate)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>Electronics ({totals.electronicsDays} days × {formatCurrency(rateCard.electronics_rate)})</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(totals.electronicsDays * rateCard.electronics_rate)}</td>
                </tr>
                <tr style={{ borderBottom: '2px solid #111827' }}>
                  <td style={{ padding: '12px 0', fontWeight: '600', fontSize: '16px' }}>Subtotal</td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '700', fontSize: '16px' }}>{formatCurrency(calculateInvoiceTotal())}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', color: '#6b7280' }}>GST (5%)</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(calculateInvoiceTotal() * 0.05)}</td>
                </tr>
                <tr style={{ backgroundColor: '#f0fdf4' }}>
                  <td style={{ padding: '16px 8px', fontWeight: '700', fontSize: '18px', color: '#065f46' }}>INVOICE TOTAL</td>
                  <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: '700', fontSize: '18px', color: '#065f46' }}>{formatCurrency(calculateInvoiceTotal() * 1.05)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => navigate(orgPath('/inspector-invoicing'))}
            style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => saveTimesheet('draft')}
              disabled={saving || lineItems.length === 0}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: (saving || lineItems.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (saving || lineItems.length === 0) ? 0.5 : 1
              }}
            >
              {saving ? 'Saving...' : '💾 Save Draft'}
            </button>
            
            <button
              onClick={() => saveTimesheet('submitted')}
              disabled={saving || lineItems.length === 0}
              style={{
                padding: '12px 24px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                cursor: (saving || lineItems.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (saving || lineItems.length === 0) ? 0.5 : 1
              }}
            >
              {saving ? 'Submitting...' : '📤 Submit for Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
