// ============================================================================
// CHUNK 4: NAVIGATION BUTTONS - Add to Each Dashboard Header
// Copy/paste these snippets into your existing dashboard components
// ============================================================================

// -----------------------------------------------------------------------------
// 1. DASHBOARD.JSX (CMT Dashboard) - Add to header buttons section
// Find the header div and add these buttons:
// -----------------------------------------------------------------------------

// Add this import at the top:
import { useNavigate } from 'react-router-dom'
import MasterSwitcher from './MasterSwitcher.jsx'

// Inside the component, add:
const navigate = useNavigate()

// In the header buttons area, add these:
{/* Role Navigation Buttons */}
<MasterSwitcher compact />
<button
  onClick={() => navigate('/evm-dashboard')}
  style={{ padding: '10px 16px', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
>
  💰 View Financials (EVM)
</button>
<button
  onClick={() => navigate('/chief-dashboard')}
  style={{ padding: '10px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
>
  👔 Chief Dashboard
</button>


// -----------------------------------------------------------------------------
// 2. CHIEFDASHBOARD.JSX - Add to header buttons section
// -----------------------------------------------------------------------------

// Add this import at the top:
import MasterSwitcher from './MasterSwitcher.jsx'

// In the header buttons area, replace existing buttons with:
<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
  <MasterSwitcher compact />
  <button 
    onClick={() => navigate('/cmt-dashboard')} 
    style={{ padding: '10px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
  >
    📊 View CMT Stats
  </button>
  <button 
    onClick={() => navigate('/ndt-auditor')} 
    style={{ padding: '10px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
  >
    🔬 NDT Queue
  </button>
  <button 
    onClick={() => navigate('/field-entry')} 
    style={{ padding: '10px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
  >
    + New Report
  </button>
  <button 
    onClick={signOut} 
    style={{ padding: '10px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
  >
    Sign Out
  </button>
</div>


// -----------------------------------------------------------------------------
// 3. ASSISTANTCHIEFDASHBOARD.JSX - Add to header buttons section
// -----------------------------------------------------------------------------

// Add this import at the top:
import MasterSwitcher from './MasterSwitcher.jsx'

// In the header buttons area:
<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
  <MasterSwitcher compact />
  <button 
    onClick={() => navigate('/cmt-dashboard')} 
    style={{ padding: '10px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
  >
    📊 View CMT Stats
  </button>
  <button 
    onClick={() => navigate('/chief-dashboard')} 
    style={{ padding: '10px 16px', backgroundColor: '#1a5f2a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
  >
    👔 Chief Dashboard
  </button>
  <button 
    onClick={signOut} 
    style={{ padding: '10px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
  >
    Sign Out
  </button>
</div>


// -----------------------------------------------------------------------------
// 4. EVMDASHBOARD.JSX - Add navigation back to CMT
// -----------------------------------------------------------------------------

// Add this import at the top:
import { useNavigate } from 'react-router-dom'
import MasterSwitcher from './MasterSwitcher.jsx'

// Inside the component:
const navigate = useNavigate()

// In the header, add:
<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
  <MasterSwitcher compact />
  <button 
    onClick={() => navigate('/cmt-dashboard')} 
    style={{ padding: '10px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
  >
    📊 View Construction (CMT)
  </button>
</div>


// -----------------------------------------------------------------------------
// 5. ADMINPORTAL.JSX - Add MasterSwitcher
// -----------------------------------------------------------------------------

// Add this import at the top:
import MasterSwitcher from './MasterSwitcher.jsx'

// In the header, add alongside other buttons:
<MasterSwitcher compact />
