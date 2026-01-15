// ============================================================================
// NDT MONITORING TAB - ADD TO ChiefDashboard.jsx
// Add this state, functions, and tab content to your existing ChiefDashboard
// ============================================================================

// =============================================
// ADD TO STATE SECTION (around line 73, after fullProgressData)
// =============================================

  // NDT MONITORING STATE (simplified KPIs)
  const [ndtKPIs, setNdtKPIs] = useState({
    totalWelds: 0,
    totalRepairs: 0,
    repairRate: 0,
    targetRate: 6.5,
    pendingNDT: 0,
    flaggedWelders: [],
    recentDisagreements: []
  })
  const [ndtLoading, setNdtLoading] = useState(false)

// =============================================
// ADD TO useEffect or create new one (after line 78)
// =============================================

  useEffect(() => {
    if (activeTab === 'ndt') fetchNDTKPIs()
  }, [activeTab])

// =============================================
// ADD THESE FUNCTIONS (before the render section)
// =============================================

  async function fetchNDTKPIs() {
    setNdtLoading(true)
    try {
      // Fetch weld stats
      const { data: weldData } = await supabase
        .from('weld_book')
        .select('id, weld_number, welder_id, welder_name, nde_status, repair_count, kp')
      
      const welderMap = {}
      let totalWelds = 0
      let totalRepairs = 0
      let pendingNDT = 0
      
      for (const weld of (weldData || [])) {
        totalWelds++
        const repairs = weld.repair_count || (weld.nde_status === 'repair' ? 1 : 0)
        if (repairs > 0) totalRepairs += repairs
        if (weld.nde_status === 'pending' || weld.nde_status === 'repair') pendingNDT++
        
        const welderKey = weld.welder_id || weld.welder_name || 'Unknown'
        if (!welderMap[welderKey]) {
          welderMap[welderKey] = { name: weld.welder_name || welderKey, welds: 0, repairs: 0 }
        }
        welderMap[welderKey].welds++
        welderMap[welderKey].repairs += repairs
      }
      
      // Calculate flagged welders (>5% repair rate)
      const flaggedWelders = Object.values(welderMap)
        .map(w => ({ ...w, rate: w.welds > 0 ? (w.repairs / w.welds * 100) : 0 }))
        .filter(w => w.rate > 5)
        .sort((a, b) => b.rate - a.rate)
      
      // Fetch recent disagreements (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data: disagreements } = await supabase
        .from('ndt_inspections')
        .select(`
          id, inspection_number, inspection_date, method, technician_name,
          interpretation_result, comments, weld_id,
          weld:weld_book(id, weld_number, kp, welder_name)
        `)
        .eq('interpretation_agree', false)
        .gte('inspection_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('inspection_date', { ascending: false })
        .limit(5)
      
      const repairRate = totalWelds > 0 ? (totalRepairs / totalWelds * 100) : 0
      
      setNdtKPIs({
        totalWelds,
        totalRepairs,
        repairRate,
        targetRate: 6.5,
        pendingNDT,
        flaggedWelders,
        recentDisagreements: disagreements || []
      })
    } catch (err) {
      console.error('Error fetching NDT KPIs:', err)
    }
    setNdtLoading(false)
  }

  function navigateToAuditorDashboard(weldId = null) {
    if (weldId) {
      navigate(`/auditor-dashboard?readonly=true&weld=${weldId}`)
    } else {
      navigate('/auditor-dashboard?readonly=true')
    }
  }

// =============================================
// ADD TAB BUTTON (in the tab navigation section)
// =============================================

          <button
            onClick={() => setActiveTab('ndt')}
            style={{
              padding: '15px 30px',
              backgroundColor: activeTab === 'ndt' ? '#fff' : '#f8f9fa',
              border: 'none',
              borderBottom: activeTab === 'ndt' ? '3px solid #1a5f2a' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'ndt' ? 'bold' : 'normal',
              fontSize: '16px'
            }}
          >
            🔬 NDT Monitoring
            {ndtKPIs.flaggedWelders.length > 0 && (
              <span style={{ marginLeft: '8px', backgroundColor: '#dc3545', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                {ndtKPIs.flaggedWelders.length}
              </span>
            )}
          </button>

// =============================================
// ADD TAB CONTENT (after the summary tab content)
// =============================================

      {/* NDT MONITORING TAB - Simplified KPIs */}
      {activeTab === 'ndt' && (
        <div style={{ padding: '30px' }}>
          {ndtLoading ? (
            <div style={{ textAlign: 'center', padding: '50px' }}><p>Loading NDT data...</p></div>
          ) : (
            <>
              {/* Action Bar */}
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, color: '#1a5f2a' }}>🔬 NDT Monitoring Dashboard</h2>
                <button
                  onClick={() => navigateToAuditorDashboard()}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#6f42c1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Open Full Auditor Dashboard →
                </button>
              </div>

              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
                {/* Repair Rate */}
                <div style={{
                  padding: '25px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  backgroundColor: ndtKPIs.repairRate > ndtKPIs.targetRate ? '#f8d7da' : '#d4edda',
                  border: `2px solid ${ndtKPIs.repairRate > ndtKPIs.targetRate ? '#dc3545' : '#28a745'}`
                }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#495057', textTransform: 'uppercase' }}>Cumulative Repair Rate</h3>
                  <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: ndtKPIs.repairRate > ndtKPIs.targetRate ? '#dc3545' : '#28a745' }}>
                    {ndtKPIs.repairRate.toFixed(1)}%
                  </p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#666' }}>
                    Target: ≤{ndtKPIs.targetRate}% | {ndtKPIs.totalRepairs} / {ndtKPIs.totalWelds} welds
                  </p>
                </div>

                {/* Total Welds */}
                <div style={{ padding: '25px', borderRadius: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #dee2e6' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#495057', textTransform: 'uppercase' }}>Total Welds</h3>
                  <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#17a2b8' }}>{ndtKPIs.totalWelds}</p>
                </div>

                {/* Pending NDT */}
                <div style={{ padding: '25px', borderRadius: '8px', textAlign: 'center', backgroundColor: ndtKPIs.pendingNDT > 0 ? '#fff3cd' : 'white', border: `1px solid ${ndtKPIs.pendingNDT > 0 ? '#ffc107' : '#dee2e6'}` }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#495057', textTransform: 'uppercase' }}>Pending Review</h3>
                  <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: ndtKPIs.pendingNDT > 0 ? '#856404' : '#28a745' }}>{ndtKPIs.pendingNDT}</p>
                </div>

                {/* Flagged Welders */}
                <div style={{ padding: '25px', borderRadius: '8px', textAlign: 'center', backgroundColor: ndtKPIs.flaggedWelders.length > 0 ? '#f8d7da' : '#d4edda', border: `1px solid ${ndtKPIs.flaggedWelders.length > 0 ? '#dc3545' : '#28a745'}` }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#495057', textTransform: 'uppercase' }}>Flagged Welders</h3>
                  <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: ndtKPIs.flaggedWelders.length > 0 ? '#dc3545' : '#28a745' }}>{ndtKPIs.flaggedWelders.length}</p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#666' }}>Above 5% threshold</p>
                </div>
              </div>

              {/* Two Column Layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Flagged Welders Table */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#dc3545', padding: '15px 20px', color: 'white' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>⚠️ Welder Performance Flags (&gt;5%)</h3>
                  </div>
                  {ndtKPIs.flaggedWelders.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#28a745' }}>
                      <p style={{ fontSize: '16px', margin: 0 }}>✅ All welders within acceptable limits</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Welder</th>
                          <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Welds</th>
                          <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Repairs</th>
                          <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ndtKPIs.flaggedWelders.map((welder, idx) => (
                          <tr key={idx} style={{ backgroundColor: '#fff3cd' }}>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{welder.name}</td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>{welder.welds}</td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', textAlign: 'center', color: '#dc3545' }}>{welder.repairs}</td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', textAlign: 'center', fontWeight: 'bold', color: '#dc3545' }}>{welder.rate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Recent Disagreements */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#6f42c1', padding: '15px 20px', color: 'white' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>📋 Recent Interpretation Disagreements</h3>
                  </div>
                  {ndtKPIs.recentDisagreements.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#28a745' }}>
                      <p style={{ fontSize: '16px', margin: 0 }}>✅ No disagreements in last 30 days</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Date</th>
                          <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Weld</th>
                          <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Method</th>
                          <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ndtKPIs.recentDisagreements.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{item.inspection_date}</td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee' }}>
                              <strong>{item.weld?.weld_number}</strong>
                              <br />
                              <span style={{ fontSize: '11px', color: '#666' }}>KP {item.weld?.kp?.toFixed(3)}</span>
                            </td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee' }}>{item.method}</td>
                            <td style={{ padding: '12px 15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                              <button
                                onClick={() => navigateToAuditorDashboard(item.weld?.id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#6f42c1',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ padding: '10px 20px', backgroundColor: '#f8f9fa', borderTop: '1px solid #dee2e6', textAlign: 'center' }}>
                    <button
                      onClick={() => navigateToAuditorDashboard()}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        color: '#6f42c1',
                        border: '1px solid #6f42c1',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      View All in Auditor Dashboard →
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
