// HealthScoreIndicator.jsx - SVG circular ring showing report completeness
// Green (90-100), Amber (70-89), Red (0-69)
// Expandable issue list grouped by category

import React, { useState } from 'react'

const CATEGORY_LABELS = {
  photoCompleteness: 'Photo Completeness',
  directive050: 'Directive 050 Compliance',
  fieldCompleteness: 'Field Completeness',
  chainageIntegrity: 'Chainage Integrity',
  labourEquipment: 'Labour/Equipment Docs',
  mentorAlertResolution: 'Mentor Alert Resolution'
}

function getScoreColor(score) {
  if (score >= 90) return '#16a34a' // Green
  if (score >= 70) return '#ca8a04' // Amber
  return '#dc2626' // Red
}

function getScoreBg(score) {
  if (score >= 90) return '#f0fdf4'
  if (score >= 70) return '#fffbeb'
  return '#fef2f2'
}

function HealthScoreIndicator({ healthScore }) {
  const [expanded, setExpanded] = useState(false)

  if (!healthScore) return null

  const { score, details, passing, threshold } = healthScore
  const color = getScoreColor(score)
  const bg = getScoreBg(score)

  // SVG ring parameters
  const size = 80
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  // Collect all issues
  const allIssues = []
  for (const [key, cat] of Object.entries(details || {})) {
    if (cat.issues?.length > 0) {
      allIssues.push({ category: CATEGORY_LABELS[key] || key, issues: cat.issues })
    }
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: bg,
      border: `1px solid ${color}33`,
      borderRadius: '10px',
      marginBottom: '20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        cursor: allIssues.length > 0 ? 'pointer' : 'default'
      }}
        onClick={() => allIssues.length > 0 && setExpanded(!expanded)}
      >
        {/* SVG Ring */}
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Score ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          {/* Score text */}
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '18px',
              fontWeight: '700',
              fill: color
            }}
          >
            {Math.round(score)}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 12}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '10px',
              fill: '#6b7280'
            }}
          >
            / 100
          </text>
        </svg>

        {/* Score info */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '700',
            color: '#1f2937',
            marginBottom: '4px'
          }}>
            Report Health Score
          </div>

          {/* Category breakdown */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {Object.entries(details || {}).map(([key, cat]) => (
              <span key={key} style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: getScoreColor(cat.score) + '15',
                color: getScoreColor(cat.score),
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}>
                {CATEGORY_LABELS[key]?.split(' ')[0] || key}: {Math.round(cat.score)}%
              </span>
            ))}
          </div>

          {!passing && (
            <div style={{
              marginTop: '6px',
              fontSize: '12px',
              color: color,
              fontWeight: '600'
            }}>
              Below {threshold}% threshold - review before submitting
            </div>
          )}

          {allIssues.length > 0 && (
            <div style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#6b7280'
            }}>
              {expanded ? '▼' : '▶'} {allIssues.reduce((sum, g) => sum + g.issues.length, 0)} issue{allIssues.reduce((sum, g) => sum + g.issues.length, 0) !== 1 ? 's' : ''} found
            </div>
          )}
        </div>
      </div>

      {/* Expanded issue list */}
      {expanded && allIssues.length > 0 && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: `1px solid ${color}22`
        }}>
          {allIssues.map((group, idx) => (
            <div key={idx} style={{ marginBottom: idx < allIssues.length - 1 ? '10px' : 0 }}>
              <div style={{
                fontSize: '11px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#6b7280',
                marginBottom: '4px'
              }}>
                {group.category}
              </div>
              {group.issues.map((issue, issueIdx) => (
                <div key={issueIdx} style={{
                  fontSize: '12px',
                  color: '#4b5563',
                  padding: '3px 0 3px 12px',
                  borderLeft: `2px solid ${color}44`,
                  marginBottom: '2px',
                  lineHeight: '1.4'
                }}>
                  {issue}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HealthScoreIndicator
