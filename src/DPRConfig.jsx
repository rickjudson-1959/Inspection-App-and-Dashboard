import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useOrg } from './contexts/OrgContext';

// Default pipeline activity types (admin can customize per project)
const DEFAULT_ACTIVITIES = [
  { key: 'clearing', label: 'Clearing', sort_order: 1 },
  { key: 'access', label: 'Access', sort_order: 2 },
  { key: 'hydrovac', label: 'Hydrovac / Foreign Lines', sort_order: 3 },
  { key: 'topsoil', label: 'Topsoil', sort_order: 4 },
  { key: 'grade', label: 'Grade', sort_order: 5 },
  { key: 'stringing', label: 'Stringing', sort_order: 6 },
  { key: 'bending', label: 'Bending', sort_order: 7 },
  { key: 'welding_mainline', label: 'Weld - Mainline', sort_order: 8 },
  { key: 'coating_mainline', label: 'Coat - Mainline', sort_order: 9 },
  { key: 'ditch', label: 'Ditch', sort_order: 10 },
  { key: 'lower_in', label: 'Lower-In', sort_order: 11 },
  { key: 'backfill_mainline', label: 'Backfill - Mainline', sort_order: 12 },
  { key: 'tie_ins', label: 'Tie-Ins - Mainline', sort_order: 13 },
  { key: 'backfill_tie_ins', label: 'Backfill - Tie-Ins', sort_order: 14 },
  { key: 'hydrostatic_testing', label: 'Hydrostatic Testing', sort_order: 15 },
  { key: 'cleanup_machine', label: 'Clean-Up (Machine)', sort_order: 16 },
  { key: 'cleanup_final', label: 'Clean-Up (Final)', sort_order: 17 },
];

const DEFAULT_SUPPLEMENTARY = [
  { key: 'road_bores', label: 'Road Bores', total_count: 0 },
  { key: 'valve_install', label: 'Valve Installation', total_count: 0 },
];

// Map inspector report activity types → DPR activity keys
// Admin can override these in the UI, but these are sensible defaults
const ACTIVITY_TYPE_MAP = {
  'Clearing': 'clearing',
  'Access': 'access',
  'Topsoil': 'topsoil',
  'Grading': 'grade',
  'Stringing': 'stringing',
  'Bending': 'bending',
  'Welding - Mainline': 'welding_mainline',
  'Welding - Section Crew': 'welding_mainline',
  'Welding - Poor Boy': 'welding_mainline',
  'Welding - Tie-in': 'tie_ins',
  'Coating': 'coating_mainline',
  'Tie-in Coating': 'tie_ins',
  'Ditch': 'ditch',
  'Lower-in': 'lower_in',
  'Backfill': 'backfill_mainline',
  'Tie-in Backfill': 'backfill_tie_ins',
  'Cleanup - Machine': 'cleanup_machine',
  'Cleanup - Final': 'cleanup_final',
  'Hydrostatic Testing': 'hydrostatic_testing',
  'HDD': 'road_bores',
  'HD Bores': 'road_bores',
  'Piling': 'piling',
  'Equipment Cleaning': 'equipment_cleaning',
  'Hydrovac': 'hydrovac',
  'Welder Testing': 'welder_testing',
  'Frost Packing': 'frost_packing',
  'Pipe Yard': 'pipe_yard',
  'Other': 'other',
};

export { ACTIVITY_TYPE_MAP };

export default function DPRConfig() {
  const { organizationId } = useOrg();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [pipelineLength, setPipelineLength] = useState('');
  const [activities, setActivities] = useState(DEFAULT_ACTIVITIES);
  const [supplementary, setSupplementary] = useState(DEFAULT_SUPPLEMENTARY);
  const [distributionEmails, setDistributionEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [preparedBy, setPreparedBy] = useState('');

  // New activity form
  const [newActivityKey, setNewActivityKey] = useState('');
  const [newActivityLabel, setNewActivityLabel] = useState('');

  const loadConfig = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('dpr_config')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (data) {
      setConfig(data);
      setProjectName(data.project_name || '');
      setContractorName(data.contractor_name || '');
      setPipelineLength(data.pipeline_length_metres?.toString() || '');
      setActivities(data.activities?.length ? data.activities : DEFAULT_ACTIVITIES);
      setSupplementary(data.supplementary_sections?.length ? data.supplementary_sections : DEFAULT_SUPPLEMENTARY);
      setDistributionEmails(data.distribution_emails || []);
      setPreparedBy(data.prepared_by_default || '');
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    setSaved(false);

    const payload = {
      organization_id: organizationId,
      project_name: projectName,
      contractor_name: contractorName,
      pipeline_length_metres: parseFloat(pipelineLength) || 0,
      activities: activities,
      supplementary_sections: supplementary,
      distribution_emails: distributionEmails,
      prepared_by_default: preparedBy,
    };

    let error;
    if (config?.id) {
      ({ error } = await supabase.from('dpr_config').update(payload).eq('id', config.id));
    } else {
      ({ error } = await supabase.from('dpr_config').insert(payload));
    }

    if (error) {
      console.error('DPR config save error:', error);
      alert('Error saving DPR config: ' + error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      loadConfig();
    }
    setSaving(false);
  };

  // Activity management
  const addActivity = () => {
    if (!newActivityKey.trim() || !newActivityLabel.trim()) return;
    const key = newActivityKey.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (activities.find(a => a.key === key)) {
      alert('Activity key already exists');
      return;
    }
    setActivities([...activities, { key, label: newActivityLabel.trim(), sort_order: activities.length + 1 }]);
    setNewActivityKey('');
    setNewActivityLabel('');
  };

  const removeActivity = (key) => {
    setActivities(activities.filter(a => a.key !== key).map((a, i) => ({ ...a, sort_order: i + 1 })));
  };

  const moveActivity = (index, direction) => {
    const newList = [...activities];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    [newList[index], newList[swapIndex]] = [newList[swapIndex], newList[index]];
    setActivities(newList.map((a, i) => ({ ...a, sort_order: i + 1 })));
  };

  const updateActivityLabel = (key, label) => {
    setActivities(activities.map(a => a.key === key ? { ...a, label } : a));
  };

  // Supplementary section management
  const addSupplementary = () => {
    const key = `custom_${Date.now()}`;
    setSupplementary([...supplementary, { key, label: 'New Section', total_count: 0 }]);
  };

  const updateSupplementary = (index, field, value) => {
    const updated = [...supplementary];
    updated[index] = { ...updated[index], [field]: field === 'total_count' ? parseInt(value) || 0 : value };
    setSupplementary(updated);
  };

  const removeSupplementary = (index) => {
    setSupplementary(supplementary.filter((_, i) => i !== index));
  };

  // Email management
  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (distributionEmails.includes(email)) return;
    setDistributionEmails([...distributionEmails, email]);
    setNewEmail('');
  };

  const removeEmail = (email) => {
    setDistributionEmails(distributionEmails.filter(e => e !== email));
  };

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Loading DPR configuration...</div>;

  const sectionStyle = {
    marginBottom: 24,
    padding: 16,
    border: '1px solid #ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    color: '#444',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box',
  };

  const smallBtnStyle = {
    padding: '4px 10px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
    backgroundColor: '#fff',
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Daily Progress Report Configuration</h3>

      {/* Project Details */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Project Details</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Project Name</label>
            <input style={inputStyle} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Foster Creek Mainline Loop (CLX 2)" />
          </div>
          <div>
            <label style={labelStyle}>Contractor</label>
            <input style={inputStyle} value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="e.g. Somerville-Aecon JV" />
          </div>
          <div>
            <label style={labelStyle}>Pipeline Length (metres)</label>
            <input style={inputStyle} type="number" value={pipelineLength} onChange={e => setPipelineLength(e.target.value)} placeholder="e.g. 76300" />
          </div>
          <div>
            <label style={labelStyle}>Prepared By (default)</label>
            <input style={inputStyle} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="e.g. Dave Larden" />
          </div>
        </div>
      </div>

      {/* Activities */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Tracked Activities</h4>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          These are the activity rows on the DPR. Order them as they should appear on the report.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activities.map((activity, index) => (
            <div key={activity.key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 4,
            }}>
              <span style={{ fontSize: 12, color: '#999', width: 24, textAlign: 'center' }}>{index + 1}</span>
              <input
                style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 13 }}
                value={activity.label}
                onChange={e => updateActivityLabel(activity.key, e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#aaa', minWidth: 80 }}>{activity.key}</span>
              <button style={smallBtnStyle} onClick={() => moveActivity(index, -1)} disabled={index === 0}>▲</button>
              <button style={smallBtnStyle} onClick={() => moveActivity(index, 1)} disabled={index === activities.length - 1}>▼</button>
              <button style={{ ...smallBtnStyle, color: '#c00', borderColor: '#c00' }} onClick={() => removeActivity(activity.key)}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, width: 140, padding: '6px 8px', fontSize: 13 }}
            placeholder="key (e.g. caliper_pig)"
            value={newActivityKey}
            onChange={e => setNewActivityKey(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }}
            placeholder="Display Label (e.g. Caliper Pig)"
            value={newActivityLabel}
            onChange={e => setNewActivityLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addActivity()}
          />
          <button style={{ ...smallBtnStyle, backgroundColor: '#e8f5e9', borderColor: '#4caf50', color: '#2e7d32' }} onClick={addActivity}>
            + Add
          </button>
        </div>
      </div>

      {/* Supplementary Sections */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Supplementary Sections</h4>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          Additional tracking sections (e.g. Road Bores, Valve Installation). Set the total planned count for % complete.
        </p>
        {supplementary.map((section, index) => (
          <div key={section.key} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            padding: '6px 8px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 4,
          }}>
            <input
              style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 13 }}
              value={section.label}
              onChange={e => updateSupplementary(index, 'label', e.target.value)}
            />
            <label style={{ fontSize: 12, color: '#666' }}>Total planned:</label>
            <input
              style={{ ...inputStyle, width: 70, padding: '4px 8px', fontSize: 13, textAlign: 'center' }}
              type="number"
              value={section.total_count}
              onChange={e => updateSupplementary(index, 'total_count', e.target.value)}
            />
            <button style={{ ...smallBtnStyle, color: '#c00', borderColor: '#c00' }} onClick={() => removeSupplementary(index)}>✕</button>
          </div>
        ))}
        <button style={{ ...smallBtnStyle, marginTop: 6, backgroundColor: '#e8f5e9', borderColor: '#4caf50', color: '#2e7d32' }} onClick={addSupplementary}>
          + Add Section
        </button>
      </div>

      {/* Distribution List */}
      <div style={sectionStyle}>
        <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Distribution List</h4>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          Email addresses that will receive the DPR when published.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {distributionEmails.map(email => (
            <span key={email} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', backgroundColor: '#e3f2fd', borderRadius: 20, fontSize: 13,
            }}>
              {email}
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0, lineHeight: 1 }}
                onClick={() => removeEmail(email)}
              >✕</button>
            </span>
          ))}
          {distributionEmails.length === 0 && (
            <span style={{ fontSize: 13, color: '#999' }}>No recipients added yet</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }}
            placeholder="email@example.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
          />
          <button style={{ ...smallBtnStyle, backgroundColor: '#e8f5e9', borderColor: '#4caf50', color: '#2e7d32' }} onClick={addEmail}>
            + Add
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{
            padding: '10px 28px', fontSize: 15, fontWeight: 600,
            backgroundColor: saving ? '#ccc' : '#1976d2', color: '#fff',
            border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer',
          }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save DPR Configuration'}
        </button>
        {saved && <span style={{ color: '#2e7d32', fontSize: 14, fontWeight: 500 }}>✓ Saved</span>}
      </div>
    </div>
  );
}
