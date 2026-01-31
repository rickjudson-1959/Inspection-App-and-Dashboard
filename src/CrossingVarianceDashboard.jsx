// ============================================================================
// CrossingVarianceDashboard.jsx
// Specialized crossing/bore integrity audit view
// Date: January 22, 2026
// Purpose: Aggregate bore_path_data, conventional_bore_logs for QC/variance analysis
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useOrgQuery } from './utils/queryHelpers.js'

// Traffic Light Status Colors
const STATUS_COLORS = {
  green: { bg: '#d1fae5', border: '#10b981', text: '#065f46', label: 'PASS' },
  yellow: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'REVIEW' },
  red: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'FAIL' }
}

// Calculate traffic light status based on variances
function calculateTrafficLightStatus(bore) {
  // Exit variance (mm) - difference between design and actual exit
  const exitVarianceMm = bore.exit_variance_mm || 0

  // Grout variance (%)
  const groutVariance = Math.abs(bore.grout_variance_percent || 0)

  // Frac-out status
  const hasFracOut = bore.frac_out_reported === true
  const fracOutUnreported = bore.frac_out_occurred && !bore.frac_out_reported

  // RED conditions
  if (exitVarianceMm > 600) return 'red'
  if (groutVariance > 25) return 'red'
  if (fracOutUnreported) return 'red'

  // YELLOW conditions
  if (exitVarianceMm > 300) return 'yellow'
  if (groutVariance > 15) return 'yellow'
  if (hasFracOut) return 'yellow'

  // GREEN - all within tolerance
  return 'green'
}

// Calculate pitch consistency status
function getPitchStatus(bore) {
  const startPitch = parseFloat(bore.start_pitch_percent) || 0
  const exitPitch = parseFloat(bore.exit_pitch_percent) || 0
  const delta = Math.abs(startPitch - exitPitch)

  if (delta > 2) return { status: 'warning', delta }
  return { status: 'ok', delta }
}

export default function CrossingVarianceDashboard({ dateRange = '30', onClose }) {
  const { addOrgFilter, organizationId, isReady } = useOrgQuery()
  const [loading, setLoading] = useState(true)
  const [boreLogs, setBoreLogs] = useState([])
  const [borePathLogs, setBorePathLogs] = useState([])
  const [selectedBore, setSelectedBore] = useState(null)
  const [borePhotos, setBorePhotos] = useState([])
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState(null)

  // Filter states
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMethod, setFilterMethod] = useState('all')

  useEffect(() => {
    if (isReady()) {
      loadBoreData()
    }
  }, [dateRange, organizationId])

  async function loadBoreData() {
    setLoading(true)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Load conventional bore logs (with org filter)
    let conventionalQuery = supabase
      .from('conventional_bore_logs')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })
    conventionalQuery = addOrgFilter(conventionalQuery)
    const { data: conventionalBores, error: boreError } = await conventionalQuery

    // Load bore path logs (HDD steering data) with org filter
    let pathQuery = supabase
      .from('bore_path_logs')
      .select('*, bore_path_stations(*)')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })
    pathQuery = addOrgFilter(pathQuery)
    const { data: borePaths, error: pathError } = await pathQuery

    if (!boreError) setBoreLogs(conventionalBores || [])
    if (!pathError) setBorePathLogs(borePaths || [])

    setLoading(false)
  }

  // Load photos for selected bore (with org filter)
  async function loadBorePhotos(boreId) {
    let photoQuery = supabase
      .from('conventional_bore_photos')
      .select('*')
      .eq('bore_log_id', boreId)
      .order('created_at', { ascending: false })
    photoQuery = addOrgFilter(photoQuery)
    const { data: photos } = await photoQuery

    setBorePhotos(photos || [])
  }

  // When a bore is selected, load its photos
  useEffect(() => {
    if (selectedBore) {
      loadBorePhotos(selectedBore.id)
    }
  }, [selectedBore])

  // Combine bore data for unified view
  const combinedBores = [
    ...boreLogs.map(b => ({
      ...b,
      source: 'conventional',
      exit_variance_mm: calculateExitVariance(b.design_exit_kp, b.actual_exit_kp),
      status: calculateTrafficLightStatus({
        ...b,
        exit_variance_mm: calculateExitVariance(b.design_exit_kp, b.actual_exit_kp)
      })
    })),
    ...borePathLogs.map(b => ({
      ...b,
      source: 'hdd',
      bore_method: 'directional_drill',
      exit_variance_mm: calculateHDDExitVariance(b),
      status: calculateTrafficLightStatus({
        exit_variance_mm: calculateHDDExitVariance(b),
        grout_variance_percent: 0, // HDD typically doesn't have grout
        frac_out_reported: b.frac_out_reported,
        frac_out_occurred: b.frac_out_occurred
      })
    }))
  ]

  // Apply filters
  const filteredBores = combinedBores.filter(bore => {
    if (filterStatus !== 'all' && bore.status !== filterStatus) return false
    if (filterMethod !== 'all' && bore.bore_method !== filterMethod) return false
    return true
  })

  // Summary statistics
  const statusCounts = {
    green: combinedBores.filter(b => b.status === 'green').length,
    yellow: combinedBores.filter(b => b.status === 'yellow').length,
    red: combinedBores.filter(b => b.status === 'red').length
  }

  // Grout analysis (only conventional bores)
  const groutData = boreLogs.filter(b => b.calculated_annulus_volume && b.actual_grout_pumped_m3)
  const totalTheoreticalGrout = groutData.reduce((sum, b) => sum + (parseFloat(b.calculated_annulus_volume) || 0), 0)
  const totalActualGrout = groutData.reduce((sum, b) => sum + (parseFloat(b.actual_grout_pumped_m3) || 0), 0)

  // Pitch consistency analysis
  const pitchIssues = boreLogs.filter(b => {
    const { status } = getPitchStatus(b)
    return status === 'warning'
  })

  // Total meters calculation
  const totalMeters = combinedBores.reduce((sum, b) => sum + (parseFloat(b.bore_length) || 0), 0)

  // Helper function to calculate exit variance from KP strings
  function calculateExitVariance(designKP, actualKP) {
    if (!designKP || !actualKP) return 0
    const design = parseFloat(designKP.replace(/[^0-9.]/g, '')) || 0
    const actual = parseFloat(actualKP.replace(/[^0-9.]/g, '')) || 0
    return Math.abs((actual - design) * 1000) // Convert km to mm
  }

  function calculateHDDExitVariance(bore) {
    // Use horizontal/vertical offset if available
    const hOffset = parseFloat(bore.horizontal_offset_m) || 0
    const vOffset = parseFloat(bore.vertical_offset_m) || 0
    return Math.sqrt(hOffset * hOffset + vOffset * vOffset) * 1000 // Convert m to mm
  }

  // Generate PDF report
  async function generateAsBuiltPDF() {
    if (!selectedBore) {
      alert('Please select a bore to generate the As-Built Package')
      return
    }

    // For now, we'll create a simple print view
    // In production, this would use jsPDF or similar
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>As-Built Package - ${selectedBore.bore_id || 'Bore'}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1e3a5f; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1e3a5f; color: white; }
            .status-green { background-color: #d1fae5; color: #065f46; }
            .status-yellow { background-color: #fef3c7; color: #92400e; }
            .status-red { background-color: #fee2e2; color: #991b1b; }
            .section { margin: 30px 0; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <h1>As-Built Package</h1>
          <h2>Bore ID: ${selectedBore.bore_id || 'N/A'}</h2>

          <div class="section">
            <h3>Bore Summary</h3>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Date</td><td>${selectedBore.date}</td></tr>
              <tr><td>Method</td><td>${selectedBore.bore_method || 'N/A'}</td></tr>
              <tr><td>Length</td><td>${selectedBore.bore_length || 'N/A'} m</td></tr>
              <tr><td>Design Entry KP</td><td>${selectedBore.design_entry_kp || 'N/A'}</td></tr>
              <tr><td>Design Exit KP</td><td>${selectedBore.design_exit_kp || 'N/A'}</td></tr>
              <tr><td>Actual Exit KP</td><td>${selectedBore.actual_exit_kp || 'N/A'}</td></tr>
              <tr><td>Exit Variance</td><td>${selectedBore.exit_variance_mm?.toFixed(0) || 0} mm</td></tr>
              <tr><td>Status</td><td class="status-${selectedBore.status}">${STATUS_COLORS[selectedBore.status]?.label}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Grout Report</h3>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Calculated Annulus Volume</td><td>${selectedBore.calculated_annulus_volume || 'N/A'} m³</td></tr>
              <tr><td>Actual Grout Pumped</td><td>${selectedBore.actual_grout_pumped_m3 || 'N/A'} m³</td></tr>
              <tr><td>Variance</td><td>${selectedBore.grout_variance_percent || 0}%</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Steering Log</h3>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Start Pitch</td><td>${selectedBore.start_pitch_percent || 'N/A'}%</td></tr>
              <tr><td>Exit Pitch</td><td>${selectedBore.exit_pitch_percent || 'N/A'}%</td></tr>
              <tr><td>Steering Head Used</td><td>${selectedBore.steering_head_used ? 'Yes' : 'No'}</td></tr>
              <tr><td>Steering Head Type</td><td>${selectedBore.steering_head_type || 'N/A'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Fluid/Mud Manifest</h3>
            <table>
              <tr><th>Field</th><th>Value</th></tr>
              <tr><td>Mud Type</td><td>${selectedBore.mud_type || 'N/A'}</td></tr>
              <tr><td>Total Water Used</td><td>${selectedBore.total_water_used_m3 || 'N/A'} m³</td></tr>
              <tr><td>Mud Volume</td><td>${selectedBore.mud_volume_m3 || 'N/A'} m³</td></tr>
            </table>
          </div>

          <p style="margin-top: 40px; color: #666; font-size: 12px;">
            Generated: ${new Date().toLocaleString()}<br/>
            Report generated by Inspection App Crossing Variance Dashboard
          </p>

          <button class="no-print" onclick="window.print()" style="padding: 10px 20px; margin-top: 20px;">Print Report</button>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>Loading crossing data...</div>
        <div style={{ color: '#6b7280' }}>Aggregating bore_path_data and conventional_bore_logs</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            Crossing Variance Dashboard
            <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#6b7280' }}>
              ({combinedBores.length} crossings)
            </span>
          </h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '13px' }}>
            Aggregated integrity audit from bore_path_data and conventional_bore_logs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={generateAsBuiltPDF}
            disabled={!selectedBore}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: selectedBore ? 'pointer' : 'not-allowed',
              backgroundColor: selectedBore ? '#059669' : '#d1d5db',
              color: 'white',
              fontWeight: '500'
            }}
          >
            Export As-Built PDF
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: 'white' }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Traffic Light Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {/* Status Cards */}
        {['green', 'yellow', 'red'].map(status => (
          <div
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
            style={{
              backgroundColor: STATUS_COLORS[status].bg,
              borderRadius: '8px',
              padding: '16px',
              border: `2px solid ${filterStatus === status ? STATUS_COLORS[status].border : 'transparent'}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '12px', color: STATUS_COLORS[status].text, fontWeight: '600', textTransform: 'uppercase' }}>
              {STATUS_COLORS[status].label}
            </div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: STATUS_COLORS[status].text }}>
              {statusCounts[status]}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              {status === 'green' ? 'Exit ≤300mm, Grout <15%' :
               status === 'yellow' ? '300-600mm or 15-25%' :
               '>600mm or >25% or frac-out'}
            </div>
          </div>
        ))}

        {/* Grout Analysis Card */}
        <div style={{ backgroundColor: '#ede9fe', borderRadius: '8px', padding: '16px', border: '2px solid #8b5cf6' }}>
          <div style={{ fontSize: '12px', color: '#5b21b6', fontWeight: '600' }}>GROUT ANALYSIS</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#5b21b6', marginTop: '4px' }}>
            {totalTheoreticalGrout.toFixed(2)} m³
          </div>
          <div style={{ fontSize: '11px', color: '#7c3aed' }}>
            Theoretical: {totalTheoreticalGrout.toFixed(2)} m³
          </div>
          <div style={{ fontSize: '11px', color: '#7c3aed' }}>
            Actual: {totalActualGrout.toFixed(2)} m³
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: Math.abs(totalActualGrout - totalTheoreticalGrout) / totalTheoreticalGrout > 0.15 ? '#dc2626' : '#059669'
          }}>
            Variance: {totalTheoreticalGrout > 0 ? (((totalActualGrout - totalTheoreticalGrout) / totalTheoreticalGrout) * 100).toFixed(1) : 0}%
          </div>
        </div>

        {/* Pitch Issues Card */}
        <div style={{ backgroundColor: pitchIssues.length > 0 ? '#fef3c7' : '#f0fdf4', borderRadius: '8px', padding: '16px', border: `2px solid ${pitchIssues.length > 0 ? '#f59e0b' : '#10b981'}` }}>
          <div style={{ fontSize: '12px', color: pitchIssues.length > 0 ? '#92400e' : '#065f46', fontWeight: '600' }}>PITCH CONSISTENCY</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: pitchIssues.length > 0 ? '#92400e' : '#065f46' }}>
            {pitchIssues.length}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Bores with &gt;2% pitch delta
          </div>
        </div>

        {/* Total Meters Card */}
        <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '16px', border: '2px solid #0ea5e9' }}>
          <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: '600' }}>TOTAL BORED</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1', marginTop: '4px' }}>
            {totalMeters.toFixed(1)}m
          </div>
          <div style={{ fontSize: '11px', color: '#0284c7' }}>
            {combinedBores.length} crossings
          </div>
          <div style={{ fontSize: '11px', color: '#0284c7' }}>
            Avg: {combinedBores.length > 0 ? (totalMeters / combinedBores.length).toFixed(1) : 0}m/crossing
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '12px', color: '#6b7280', marginRight: '8px' }}>Method:</label>
          <select
            value={filterMethod}
            onChange={e => setFilterMethod(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #d1d5db' }}
          >
            <option value="all">All Methods</option>
            <option value="track_bore">Track Bore</option>
            <option value="sling_cradle">Sling/Cradle</option>
            <option value="auger_machine">Auger Machine</option>
            <option value="directional_drill">HDD</option>
          </select>
        </div>

        <button
          onClick={() => { setFilterStatus('all'); setFilterMethod('all'); }}
          style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: 'white', fontSize: '12px' }}
        >
          Clear Filters
        </button>

        <div style={{ flex: 1 }}></div>

        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          Showing: <strong>{filteredBores.length}</strong> of {combinedBores.length} crossings
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedBore ? '1fr 400px' : '1fr', gap: '20px' }}>
        {/* Traffic Light Variance Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e3a5f' }}>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}>Status</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Bore ID</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Date</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Method</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Length</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Exit Variance</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Grout Var%</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Pitch Delta</th>
                <th style={{ color: 'white', padding: '12px', textAlign: 'center' }}>Frac-Out</th>
              </tr>
            </thead>
            <tbody>
              {filteredBores.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    No crossings found matching filters
                  </td>
                </tr>
              ) : (
                filteredBores.map(bore => {
                  const pitchInfo = getPitchStatus(bore)
                  const isSelected = selectedBore?.id === bore.id
                  const statusColor = STATUS_COLORS[bore.status]

                  return (
                    <tr
                      key={bore.id}
                      onClick={() => setSelectedBore(bore)}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: isSelected ? '#e0f2fe' : 'white',
                        cursor: 'pointer'
                      }}
                    >
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: statusColor.bg,
                          border: `2px solid ${statusColor.border}`
                        }}></span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: '600' }}>{bore.bore_id || bore.id?.slice(0,8) || 'N/A'}</td>
                      <td style={{ padding: '12px' }}>{bore.date}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          backgroundColor: bore.bore_method === 'directional_drill' ? '#dbeafe' :
                                          bore.bore_method === 'track_bore' ? '#fef3c7' :
                                          bore.bore_method === 'sling_cradle' ? '#e0e7ff' : '#f3f4f6',
                          color: bore.bore_method === 'directional_drill' ? '#1e40af' :
                                bore.bore_method === 'track_bore' ? '#92400e' :
                                bore.bore_method === 'sling_cradle' ? '#4338ca' : '#374151'
                        }}>
                          {bore.bore_method?.replace('_', ' ') || 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace' }}>
                        {bore.bore_length ? `${bore.bore_length}m` : '-'}
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        color: bore.exit_variance_mm > 600 ? '#dc2626' : bore.exit_variance_mm > 300 ? '#f59e0b' : '#059669',
                        fontWeight: bore.exit_variance_mm > 300 ? 'bold' : 'normal'
                      }}>
                        {bore.exit_variance_mm?.toFixed(0) || '0'} mm
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        color: Math.abs(bore.grout_variance_percent || 0) > 25 ? '#dc2626' :
                               Math.abs(bore.grout_variance_percent || 0) > 15 ? '#f59e0b' : '#059669'
                      }}>
                        {bore.grout_variance_percent ? `${bore.grout_variance_percent.toFixed(1)}%` : '-'}
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        backgroundColor: pitchInfo.status === 'warning' ? '#fef3c7' : 'transparent'
                      }}>
                        {pitchInfo.delta > 0 ? (
                          <span style={{ color: pitchInfo.status === 'warning' ? '#92400e' : '#6b7280' }}>
                            {pitchInfo.delta.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {bore.frac_out_occurred ? (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            backgroundColor: bore.frac_out_reported ? '#fef3c7' : '#fee2e2',
                            color: bore.frac_out_reported ? '#92400e' : '#991b1b',
                            fontWeight: '600'
                          }}>
                            {bore.frac_out_reported ? 'Reported' : 'UNREPORTED'}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>No</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Side Panel - Bore Details */}
        {selectedBore && (
          <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              backgroundColor: STATUS_COLORS[selectedBore.status].bg,
              padding: '16px',
              borderBottom: `2px solid ${STATUS_COLORS[selectedBore.status].border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, color: STATUS_COLORS[selectedBore.status].text }}>
                    {selectedBore.bore_id || 'Bore Details'}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    {selectedBore.crossing_description || selectedBore.crossing_type || 'No description'}
                  </div>
                </div>
                <span style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  backgroundColor: STATUS_COLORS[selectedBore.status].border,
                  color: 'white'
                }}>
                  {STATUS_COLORS[selectedBore.status].label}
                </span>
              </div>
            </div>

            {/* Bore Profile Visualization */}
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#374151' }}>Bore Profile</h4>
              <div style={{
                height: '120px',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Simple bore profile visualization */}
                <svg width="100%" height="100%" viewBox="0 0 350 100" preserveAspectRatio="xMidYMid meet">
                  {/* Ground level */}
                  <line x1="20" y1="30" x2="330" y2="30" stroke="#92400e" strokeWidth="2" />
                  <text x="25" y="25" fontSize="10" fill="#6b7280">Ground</text>

                  {/* Entry pit */}
                  <rect x="40" y="30" width="30" height="40" fill="#e0e7ff" stroke="#4338ca" strokeWidth="1" />
                  <text x="45" y="85" fontSize="9" fill="#4338ca">Entry</text>

                  {/* Exit pit */}
                  <rect x="280" y="30" width="30" height="40" fill="#e0e7ff" stroke="#4338ca" strokeWidth="1" />
                  <text x="285" y="85" fontSize="9" fill="#4338ca">Exit</text>

                  {/* Bore path */}
                  <path
                    d={`M 55 70 Q 175 ${90 - (parseFloat(selectedBore.start_pitch_percent) || 0) * 2} 295 70`}
                    stroke="#1e3a5f"
                    strokeWidth="3"
                    fill="none"
                  />

                  {/* Depth indicator */}
                  <text x="170" y="55" fontSize="10" fill="#1e3a5f" textAnchor="middle">
                    {selectedBore.bore_length || '?'}m
                  </text>
                </svg>
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#374151' }}>Key Metrics</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ backgroundColor: '#f9fafb', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Exit Variance</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: selectedBore.exit_variance_mm > 600 ? '#dc2626' :
                           selectedBore.exit_variance_mm > 300 ? '#f59e0b' : '#059669'
                  }}>
                    {selectedBore.exit_variance_mm?.toFixed(0) || 0} mm
                  </div>
                </div>
                <div style={{ backgroundColor: '#f9fafb', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Grout Variance</div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: Math.abs(selectedBore.grout_variance_percent || 0) > 25 ? '#dc2626' :
                           Math.abs(selectedBore.grout_variance_percent || 0) > 15 ? '#f59e0b' : '#059669'
                  }}>
                    {selectedBore.grout_variance_percent?.toFixed(1) || 0}%
                  </div>
                </div>
                <div style={{ backgroundColor: '#f9fafb', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Start Pitch</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#374151' }}>
                    {selectedBore.start_pitch_percent || 0}%
                  </div>
                </div>
                <div style={{ backgroundColor: '#f9fafb', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Exit Pitch</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#374151' }}>
                    {selectedBore.exit_pitch_percent || 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Grout Bar Chart */}
            {selectedBore.calculated_annulus_volume && (
              <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#374151' }}>Grout Comparison</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '80px' }}>
                  {/* Theoretical bar */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '100%',
                      backgroundColor: '#8b5cf6',
                      borderRadius: '4px 4px 0 0',
                      height: `${Math.min(100, (parseFloat(selectedBore.calculated_annulus_volume) / Math.max(parseFloat(selectedBore.calculated_annulus_volume), parseFloat(selectedBore.actual_grout_pumped_m3) || 1)) * 60)}px`
                    }}></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Theoretical</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{selectedBore.calculated_annulus_volume} m³</div>
                  </div>
                  {/* Actual bar */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '100%',
                      backgroundColor: '#10b981',
                      borderRadius: '4px 4px 0 0',
                      height: `${Math.min(100, (parseFloat(selectedBore.actual_grout_pumped_m3 || 0) / Math.max(parseFloat(selectedBore.calculated_annulus_volume), parseFloat(selectedBore.actual_grout_pumped_m3) || 1)) * 60)}px`
                    }}></div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Actual</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{selectedBore.actual_grout_pumped_m3 || 0} m³</div>
                  </div>
                </div>
              </div>
            )}

            {/* Exit Pit Photos */}
            <div style={{ padding: '16px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#374151' }}>
                Exit Pit Photos ({borePhotos.filter(p => p.photo_type === 'exit_pit').length})
              </h4>
              {borePhotos.filter(p => p.photo_type === 'exit_pit').length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {borePhotos.filter(p => p.photo_type === 'exit_pit').slice(0, 4).map(photo => (
                    <div
                      key={photo.id}
                      onClick={async () => {
                        const { data } = supabase.storage.from('conventional-bore-photos').getPublicUrl(photo.storage_path)
                        setSelectedPhotoUrl(data.publicUrl)
                      }}
                      style={{
                        height: '80px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>View</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  color: '#9ca3af',
                  fontSize: '12px'
                }}>
                  No exit pit photos available
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhotoUrl && (
        <div
          onClick={() => setSelectedPhotoUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'pointer'
          }}
        >
          <img
            src={selectedPhotoUrl}
            alt="Exit pit photo"
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px' }}
          />
        </div>
      )}
    </div>
  )
}
