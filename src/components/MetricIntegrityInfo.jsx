// MetricIntegrityInfo.jsx - Educational component explaining Goodhart's Law
// and the Data Reliability Score system for executives and project managers

import React, { useState } from 'react'

/**
 * Info Icon Button - triggers the modal
 */
export function MetricInfoIcon({ onClick, size = 18, color = '#666' }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.05)'}
      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      title="Learn about Metric Integrity"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </button>
  )
}

/**
 * Main Modal Component
 */
export function MetricIntegrityModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        {/* Header */}
        <div style={{
          backgroundColor: '#1a237e',
          color: 'white',
          padding: '20px 25px',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
              Metric Integrity & Data Reliability
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              Understanding how we audit the Truth of Progress
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '25px' }}>

          {/* What is Goodhart's Law */}
          <section style={{ marginBottom: '25px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              color: '#1a237e',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>📚</span>
              What is Goodhart's Law?
            </h3>
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '15px 20px',
              borderRadius: '8px',
              borderLeft: '4px solid #1a237e'
            }}>
              <p style={{
                margin: 0,
                fontStyle: 'italic',
                color: '#333',
                fontSize: '15px',
                lineHeight: '1.6'
              }}>
                "When a measure becomes a target, it ceases to be a good measure."
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                — Charles Goodhart, British economist (1975)
              </p>
            </div>
            <p style={{ marginTop: '15px', fontSize: '14px', lineHeight: '1.7', color: '#444' }}>
              In construction, this manifests when contractors optimize for <strong>reporting metrics</strong> rather
              than <strong>actual productivity</strong>. A crew might log full hours of "active" work while actual
              pipe-in-ground progress tells a different story.
            </p>
          </section>

          {/* Why It Matters */}
          <section style={{ marginBottom: '25px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              color: '#dc3545',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              Why It Matters for This Project
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px'
            }}>
              <div style={{
                backgroundColor: '#fff3cd',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #ffeeba'
              }}>
                <strong style={{ color: '#856404', fontSize: '13px' }}>Time ≠ Progress</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                  Billed hours don't guarantee linear metres installed. We triangulate time against physical output.
                </p>
              </div>
              <div style={{
                backgroundColor: '#f8d7da',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #f5c6cb'
              }}>
                <strong style={{ color: '#721c24', fontSize: '13px' }}>Hidden Value Loss</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                  Without verification, management drag and inefficiency can hide in "busy" reports.
                </p>
              </div>
              <div style={{
                backgroundColor: '#d4edda',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #c3e6cb'
              }}>
                <strong style={{ color: '#155724', fontSize: '13px' }}>True Cost of Completion</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
                  Our system reveals the actual cost including rework and drag, not just what's invoiced.
                </p>
              </div>
            </div>
          </section>

          {/* The Triangulation Method */}
          <section style={{ marginBottom: '25px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              color: '#6f42c1',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>🔺</span>
              Our Triangulation Method
            </h3>
            <p style={{ fontSize: '14px', color: '#444', marginBottom: '15px' }}>
              We cross-reference three independent data points to verify metric integrity:
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '15px'
            }}>
              <div style={{
                padding: '20px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏱️</div>
                <strong style={{ color: '#1565c0', fontSize: '13px' }}>Time Integrity</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Shadow Hours vs. Billed Hours
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#1565c0', fontWeight: 'bold' }}>
                  Inertia Ratio (I<sub>R</sub>)
                </p>
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#e8f5e9',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📏</div>
                <strong style={{ color: '#2e7d32', fontSize: '13px' }}>Physical Progress</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Linear Metres Achieved
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#2e7d32', fontWeight: 'bold' }}>
                  Start KP → End KP
                </p>
              </div>
              <div style={{
                padding: '20px',
                backgroundColor: '#fce4ec',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✓</div>
                <strong style={{ color: '#c2185b', fontSize: '13px' }}>Quality Rate</strong>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Pass Rate & Rework
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#c2185b', fontWeight: 'bold' }}>
                  Q<sub>R</sub> &gt; 90% Target
                </p>
              </div>
            </div>
          </section>

          {/* Reliability Score Legend */}
          <section style={{ marginBottom: '25px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              color: '#333',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              Data Reliability Score Legend
            </h3>
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {/* Green */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px 20px',
                backgroundColor: '#d4edda',
                borderBottom: '1px solid #c3e6cb'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  backgroundColor: '#28a745',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '15px'
                }}>
                  <span style={{ fontSize: '24px' }}>🛡️</span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#155724', fontSize: '14px' }}>GREEN - Reliable</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#155724' }}>
                    Metrics align with physical progress. Time, output, and quality are consistent.
                    <br />
                    <span style={{ fontStyle: 'italic' }}>Action: Proceed with confidence in reported data.</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right', color: '#155724' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>80-100%</div>
                  <div style={{ fontSize: '10px' }}>Score Range</div>
                </div>
              </div>

              {/* Amber */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px 20px',
                backgroundColor: '#fff3cd',
                borderBottom: '1px solid #ffeeba'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  backgroundColor: '#ffc107',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '15px'
                }}>
                  <span style={{ fontSize: '24px' }}>⚠️</span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#856404', fontSize: '14px' }}>AMBER - Review Needed</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#856404' }}>
                    High activity reported but low physical progress. Possible "Activity without Productivity."
                    <br />
                    <span style={{ fontStyle: 'italic' }}>Action: Request verification from field supervisor.</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right', color: '#856404' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>50-79%</div>
                  <div style={{ fontSize: '10px' }}>Score Range</div>
                </div>
              </div>

              {/* Red */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px 20px',
                backgroundColor: '#f8d7da'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  backgroundColor: '#dc3545',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '15px'
                }}>
                  <span style={{ fontSize: '24px' }}>🚨</span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#721c24', fontSize: '14px' }}>RED - Alert</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#721c24' }}>
                    Systemic mismatch detected. High rework rates or metrics fundamentally misaligned.
                    <br />
                    <span style={{ fontStyle: 'italic' }}>Action: Immediate investigation required. Escalate to PM.</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right', color: '#721c24' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>&lt;50%</div>
                  <div style={{ fontSize: '10px' }}>Score Range</div>
                </div>
              </div>
            </div>
          </section>

          {/* Key Metrics Explained */}
          <section style={{ marginBottom: '15px' }}>
            <h3 style={{
              margin: '0 0 12px 0',
              color: '#333',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>📊</span>
              Key Metrics Explained
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Metric</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Formula</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>What It Tells You</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    <strong>Inertia Ratio (I<sub>R</sub>)</strong>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '12px' }}>
                    Shadow Hours / Billed Hours × 100
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    Percentage of paid time that was productive
                  </td>
                </tr>
                <tr style={{ backgroundColor: '#fafafa' }}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    <strong>Value Lost</strong>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '12px' }}>
                    (Billed - Shadow) × Burn Rate
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    Dollar value of time lost to delays/drag
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    <strong>True Cost</strong>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6', fontFamily: 'monospace', fontSize: '12px' }}>
                    Value Lost + Rework Cost
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    Total impact including quality failures
                  </td>
                </tr>
                <tr style={{ backgroundColor: '#fafafa' }}>
                  <td style={{ padding: '12px' }}>
                    <strong>VAAC</strong>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                    Actual Cost - Value Lost
                  </td>
                  <td style={{ padding: '12px' }}>
                    What the project <em>should</em> have cost
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Footer */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#e8eaf6',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#3f51b5' }}>
              <strong>We aren't just tracking time — we're auditing the Truth of Progress.</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Collapsible Card Version (alternative to modal)
 */
export function MetricIntegrityCard({ defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '20px',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '15px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#1a237e',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>📖</span>
          <div>
            <strong style={{ fontSize: '14px' }}>Metric Integrity Guide</strong>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', opacity: 0.8 }}>
              Understanding Goodhart's Law & Data Reliability
            </p>
          </div>
        </div>
        <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '20px' }}>
          {/* Simplified content for card view */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#1a237e' }}>What is Goodhart's Law?</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#444', lineHeight: '1.6' }}>
              <em>"When a measure becomes a target, it ceases to be a good measure."</em>
              <br /><br />
              We prevent metric gaming by triangulating <strong>Time</strong>, <strong>Physical Progress</strong>, and <strong>Quality</strong>.
            </p>
          </div>

          {/* Quick Legend */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#d4edda', borderRadius: '20px' }}>
              <span>🛡️</span>
              <span style={{ fontSize: '12px', color: '#155724', fontWeight: 'bold' }}>Green = Reliable</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#fff3cd', borderRadius: '20px' }}>
              <span>⚠️</span>
              <span style={{ fontSize: '12px', color: '#856404', fontWeight: 'bold' }}>Amber = Review</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#f8d7da', borderRadius: '20px' }}>
              <span>🚨</span>
              <span style={{ fontSize: '12px', color: '#721c24', fontWeight: 'bold' }}>Red = Alert</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Hook to manage modal state
 */
export function useMetricIntegrityModal() {
  const [isOpen, setIsOpen] = useState(false)
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev)
  }
}

export default MetricIntegrityModal
