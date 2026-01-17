// ============================================================================
// CHUNK 5: ADD INVITE USER TO ADMIN PORTAL
// Follow these steps to add the invitation feature
// ============================================================================

// STEP 1: Add import at top of AdminPortal.jsx
import InviteUser from './InviteUser.jsx'

// STEP 2: Add state for modal
const [showInviteModal, setShowInviteModal] = useState(false)

// STEP 3: Add button in the header (near other buttons)
<button 
  onClick={() => setShowInviteModal(true)} 
  style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
>
  📧 Invite User
</button>

// STEP 4: Add modal at the end of the component (before final closing </div>)
{showInviteModal && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  }}>
    <InviteUser 
      onSuccess={() => {
        setShowInviteModal(false)
        fetchData() // Refresh user list
      }}
      onCancel={() => setShowInviteModal(false)}
    />
  </div>
)}
