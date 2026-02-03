import React, { useState, useEffect } from 'react'

// ClearingLog component for clearing/grubbing inspection
// Collapsible sections with repeatable timber deck entries

function ClearingLog({ contractor, foreman, blockId, reportId, existingData, onDataChange }) {
  const [clearingData, setClearingData] = useState(() => {
    const defaultData = {
      rowBoundaries: {},
      preClearingApprovals: {},
      environmental: {},
      buriedFacilities: {},
      powerLines: {},
      timberSalvage: {},
      timberDecks: [],
      grubbingStripping: {},
      watercourse: {},
      tempFencing: {},
      signOff: {}
    }
    if (existingData && Object.keys(existingData).length > 0) {
      return { ...defaultData, ...existingData, timberDecks: existingData.timberDecks || [] }
    }
    return defaultData
  })

  const [expandedSections, setExpandedSections] = useState({
    'ROW & Boundaries': true,
    'Pre-Clearing Approvals': false,
    'Environmental': false,
    'Buried Facilities': false,
    'Power Lines': false,
    'Timber Salvage': false,
    'Timber Decks': false,
    'Grubbing & Stripping': false,
    'Watercourse': false,
    'Temp Fencing': false,
    'Sign-Off': false
  })

  useEffect(() => {
    if (onDataChange) onDataChange(clearingData)
  }, [clearingData])

  const toggleSection = (name) => setExpandedSections(prev => ({ ...prev, [name]: !prev[name] }))

  const updateField = (section, field, value) => {
    setClearingData(prev => ({ ...prev, [section]: { ...(prev[section] || {}), [field]: value } }))
  }

  // Timber Deck management (repeatable)
  const addTimberDeck = () => setClearingData(prev => ({ ...prev, timberDecks: [...(prev.timberDecks || []), { deckId: '', startKp: '', endKp: '', ownerStatus: '', speciesSort: '', condition: '', cutSpec: '', minTopDiameter: '', destination: '', volumeEstimate: '' }] }))
  const updateTimberDeck = (idx, field, val) => setClearingData(prev => ({ ...prev, timberDecks: (prev.timberDecks || []).map((d, i) => i === idx ? { ...d, [field]: val } : d) }))
  const removeTimberDeck = (idx) => setClearingData(prev => ({ ...prev, timberDecks: (prev.timberDecks || []).filter((_, i) => i !== idx) }))

  // Styles
  const inputStyle = { width: '100%', padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px', color: '#555' }
  const sectionStyle = { marginBottom: '10px', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden' }
  const contentStyle = { padding: '15px', backgroundColor: '#fff' }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }

  return (
    <div style={{ marginTop: '15px' }}>

      {/* ROW & BOUNDARIES */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('ROW & Boundaries')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['ROW & Boundaries'] ? '#28a745' : '#e9ecef', color: expandedSections['ROW & Boundaries'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📐 Right-of-Way & Boundaries</span>
          <span>{expandedSections['ROW & Boundaries'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['ROW & Boundaries'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Design ROW Width (m)</label><input type="text" inputMode="numeric" value={clearingData.rowBoundaries?.rowWidthDesign || ''} onChange={(e) => updateField('rowBoundaries', 'rowWidthDesign', e.target.value)} placeholder="Per route sheets" style={inputStyle} /></div>
              <div><label style={labelStyle}>Actual ROW Width (m)</label><input type="text" inputMode="numeric" value={clearingData.rowBoundaries?.rowWidthActual || ''} onChange={(e) => updateField('rowBoundaries', 'rowWidthActual', e.target.value)} placeholder="Field measured" style={inputStyle} /></div>
              <div><label style={labelStyle}>ROW Width Compliant?</label><select value={clearingData.rowBoundaries?.rowWidthCompliant || ''} onChange={(e) => updateField('rowBoundaries', 'rowWidthCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No - Over Width">No - Over Width</option><option value="No - Under Width">No - Under Width</option></select></div>
              <div><label style={labelStyle}>ROW Alignment Verified?</label><select value={clearingData.rowBoundaries?.rowAlignmentVerified || ''} onChange={(e) => updateField('rowBoundaries', 'rowAlignmentVerified', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Boundaries Flagged & Visible?</label><select value={clearingData.rowBoundaries?.boundariesFlagged || ''} onChange={(e) => updateField('rowBoundaries', 'boundariesFlagged', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="Partially">Partially</option></select></div>
              <div><label style={labelStyle}>TWS Staked?</label><select value={clearingData.rowBoundaries?.twsStaked || ''} onChange={(e) => updateField('rowBoundaries', 'twsStaked', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Legal Survey Pins Protected?</label><select value={clearingData.rowBoundaries?.legalSurveyPinsProtected || ''} onChange={(e) => updateField('rowBoundaries', 'legalSurveyPinsProtected', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="None Present">None Present</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* PRE-CLEARING APPROVALS */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Pre-Clearing Approvals')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Pre-Clearing Approvals'] ? '#28a745' : '#e9ecef', color: expandedSections['Pre-Clearing Approvals'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Pre-Clearing Approvals</span>
          <span>{expandedSections['Pre-Clearing Approvals'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Pre-Clearing Approvals'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>CGR Plan Approved & On-Site?</label><select value={clearingData.preClearingApprovals?.cgrPlanApproved || ''} onChange={(e) => updateField('preClearingApprovals', 'cgrPlanApproved', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Work Compliant with CGR Plan?</label><select value={clearingData.preClearingApprovals?.cgrPlanCompliance || ''} onChange={(e) => updateField('preClearingApprovals', 'cgrPlanCompliance', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="Partial Deviation">Partial Deviation</option></select></div>
              <div><label style={labelStyle}>Off-ROW Approvals in Place?</label><select value={clearingData.preClearingApprovals?.offRowApprovalsInPlace || ''} onChange={(e) => updateField('preClearingApprovals', 'offRowApprovalsInPlace', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A - No Off-ROW Work">N/A - No Off-ROW Work</option></select></div>
              <div><label style={labelStyle}>Construction Line List Reviewed?</label><select value={clearingData.preClearingApprovals?.constructionLineListReviewed || ''} onChange={(e) => updateField('preClearingApprovals', 'constructionLineListReviewed', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Landowner Restrictions Noted?</label><select value={clearingData.preClearingApprovals?.landownerRestrictionsNoted || ''} onChange={(e) => updateField('preClearingApprovals', 'landownerRestrictionsNoted', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes - Compliant">Yes - Compliant</option><option value="Yes - Non-Compliant">Yes - Non-Compliant</option><option value="No Restrictions">No Restrictions</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Land Agent Contact Maintained?</label><select value={clearingData.preClearingApprovals?.landAgentContact || ''} onChange={(e) => updateField('preClearingApprovals', 'landAgentContact', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* ENVIRONMENTAL COMPLIANCE */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Environmental')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Environmental'] ? '#28a745' : '#e9ecef', color: expandedSections['Environmental'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🌿 Environmental Compliance</span>
          <span>{expandedSections['Environmental'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Environmental'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Liaised with Environmental Inspector?</label><select value={clearingData.environmental?.environmentalInspectorLiaison || ''} onChange={(e) => updateField('environmental', 'environmentalInspectorLiaison', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Timing Constraints Met? (Wildlife)</label><select value={clearingData.environmental?.timingConstraintsMet || ''} onChange={(e) => updateField('environmental', 'timingConstraintsMet', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Wildlife Regulations Compliant?</label><select value={clearingData.environmental?.wildlifeRegulationsCompliant || ''} onChange={(e) => updateField('environmental', 'wildlifeRegulationsCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Rare Plant Areas Protected?</label><select value={clearingData.environmental?.rarePlantProtection || ''} onChange={(e) => updateField('environmental', 'rarePlantProtection', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="None Identified">None Identified</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>ASRD Commitments Met?</label><select value={clearingData.environmental?.asrdCommitmentsMet || ''} onChange={(e) => updateField('environmental', 'asrdCommitmentsMet', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Ground Disturbance per Contract?</label><select value={clearingData.environmental?.groundDisturbanceCompliant || ''} onChange={(e) => updateField('environmental', 'groundDisturbanceCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* BURIED FACILITIES & UTILITIES */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Buried Facilities')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Buried Facilities'] ? '#28a745' : '#e9ecef', color: expandedSections['Buried Facilities'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ Buried Facilities & Utilities</span>
          <span>{expandedSections['Buried Facilities'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Buried Facilities'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Buried Facilities Identified?</label><select value={clearingData.buriedFacilities?.buriedFacilitiesIdentified || ''} onChange={(e) => updateField('buriedFacilities', 'buriedFacilitiesIdentified', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="None Present">None Present</option></select></div>
              <div><label style={labelStyle}>Utility Locates Complete?</label><select value={clearingData.buriedFacilities?.locatesComplete || ''} onChange={(e) => updateField('buriedFacilities', 'locatesComplete', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="Pending">Pending</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Hand/Hydrovac Exposing Complete?</label><select value={clearingData.buriedFacilities?.handExposingComplete || ''} onChange={(e) => updateField('buriedFacilities', 'handExposingComplete', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="In Progress">In Progress</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Foreign Crossings Marked?</label><select value={clearingData.buriedFacilities?.foreignCrossingsMarked || ''} onChange={(e) => updateField('buriedFacilities', 'foreignCrossingsMarked', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* OVERHEAD POWER LINES */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Power Lines')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Power Lines'] ? '#28a745' : '#e9ecef', color: expandedSections['Power Lines'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚡ Overhead Power Lines</span>
          <span>{expandedSections['Power Lines'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Power Lines'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Power Lines Present?</label><select value={clearingData.powerLines?.powerLinesPresent || ''} onChange={(e) => updateField('powerLines', 'powerLinesPresent', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Power Lines Identified per Specs?</label><select value={clearingData.powerLines?.powerLinesIdentified || ''} onChange={(e) => updateField('powerLines', 'powerLinesIdentified', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Power Lines Marked per Safety?</label><select value={clearingData.powerLines?.powerLinesMarked || ''} onChange={(e) => updateField('powerLines', 'powerLinesMarked', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Adequate Clearance Maintained?</label><select value={clearingData.powerLines?.powerLinesClearance || ''} onChange={(e) => updateField('powerLines', 'powerLinesClearance', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Power Line Voltage</label><input type="text" value={clearingData.powerLines?.powerLineVoltage || ''} onChange={(e) => updateField('powerLines', 'powerLineVoltage', e.target.value)} placeholder="e.g., 25kV, 138kV" style={inputStyle} /></div>
            </div>
          </div>
        )}
      </div>

      {/* TIMBER SALVAGE */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Timber Salvage')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Timber Salvage'] ? '#28a745' : '#e9ecef', color: expandedSections['Timber Salvage'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🪓 Timber Salvage</span>
          <span>{expandedSections['Timber Salvage'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Timber Salvage'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Timber Salvage Required?</label><select value={clearingData.timberSalvage?.timberSalvageRequired || ''} onChange={(e) => updateField('timberSalvage', 'timberSalvageRequired', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Harvesting per TSP Requirements?</label><select value={clearingData.timberSalvage?.timberSalvageCompliant || ''} onChange={(e) => updateField('timberSalvage', 'timberSalvageCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Merchantable Timber Salvaged?</label><select value={clearingData.timberSalvage?.merchantableTimberSalvaged || ''} onChange={(e) => updateField('timberSalvage', 'merchantableTimberSalvaged', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Timber Disposal Method</label><select value={clearingData.timberSalvage?.timberDisposalMethod || ''} onChange={(e) => updateField('timberSalvage', 'timberDisposalMethod', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Decked for Haul">Decked for Haul</option><option value="Mulched">Mulched</option><option value="Burned">Burned</option><option value="Rollback">Rollback</option><option value="Mixed Methods">Mixed Methods</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* TIMBER DECKS - REPEATABLE */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Timber Decks')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Timber Decks'] ? '#28a745' : '#e9ecef', color: expandedSections['Timber Decks'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🪵 Timber Decking Log ({(clearingData.timberDecks || []).length})</span>
          <span>{expandedSections['Timber Decks'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Timber Decks'] && (
          <div style={contentStyle}>
            {(clearingData.timberDecks || []).length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic', margin: '0 0 15px 0' }}>No timber decks logged. Click "Add Timber Deck" to start.</p>
            ) : (
              (clearingData.timberDecks || []).map((deck, idx) => (
                <div key={idx} style={{ marginBottom: '15px', padding: '15px', backgroundColor: idx % 2 === 0 ? '#f8f9fa' : '#fff', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#28a745' }}>Deck #{idx + 1}</strong>
                    <button type="button" onClick={() => removeTimberDeck(idx)} style={{ padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
                  </div>
                  <div style={gridStyle}>
                    <div><label style={labelStyle}>Deck ID</label><input type="text" value={deck.deckId || ''} onChange={(e) => updateTimberDeck(idx, 'deckId', e.target.value)} placeholder="e.g., D-004" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Start KP</label><input type="text" inputMode="decimal" value={deck.startKp || ''} onChange={(e) => updateTimberDeck(idx, 'startKp', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>End KP</label><input type="text" inputMode="decimal" value={deck.endKp || ''} onChange={(e) => updateTimberDeck(idx, 'endKp', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Owner/Status</label><select value={deck.ownerStatus || ''} onChange={(e) => updateTimberDeck(idx, 'ownerStatus', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Crown">Crown</option><option value="Private (Freehold)">Private (Freehold)</option></select></div>
                    <div><label style={labelStyle}>Species Sort</label><select value={deck.speciesSort || ''} onChange={(e) => updateTimberDeck(idx, 'speciesSort', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Coniferous (Softwood)">Coniferous (Softwood)</option><option value="Deciduous (Hardwood)">Deciduous (Hardwood)</option><option value="Mixed">Mixed</option></select></div>
                    <div><label style={labelStyle}>Timber Condition</label><select value={deck.condition || ''} onChange={(e) => updateTimberDeck(idx, 'condition', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Green (Live)">Green (Live)</option><option value="Dry/Dead">Dry/Dead</option><option value="Burned">Burned</option></select></div>
                    <div><label style={labelStyle}>Cut Specification</label><select value={deck.cutSpec || ''} onChange={(e) => updateTimberDeck(idx, 'cutSpec', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Tree Length">Tree Length</option><option value="Cut-to-Length">Cut-to-Length</option></select></div>
                    <div><label style={labelStyle}>Min Top Diameter (cm)</label><input type="text" inputMode="numeric" value={deck.minTopDiameter || ''} onChange={(e) => updateTimberDeck(idx, 'minTopDiameter', e.target.value)} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Disposal/Destination</label><select value={deck.destination || ''} onChange={(e) => updateTimberDeck(idx, 'destination', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Haul to Mill">Haul to Mill</option><option value="Rollback (Reclamation)">Rollback (Reclamation)</option><option value="Firewood">Firewood</option><option value="Mulch/Burn">Mulch/Burn</option></select></div>
                    <div><label style={labelStyle}>Volume Estimate (m³)</label><input type="text" inputMode="numeric" value={deck.volumeEstimate || ''} onChange={(e) => updateTimberDeck(idx, 'volumeEstimate', e.target.value)} style={inputStyle} /></div>
                  </div>
                </div>
              ))
            )}
            <button type="button" onClick={addTimberDeck} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Timber Deck</button>
          </div>
        )}
      </div>

      {/* GRUBBING & STRIPPING */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Grubbing & Stripping')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Grubbing & Stripping'] ? '#28a745' : '#e9ecef', color: expandedSections['Grubbing & Stripping'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🌱 Grubbing & Stripping</span>
          <span>{expandedSections['Grubbing & Stripping'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Grubbing & Stripping'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Grubbing Complete?</label><select value={clearingData.grubbingStripping?.grubbingComplete || ''} onChange={(e) => updateField('grubbingStripping', 'grubbingComplete', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="In Progress">In Progress</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Stump Height Compliant?</label><select value={clearingData.grubbingStripping?.stumpHeightCompliant || ''} onChange={(e) => updateField('grubbingStripping', 'stumpHeightCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Max Stump Height (cm)</label><input type="text" inputMode="numeric" value={clearingData.grubbingStripping?.stumpHeightMax || ''} onChange={(e) => updateField('grubbingStripping', 'stumpHeightMax', e.target.value)} placeholder="Spec ≤15cm" style={inputStyle} /></div>
              <div><label style={labelStyle}>Topsoil Stripped & Stockpiled?</label><select value={clearingData.grubbingStripping?.topsoilStripped || ''} onChange={(e) => updateField('grubbingStripping', 'topsoilStripped', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Topsoil Separated from Subsoil?</label><select value={clearingData.grubbingStripping?.topsoilSeparation || ''} onChange={(e) => updateField('grubbingStripping', 'topsoilSeparation', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* WATERCOURSE CROSSINGS */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Watercourse')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Watercourse'] ? '#28a745' : '#e9ecef', color: expandedSections['Watercourse'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🌊 Watercourse Crossings</span>
          <span>{expandedSections['Watercourse'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Watercourse'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Watercourse in Work Area?</label><select value={clearingData.watercourse?.watercoursePresent || ''} onChange={(e) => updateField('watercourse', 'watercoursePresent', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Access Clearing per Specs?</label><select value={clearingData.watercourse?.watercourseAccessCompliant || ''} onChange={(e) => updateField('watercourse', 'watercourseAccessCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Equipment Crossing Installed?</label><select value={clearingData.watercourse?.equipmentCrossingInstalled || ''} onChange={(e) => updateField('watercourse', 'equipmentCrossingInstalled', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Crossing Type</label><select value={clearingData.watercourse?.equipmentCrossingType || ''} onChange={(e) => updateField('watercourse', 'equipmentCrossingType', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Temporary Bridge">Temporary Bridge</option><option value="Mat Crossing">Mat Crossing</option><option value="Culvert">Culvert</option><option value="Ford">Ford</option><option value="Other">Other</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Compliant with Regulatory Approvals?</label><select value={clearingData.watercourse?.regulatoryApprovalCompliant || ''} onChange={(e) => updateField('watercourse', 'regulatoryApprovalCompliant', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Erosion Controls Installed?</label><select value={clearingData.watercourse?.erosionControlsInstalled || ''} onChange={(e) => updateField('watercourse', 'erosionControlsInstalled', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
            </div>
          </div>
        )}
      </div>

      {/* TEMPORARY FENCING */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Temp Fencing')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Temp Fencing'] ? '#28a745' : '#e9ecef', color: expandedSections['Temp Fencing'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🚧 Temporary Fencing</span>
          <span>{expandedSections['Temp Fencing'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Temp Fencing'] && (
          <div style={contentStyle}>
            <div style={gridStyle}>
              <div><label style={labelStyle}>Temporary Fencing Required?</label><select value={clearingData.tempFencing?.tempFencingRequired || ''} onChange={(e) => updateField('tempFencing', 'tempFencingRequired', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
              <div><label style={labelStyle}>Temporary Fencing Installed?</label><select value={clearingData.tempFencing?.tempFencingInstalled || ''} onChange={(e) => updateField('tempFencing', 'tempFencingInstalled', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="In Progress">In Progress</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Fencing Type</label><select value={clearingData.tempFencing?.tempFencingType || ''} onChange={(e) => updateField('tempFencing', 'tempFencingType', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Page Wire">Page Wire</option><option value="Barbed Wire">Barbed Wire</option><option value="Electric">Electric</option><option value="Snow Fence">Snow Fence</option><option value="Construction Fence">Construction Fence</option><option value="Other">Other</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Fencing Length (m)</label><input type="text" inputMode="numeric" value={clearingData.tempFencing?.tempFencingLength || ''} onChange={(e) => updateField('tempFencing', 'tempFencingLength', e.target.value)} placeholder="Total meters" style={inputStyle} /></div>
              <div><label style={labelStyle}>Gates Installed?</label><select value={clearingData.tempFencing?.gatesInstalled || ''} onChange={(e) => updateField('tempFencing', 'gatesInstalled', e.target.value)} style={inputStyle}><option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option><option value="N/A">N/A</option></select></div>
              <div><label style={labelStyle}>Number of Gates</label><input type="text" inputMode="numeric" value={clearingData.tempFencing?.gatesCount || ''} onChange={(e) => updateField('tempFencing', 'gatesCount', e.target.value)} style={inputStyle} /></div>
            </div>
          </div>
        )}
      </div>

      {/* SIGN-OFF */}
      <div style={sectionStyle}>
        <button type="button" onClick={() => toggleSection('Sign-Off')} style={{ width: '100%', padding: '12px 15px', backgroundColor: expandedSections['Sign-Off'] ? '#28a745' : '#e9ecef', color: expandedSections['Sign-Off'] ? 'white' : '#333', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Sign-Off</span>
          <span>{expandedSections['Sign-Off'] ? '▼' : '▶'}</span>
        </button>
        {expandedSections['Sign-Off'] && (
          <div style={contentStyle}>
            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>NCR Required?</label>
              <select value={clearingData.signOff?.ncrRequired || ''} onChange={(e) => updateField('signOff', 'ncrRequired', e.target.value)} style={inputStyle}>
                <option value="">Select...</option>
                <option value="No">No</option>
                <option value="Yes - Issued">Yes - Issued</option>
                <option value="Yes - Pending">Yes - Pending</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Inspector Notes</label>
              <textarea value={clearingData.signOff?.notes || ''} onChange={(e) => updateField('signOff', 'notes', e.target.value)} placeholder="Additional observations, issues, or comments..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default ClearingLog
