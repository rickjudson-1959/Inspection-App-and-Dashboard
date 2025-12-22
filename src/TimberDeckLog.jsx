import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

/**
 * TimberDeckLog Component
 * Tracks Timber Salvage Plan (TSP) compliance for Clearing inspections
 * Allows logging of multiple timber decks per daily report
 */

const OWNER_OPTIONS = ['Crown', 'Private (Freehold)'];
const SPECIES_OPTIONS = ['Coniferous (Softwood)', 'Deciduous (Hardwood)', 'Mixed'];
const CONDITION_OPTIONS = ['Green (Live)', 'Dry/Dead', 'Burned'];
const CUT_SPEC_OPTIONS = ['Tree Length', 'Cut-to-Length'];
const DISPOSAL_OPTIONS = ['Haul to Mill', 'Rollback (Reclamation)', 'Firewood', 'Mulch/Burn'];

const emptyDeck = {
  deck_id: '',
  start_kp: '',
  end_kp: '',
  owner_status: 'Crown',
  species_sort: 'Coniferous (Softwood)',
  condition: 'Green (Live)',
  cut_specification: 'Tree Length',
  min_top_diameter_cm: '',
  disposal_destination: 'Haul to Mill',
  volume_estimate: '',
  volume_unit: 'm³',
  notes: ''
};

const TimberDeckLog = ({ dailyReportId, projectId, onUpdate }) => {
  const [decks, setDecks] = useState([{ ...emptyDeck, id: Date.now() }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Load existing decks for this daily report
  useEffect(() => {
    if (dailyReportId) {
      loadExistingDecks();
    }
  }, [dailyReportId]);

  const loadExistingDecks = async () => {
    try {
      const { data, error } = await supabase
        .from('timber_decks')
        .select('*')
        .eq('daily_report_id', dailyReportId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setDecks(data);
      }
    } catch (err) {
      console.error('Error loading timber decks:', err);
    }
  };

  const addDeck = () => {
    setDecks([...decks, { ...emptyDeck, id: Date.now() }]);
    setSaved(false);
  };

  const removeDeck = (index) => {
    if (decks.length > 1) {
      const updated = decks.filter((_, i) => i !== index);
      setDecks(updated);
      setSaved(false);
    }
  };

  const updateDeck = (index, field, value) => {
    const updated = [...decks];
    updated[index] = { ...updated[index], [field]: value };
    setDecks(updated);
    setSaved(false);
  };

  const saveDecks = async () => {
    if (!dailyReportId) {
      setError('No daily report ID provided');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Delete existing decks for this report
      await supabase
        .from('timber_decks')
        .delete()
        .eq('daily_report_id', dailyReportId);

      // Insert updated decks
      const decksToInsert = decks.map(deck => ({
        daily_report_id: dailyReportId,
        project_id: projectId,
        deck_id: deck.deck_id,
        start_kp: parseFloat(deck.start_kp) || null,
        end_kp: parseFloat(deck.end_kp) || null,
        owner_status: deck.owner_status,
        species_sort: deck.species_sort,
        condition: deck.condition,
        cut_specification: deck.cut_specification,
        min_top_diameter_cm: parseFloat(deck.min_top_diameter_cm) || null,
        disposal_destination: deck.disposal_destination,
        volume_estimate: parseFloat(deck.volume_estimate) || null,
        volume_unit: deck.volume_unit,
        notes: deck.notes
      }));

      const { data, error } = await supabase
        .from('timber_decks')
        .insert(decksToInsert)
        .select();

      if (error) throw error;

      setDecks(data);
      setSaved(true);
      
      if (onUpdate) {
        onUpdate(data);
      }

      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving timber decks:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Styles
  const styles = {
    container: {
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      padding: '24px',
      marginTop: '20px',
      border: '1px solid #e2e8f0'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      paddingBottom: '16px',
      borderBottom: '2px solid #1E3A5F'
    },
    title: {
      fontSize: '1.25rem',
      fontWeight: '700',
      color: '#1E3A5F',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    deckCard: {
      backgroundColor: 'white',
      borderRadius: '10px',
      padding: '20px',
      marginBottom: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    deckHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '16px',
      paddingBottom: '12px',
      borderBottom: '1px solid #e2e8f0'
    },
    deckNumber: {
      fontSize: '1rem',
      fontWeight: '600',
      color: '#1E3A5F'
    },
    removeBtn: {
      backgroundColor: '#fee2e2',
      color: '#dc2626',
      border: 'none',
      borderRadius: '6px',
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '500'
    },
    formGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px'
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    },
    label: {
      fontSize: '0.85rem',
      fontWeight: '600',
      color: '#475569'
    },
    input: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5e1',
      fontSize: '0.95rem',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    },
    select: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5e1',
      fontSize: '0.95rem',
      backgroundColor: 'white',
      cursor: 'pointer'
    },
    locationRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px'
    },
    cutSpecRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px'
    },
    volumeRow: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr',
      gap: '12px'
    },
    addBtn: {
      backgroundColor: '#1E3A5F',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 20px',
      cursor: 'pointer',
      fontSize: '0.95rem',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '16px'
    },
    saveBtn: {
      backgroundColor: '#D35F28',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '14px 28px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: '600',
      marginTop: '20px',
      width: '100%'
    },
    saveBtnDisabled: {
      backgroundColor: '#94a3b8',
      cursor: 'not-allowed'
    },
    savedIndicator: {
      backgroundColor: '#dcfce7',
      color: '#16a34a',
      padding: '10px 16px',
      borderRadius: '6px',
      textAlign: 'center',
      marginTop: '12px',
      fontWeight: '500'
    },
    errorMessage: {
      backgroundColor: '#fee2e2',
      color: '#dc2626',
      padding: '10px 16px',
      borderRadius: '6px',
      textAlign: 'center',
      marginTop: '12px'
    },
    notesField: {
      gridColumn: '1 / -1'
    },
    textarea: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #cbd5e1',
      fontSize: '0.95rem',
      minHeight: '60px',
      resize: 'vertical',
      fontFamily: 'inherit'
    },
    summaryBox: {
      backgroundColor: '#1E3A5F',
      color: 'white',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '16px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '16px'
    },
    summaryItem: {
      textAlign: 'center'
    },
    summaryLabel: {
      fontSize: '0.75rem',
      opacity: '0.8',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    },
    summaryValue: {
      fontSize: '1.5rem',
      fontWeight: '700',
      marginTop: '4px'
    }
  };

  // Calculate summary
  const totalVolume = decks.reduce((sum, d) => sum + (parseFloat(d.volume_estimate) || 0), 0);
  const totalDecks = decks.filter(d => d.deck_id).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>
          🪵 Timber Decking & Salvage Log
        </div>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
          TSP Compliance Tracking
        </span>
      </div>

      {decks.map((deck, index) => (
        <div key={deck.id || index} style={styles.deckCard}>
          <div style={styles.deckHeader}>
            <span style={styles.deckNumber}>Deck Entry #{index + 1}</span>
            {decks.length > 1 && (
              <button 
                style={styles.removeBtn}
                onClick={() => removeDeck(index)}
              >
                ✕ Remove
              </button>
            )}
          </div>

          <div style={styles.formGrid}>
            {/* Deck ID */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Deck ID *</label>
              <input
                type="text"
                style={styles.input}
                placeholder="e.g., D-004"
                value={deck.deck_id}
                onChange={(e) => updateDeck(index, 'deck_id', e.target.value)}
              />
            </div>

            {/* Location - Start/End KP */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Location (KP)</label>
              <div style={styles.locationRow}>
                <input
                  type="number"
                  step="0.001"
                  style={styles.input}
                  placeholder="Start KP"
                  value={deck.start_kp}
                  onChange={(e) => updateDeck(index, 'start_kp', e.target.value)}
                />
                <input
                  type="number"
                  step="0.001"
                  style={styles.input}
                  placeholder="End KP"
                  value={deck.end_kp}
                  onChange={(e) => updateDeck(index, 'end_kp', e.target.value)}
                />
              </div>
            </div>

            {/* Owner/Status */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Owner/Status</label>
              <select
                style={styles.select}
                value={deck.owner_status}
                onChange={(e) => updateDeck(index, 'owner_status', e.target.value)}
              >
                {OWNER_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Species Sort */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Species Sort</label>
              <select
                style={styles.select}
                value={deck.species_sort}
                onChange={(e) => updateDeck(index, 'species_sort', e.target.value)}
              >
                {SPECIES_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Condition</label>
              <select
                style={styles.select}
                value={deck.condition}
                onChange={(e) => updateDeck(index, 'condition', e.target.value)}
              >
                {CONDITION_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Disposal/Destination */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Disposal/Destination</label>
              <select
                style={styles.select}
                value={deck.disposal_destination}
                onChange={(e) => updateDeck(index, 'disposal_destination', e.target.value)}
              >
                {DISPOSAL_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Cut Specification */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Cut Specification</label>
              <div style={styles.cutSpecRow}>
                <select
                  style={styles.select}
                  value={deck.cut_specification}
                  onChange={(e) => updateDeck(index, 'cut_specification', e.target.value)}
                >
                  {CUT_SPEC_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <input
                  type="number"
                  style={styles.input}
                  placeholder="Min ⌀ (cm)"
                  value={deck.min_top_diameter_cm}
                  onChange={(e) => updateDeck(index, 'min_top_diameter_cm', e.target.value)}
                />
              </div>
            </div>

            {/* Volume Estimate */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Volume Estimate</label>
              <div style={styles.volumeRow}>
                <input
                  type="number"
                  step="0.1"
                  style={styles.input}
                  placeholder="Volume"
                  value={deck.volume_estimate}
                  onChange={(e) => updateDeck(index, 'volume_estimate', e.target.value)}
                />
                <select
                  style={styles.select}
                  value={deck.volume_unit}
                  onChange={(e) => updateDeck(index, 'volume_unit', e.target.value)}
                >
                  <option value="m³">m³</option>
                  <option value="pieces">Pieces</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ ...styles.fieldGroup, ...styles.notesField }}>
              <label style={styles.label}>Notes</label>
              <textarea
                style={styles.textarea}
                placeholder="Additional observations, issues, or comments..."
                value={deck.notes}
                onChange={(e) => updateDeck(index, 'notes', e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <button style={styles.addBtn} onClick={addDeck}>
        <span style={{ fontSize: '1.2rem' }}>+</span> Add Another Deck
      </button>

      {/* Summary Box */}
      {totalDecks > 0 && (
        <div style={styles.summaryBox}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Total Decks</div>
            <div style={styles.summaryValue}>{totalDecks}</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Total Volume</div>
            <div style={styles.summaryValue}>{totalVolume.toFixed(1)} m³</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Crown Land</div>
            <div style={styles.summaryValue}>
              {decks.filter(d => d.owner_status === 'Crown' && d.deck_id).length}
            </div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Private Land</div>
            <div style={styles.summaryValue}>
              {decks.filter(d => d.owner_status === 'Private (Freehold)' && d.deck_id).length}
            </div>
          </div>
        </div>
      )}

      <button
        style={{
          ...styles.saveBtn,
          ...(saving ? styles.saveBtnDisabled : {})
        }}
        onClick={saveDecks}
        disabled={saving}
      >
        {saving ? 'Saving...' : '💾 Save Timber Deck Log'}
      </button>

      {saved && (
        <div style={styles.savedIndicator}>
          ✓ Timber deck log saved successfully
        </div>
      )}

      {error && (
        <div style={styles.errorMessage}>
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default TimberDeckLog;
