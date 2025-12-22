import React, { useState, useEffect } from 'react';
import { ClearingQualityChecks, ClearingDefaultValues, ClearingRequiredFields } from './ClearingQualityChecks';
import TimberDeckLog from './TimberDeckLog';

/**
 * ClearingInspectionForm Component
 * Comprehensive clearing inspection form based on API 1169 inspector responsibilities
 */

const ClearingInspectionForm = ({ dailyReportId, projectId, initialData, onSave }) => {
  const [formData, setFormData] = useState(ClearingDefaultValues);
  const [expandedSections, setExpandedSections] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Load initial data if provided
  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({ ...prev, ...initialData }));
    }
    // Expand all sections by default
    const expanded = {};
    ClearingQualityChecks.forEach((section, idx) => {
      expanded[idx] = true;
    });
    setExpandedSections(expanded);
  }, [initialData]);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when field is updated
    if (errors[name]) {
      setErrors(prev => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const toggleSection = (index) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    ClearingRequiredFields.forEach(fieldName => {
      if (!formData[fieldName]) {
        newErrors[fieldName] = 'Required';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      // Expand sections with errors
      const sectionsWithErrors = {};
      ClearingQualityChecks.forEach((section, idx) => {
        const hasError = section.fields.some(f => errors[f.name]);
        if (hasError) sectionsWithErrors[idx] = true;
      });
      setExpandedSections(prev => ({ ...prev, ...sectionsWithErrors }));
      return;
    }

    setSaving(true);
    try {
      if (onSave) {
        await onSave(formData);
      }
    } catch (err) {
      console.error('Error saving:', err);
    } finally {
      setSaving(false);
    }
  };

  // Calculate completion percentage
  const totalFields = ClearingRequiredFields.length;
  const completedFields = ClearingRequiredFields.filter(f => formData[f]).length;
  const completionPercent = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  // Styles
  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: '100%',
      margin: '0 auto'
    },
    header: {
      backgroundColor: '#1E3A5F',
      color: 'white',
      padding: '20px 24px',
      borderRadius: '12px 12px 0 0',
      marginBottom: '0'
    },
    headerTitle: {
      fontSize: '1.5rem',
      fontWeight: '700',
      margin: '0 0 8px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    headerSubtitle: {
      fontSize: '0.9rem',
      opacity: '0.85',
      margin: '0'
    },
    progressBar: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: '10px',
      height: '8px',
      marginTop: '16px',
      overflow: 'hidden'
    },
    progressFill: {
      backgroundColor: '#D35F28',
      height: '100%',
      borderRadius: '10px',
      transition: 'width 0.3s ease'
    },
    progressText: {
      fontSize: '0.8rem',
      marginTop: '6px',
      opacity: '0.9'
    },
    sectionsContainer: {
      backgroundColor: '#f8fafc',
      borderRadius: '0 0 12px 12px',
      padding: '16px',
      border: '1px solid #e2e8f0',
      borderTop: 'none'
    },
    section: {
      backgroundColor: 'white',
      borderRadius: '10px',
      marginBottom: '12px',
      border: '1px solid #e2e8f0',
      overflow: 'hidden'
    },
    sectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      cursor: 'pointer',
      backgroundColor: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      transition: 'background-color 0.2s'
    },
    sectionTitle: {
      fontSize: '1rem',
      fontWeight: '600',
      color: '#1E3A5F',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    sectionBadge: {
      backgroundColor: '#e2e8f0',
      color: '#475569',
      fontSize: '0.75rem',
      padding: '2px 8px',
      borderRadius: '10px',
      fontWeight: '500'
    },
    sectionBadgeComplete: {
      backgroundColor: '#dcfce7',
      color: '#16a34a'
    },
    sectionBadgeError: {
      backgroundColor: '#fee2e2',
      color: '#dc2626'
    },
    expandIcon: {
      fontSize: '1.2rem',
      color: '#64748b',
      transition: 'transform 0.2s'
    },
    sectionContent: {
      padding: '20px'
    },
    fieldGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px'
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    },
    fieldGroupTextarea: {
      gridColumn: '1 / -1'
    },
    label: {
      fontSize: '0.85rem',
      fontWeight: '600',
      color: '#374151',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    },
    required: {
      color: '#dc2626'
    },
    tooltip: {
      fontSize: '0.75rem',
      color: '#64748b',
      fontWeight: '400',
      marginLeft: '4px'
    },
    input: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #d1d5db',
      fontSize: '0.95rem',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      width: '100%',
      boxSizing: 'border-box'
    },
    inputError: {
      borderColor: '#dc2626',
      backgroundColor: '#fef2f2'
    },
    inputFocus: {
      outline: 'none',
      borderColor: '#1E3A5F',
      boxShadow: '0 0 0 3px rgba(30, 58, 95, 0.1)'
    },
    select: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #d1d5db',
      fontSize: '0.95rem',
      backgroundColor: 'white',
      cursor: 'pointer',
      width: '100%',
      boxSizing: 'border-box'
    },
    textarea: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #d1d5db',
      fontSize: '0.95rem',
      minHeight: '100px',
      resize: 'vertical',
      fontFamily: 'inherit',
      width: '100%',
      boxSizing: 'border-box'
    },
    errorText: {
      fontSize: '0.75rem',
      color: '#dc2626',
      marginTop: '2px'
    },
    saveButton: {
      backgroundColor: '#D35F28',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '16px 32px',
      fontSize: '1rem',
      fontWeight: '600',
      cursor: 'pointer',
      width: '100%',
      marginTop: '20px',
      transition: 'background-color 0.2s'
    },
    saveButtonDisabled: {
      backgroundColor: '#94a3b8',
      cursor: 'not-allowed'
    },
    timberSection: {
      marginTop: '24px'
    }
  };

  // Get section completion status
  const getSectionStatus = (section) => {
    const requiredInSection = section.fields.filter(f => f.required);
    const completedInSection = requiredInSection.filter(f => formData[f.name]);
    const hasErrors = section.fields.some(f => errors[f.name]);
    
    if (hasErrors) return 'error';
    if (requiredInSection.length === 0) return 'optional';
    if (completedInSection.length === requiredInSection.length) return 'complete';
    if (completedInSection.length > 0) return 'partial';
    return 'empty';
  };

  const renderField = (field) => {
    const hasError = errors[field.name];
    
    return (
      <div 
        key={field.name} 
        style={{
          ...styles.fieldGroup,
          ...(field.type === 'textarea' ? styles.fieldGroupTextarea : {})
        }}
      >
        <label style={styles.label}>
          {field.label}
          {field.required && <span style={styles.required}>*</span>}
          {field.tooltip && <span style={styles.tooltip}>({field.tooltip})</span>}
        </label>
        
        {field.type === 'select' ? (
          <select
            style={{
              ...styles.select,
              ...(hasError ? styles.inputError : {})
            }}
            value={formData[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
          >
            <option value="">-- Select --</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            style={{
              ...styles.textarea,
              ...(hasError ? styles.inputError : {})
            }}
            placeholder={field.placeholder || ''}
            value={formData[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
          />
        ) : (
          <input
            type={field.type || 'text'}
            style={{
              ...styles.input,
              ...(hasError ? styles.inputError : {})
            }}
            placeholder={field.placeholder || ''}
            value={formData[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
          />
        )}
        
        {hasError && <span style={styles.errorText}>{errors[field.name]}</span>}
      </div>
    );
  };

  const getSectionIcon = (sectionName) => {
    const icons = {
      'Right-of-Way & Boundaries': '📐',
      'Pre-Clearing Approvals & Compliance': '📋',
      'Environmental Compliance': '🌿',
      'Buried Facilities & Utilities': '⚡',
      'Overhead Power Lines': '🔌',
      'Timber Salvage': '🪵',
      'Grubbing & Stripping': '🚜',
      'Watercourse Crossings': '🌊',
      'Temporary Fencing': '🚧',
      'General Observations': '📝'
    };
    return icons[sectionName] || '📌';
  };

  return (
    <div style={styles.container}>
      {/* Header with Progress */}
      <div style={styles.header}>
        <h2 style={styles.headerTitle}>
          🌲 Clearing Inspection Checklist
        </h2>
        <p style={styles.headerSubtitle}>
          API 1169 Compliant • TSP Tracking • Environmental Compliance
        </p>
        <div style={styles.progressBar}>
          <div 
            style={{
              ...styles.progressFill,
              width: `${completionPercent}%`
            }}
          />
        </div>
        <p style={styles.progressText}>
          {completionPercent}% Complete ({completedFields}/{totalFields} required fields)
        </p>
      </div>

      {/* Sections */}
      <div style={styles.sectionsContainer}>
        {ClearingQualityChecks.map((section, index) => {
          const status = getSectionStatus(section);
          const isExpanded = expandedSections[index];
          
          return (
            <div key={index} style={styles.section}>
              <div 
                style={styles.sectionHeader}
                onClick={() => toggleSection(index)}
              >
                <div style={styles.sectionTitle}>
                  <span>{getSectionIcon(section.section)}</span>
                  {section.section}
                  <span style={{
                    ...styles.sectionBadge,
                    ...(status === 'complete' ? styles.sectionBadgeComplete : {}),
                    ...(status === 'error' ? styles.sectionBadgeError : {})
                  }}>
                    {status === 'complete' ? '✓ Complete' : 
                     status === 'error' ? 'Needs Attention' :
                     status === 'partial' ? 'In Progress' :
                     status === 'optional' ? 'Optional' : 'Not Started'}
                  </span>
                </div>
                <span style={{
                  ...styles.expandIcon,
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                }}>
                  ▼
                </span>
              </div>
              
              {isExpanded && (
                <div style={styles.sectionContent}>
                  <div style={styles.fieldGrid}>
                    {section.fields.map(field => renderField(field))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Timber Deck Log - Show if timber decks were created */}
        {formData.timberDecksCreated === 'Yes' && (
          <div style={styles.timberSection}>
            <TimberDeckLog 
              dailyReportId={dailyReportId}
              projectId={projectId}
              onUpdate={(decks) => console.log('Timber decks updated:', decks)}
            />
          </div>
        )}

        {/* Save Button */}
        <button
          style={{
            ...styles.saveButton,
            ...(saving ? styles.saveButtonDisabled : {})
          }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save Clearing Inspection'}
        </button>
      </div>
    </div>
  );
};

export default ClearingInspectionForm;
