import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import ReconciliationUpload from './ReconciliationUpload.jsx'

const BRAND = {
  navy: '#003366',
  blue: '#0066cc',
  green: '#28a745',
  amber: '#ffc107',
  red: '#dc3545',
  gray: '#6c757d',
  lightGray: '#f8f9fa',
  white: '#ffffff',
}

export default function ReconciliationList({ onSelectTicket, onNavigateToUpload }) {
  const { organizationId, isReady } = useOrgQuery()

  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  // Filters
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [foremanFilter, setForemanFilter] = useState('')

  useEffect(() => {
    if (isReady()) {
      loadPackages()
    }
  }, [organizationId])

  async function loadPackages() {
    setLoading(true)
    try {
      // recon_package_status view uses org_id (not organization_id)
      const { data, error } = await supabase
        .from('recon_package_status')
        .select('*')
        .eq('org_id', organizationId)
        .order('date', { ascending: false, nullsFirst: false })
        .order('ticket_number', { ascending: false })

      if (error) {
        console.error('Error loading reconciliation packages:', error)
        setPackages([])
      } else {
        setPackages(data || [])
      }
    } catch (err) {
      console.error('Error loading reconciliation packages:', err)
      setPackages([])
    } finally {
      setLoading(false)
    }
  }

  // --- Filtering logic ---
  function isComplete(pkg) {
    return pkg.has_lem > 0 && pkg.has_ticket > 0 && pkg.has_photo > 0 && pkg.has_report > 0
  }

  const filteredPackages = packages.filter(pkg => {
    // Status filter
    if (statusFilter === 'complete' && !isComplete(pkg)) return false
    if (statusFilter === 'partial' && isComplete(pkg)) return false

    // Date filter
    if (dateFilter && pkg.date && !pkg.date.includes(dateFilter)) return false

    // Foreman filter
    if (foremanFilter && pkg.foreman) {
      if (!pkg.foreman.toLowerCase().includes(foremanFilter.toLowerCase())) return false
    } else if (foremanFilter && !pkg.foreman) {
      return false
    }

    return true
  })

  const completeCount = filteredPackages.filter(isComplete).length
  const partialCount = filteredPackages.length - completeCount

  // --- Styles ---
  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      color: '#333',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
    },
    title: {
      fontSize: '18px',
      fontWeight: '700',
      color: BRAND.navy,
      margin: 0,
    },
    uploadBtn: {
      padding: '8px 16px',
      backgroundColor: BRAND.blue,
      color: BRAND.white,
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
    },
    filterBar: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      marginBottom: '12px',
      flexWrap: 'wrap',
    },
    filterInput: {
      padding: '6px 10px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontSize: '13px',
      minWidth: '140px',
    },
    filterGroup: {
      display: 'flex',
      gap: '4px',
    },
    filterBtn: (active) => ({
      padding: '5px 12px',
      border: `1px solid ${active ? BRAND.navy : '#ccc'}`,
      backgroundColor: active ? BRAND.navy : BRAND.white,
      color: active ? BRAND.white : '#333',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: active ? '600' : '400',
    }),
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      border: '1px solid #dee2e6',
    },
    th: {
      backgroundColor: BRAND.navy,
      color: BRAND.white,
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: '12px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderBottom: '2px solid #001a33',
    },
    thCenter: {
      backgroundColor: BRAND.navy,
      color: BRAND.white,
      padding: '10px 8px',
      textAlign: 'center',
      fontSize: '12px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderBottom: '2px solid #001a33',
    },
    td: {
      padding: '10px 12px',
      borderBottom: '1px solid #e9ecef',
      fontSize: '13px',
    },
    tdCenter: {
      padding: '10px 8px',
      borderBottom: '1px solid #e9ecef',
      fontSize: '13px',
      textAlign: 'center',
    },
    row: {
      cursor: 'pointer',
      backgroundColor: BRAND.white,
      transition: 'background-color 0.15s ease',
    },
    rowAlt: {
      cursor: 'pointer',
      backgroundColor: BRAND.lightGray,
      transition: 'background-color 0.15s ease',
    },
    checkGreen: {
      color: BRAND.green,
      fontWeight: '700',
      fontSize: '14px',
    },
    crossGray: {
      color: '#bbb',
      fontWeight: '400',
      fontSize: '14px',
    },
    badgeComplete: {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '12px',
      backgroundColor: '#d4edda',
      color: '#155724',
      fontSize: '11px',
      fontWeight: '600',
    },
    badgePartial: {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '12px',
      backgroundColor: '#fff3cd',
      color: '#856404',
      fontSize: '11px',
      fontWeight: '600',
    },
    summary: {
      display: 'flex',
      gap: '16px',
      marginTop: '12px',
      fontSize: '13px',
      color: BRAND.gray,
    },
    loading: {
      textAlign: 'center',
      padding: '40px',
      color: BRAND.gray,
      fontSize: '14px',
    },
    emptyState: {
      textAlign: 'center',
      padding: '40px',
      color: BRAND.gray,
      fontSize: '14px',
    },
    label: {
      fontSize: '12px',
      color: BRAND.gray,
      marginBottom: '2px',
    },
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Reconciliation Packages</h2>
        <button
          style={styles.uploadBtn}
          onClick={() => setShowUpload(prev => !prev)}
        >
          {showUpload ? 'Hide Upload' : 'Upload New'}
        </button>
      </div>

      {/* Inline upload panel */}
      {showUpload && (
        <div style={{ marginBottom: '20px', border: '1px solid #dee2e6', borderRadius: '6px', padding: '16px', backgroundColor: BRAND.lightGray }}>
          <ReconciliationUpload
            onUploadComplete={() => {
              loadPackages()
              setShowUpload(false)
            }}
          />
        </div>
      )}

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <div>
          <div style={styles.label}>Date</div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={styles.filterInput}
            placeholder="Filter by date"
          />
        </div>

        <div>
          <div style={styles.label}>Status</div>
          <div style={styles.filterGroup}>
            <button
              style={styles.filterBtn(statusFilter === 'all')}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              style={styles.filterBtn(statusFilter === 'complete')}
              onClick={() => setStatusFilter('complete')}
            >
              Complete
            </button>
            <button
              style={styles.filterBtn(statusFilter === 'partial')}
              onClick={() => setStatusFilter('partial')}
            >
              Partial
            </button>
          </div>
        </div>

        <div>
          <div style={styles.label}>Foreman</div>
          <input
            type="text"
            value={foremanFilter}
            onChange={(e) => setForemanFilter(e.target.value)}
            style={styles.filterInput}
            placeholder="Filter by foreman"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading packages...</div>
      ) : filteredPackages.length === 0 ? (
        <div style={styles.emptyState}>
          No reconciliation packages found.
          {(dateFilter || statusFilter !== 'all' || foremanFilter) && ' Try adjusting your filters.'}
        </div>
      ) : (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ticket #</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Foreman</th>
                <th style={styles.thCenter}>LEM</th>
                <th style={styles.thCenter}>TK</th>
                <th style={styles.thCenter}>PH</th>
                <th style={styles.thCenter}>RPT</th>
                <th style={styles.thCenter}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPackages.map((pkg, idx) => {
                const complete = isComplete(pkg)
                return (
                  <tr
                    key={pkg.ticket_number}
                    style={idx % 2 === 0 ? styles.row : styles.rowAlt}
                    onClick={() => onSelectTicket(pkg.ticket_number)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e7f3ff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        idx % 2 === 0 ? BRAND.white : BRAND.lightGray
                    }}
                  >
                    <td style={{ ...styles.td, fontWeight: '600' }}>
                      {pkg.ticket_number}
                    </td>
                    <td style={styles.td}>
                      {pkg.date || '\u2014'}
                    </td>
                    <td style={styles.td}>
                      {pkg.foreman || '\u2014'}
                    </td>
                    <td style={styles.tdCenter}>
                      {pkg.has_lem > 0
                        ? <span style={styles.checkGreen}>&#10003;</span>
                        : <span style={styles.crossGray}>&#10007;</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      {pkg.has_ticket > 0
                        ? <span style={styles.checkGreen}>&#10003;</span>
                        : <span style={styles.crossGray}>&#10007;</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      {pkg.has_photo > 0
                        ? <span style={styles.checkGreen}>&#10003;</span>
                        : <span style={styles.crossGray}>&#10007;</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      {pkg.has_report > 0
                        ? <span style={styles.checkGreen}>&#10003;</span>
                        : <span style={styles.crossGray}>&#10007;</span>}
                    </td>
                    <td style={styles.tdCenter}>
                      {complete
                        ? <span style={styles.badgeComplete}>Complete</span>
                        : <span style={styles.badgePartial}>Partial</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Count summary */}
          <div style={styles.summary}>
            <span><strong>{filteredPackages.length}</strong> packages</span>
            <span style={{ color: BRAND.green }}><strong>{completeCount}</strong> complete</span>
            <span style={{ color: '#856404' }}><strong>{partialCount}</strong> partial</span>
          </div>
        </>
      )}
    </div>
  )
}
