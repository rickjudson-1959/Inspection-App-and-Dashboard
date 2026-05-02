import React from 'react'

// Class-based ErrorBoundary so we can catch render-time and effect-time errors
// in the InspectorReport tree. The default white-screen behavior in production
// hides minified TDZ stacks; this surfaces the full error + stack inline so we
// can pinpoint which source line is failing.
export default class ReportErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ReportErrorBoundary] caught render error:', error)
    console.error('[ReportErrorBoundary] component stack:', info?.componentStack)
    this.setState({ info })
  }

  reset = () => {
    this.setState({ error: null, info: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    const e = this.state.error
    const stack = e?.stack || String(e)
    const compStack = this.state.info?.componentStack || ''

    return (
      <div style={{
        maxWidth: '900px',
        margin: '40px auto',
        padding: '24px',
        background: '#fff5f5',
        border: '2px solid #dc3545',
        borderRadius: '8px',
        fontFamily: 'monospace',
        color: '#333'
      }}>
        <h2 style={{ marginTop: 0, color: '#dc3545' }}>
          Inspector Report failed to render
        </h2>
        <p style={{ fontSize: '13px', color: '#666' }}>
          The error below has been printed to the browser console. Copy this
          panel and paste it into your bug report so the team can locate the
          exact source line.
        </p>
        <div style={{
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '12px',
          margin: '12px 0',
          fontSize: '13px',
          fontWeight: 'bold',
          color: '#dc3545'
        }}>
          {e?.name || 'Error'}: {e?.message || String(e)}
        </div>
        <details open style={{ marginBottom: '12px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            Stack trace
          </summary>
          <pre style={{
            background: '#fafafa',
            border: '1px solid #ddd',
            padding: '12px',
            fontSize: '11px',
            lineHeight: '1.4',
            overflow: 'auto',
            maxHeight: '300px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>{stack}</pre>
        </details>
        {compStack && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
              Component stack
            </summary>
            <pre style={{
              background: '#fafafa',
              border: '1px solid #ddd',
              padding: '12px',
              fontSize: '11px',
              lineHeight: '1.4',
              overflow: 'auto',
              maxHeight: '300px',
              whiteSpace: 'pre-wrap'
            }}>{compStack}</pre>
          </details>
        )}
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          <button
            onClick={this.reset}
            style={{
              padding: '8px 16px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
