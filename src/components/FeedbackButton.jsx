import { useState } from 'react'
import { supabase } from '../supabase'

export default function FeedbackButton({ pageName, userProfile, organizationId }) {
  const [showModal, setShowModal] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!feedbackText.trim()) return
    setSubmitting(true)

    try {
      // Save to database
      await supabase.from('user_feedback').insert({
        organization_id: organizationId || null,
        user_id: userProfile?.id || null,
        user_name: userProfile?.full_name || userProfile?.email || 'Unknown',
        user_email: userProfile?.email || null,
        user_role: userProfile?.role || null,
        page: pageName,
        feedback_text: feedbackText.trim()
      })

      // Send email notification
      try {
        await fetch('/api/send-feedback-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: userProfile?.full_name || userProfile?.email || 'Unknown',
            userEmail: userProfile?.email || '',
            userRole: userProfile?.role || '',
            page: pageName,
            feedbackText: feedbackText.trim()
          })
        })
      } catch (emailErr) {
        console.warn('Feedback email failed (saved to DB):', emailErr)
      }

      setSubmitted(true)
      setFeedbackText('')
      setTimeout(() => {
        setShowModal(false)
        setSubmitted(false)
      }, 2000)
    } catch (err) {
      console.error('Feedback submit error:', err)
      alert('Failed to submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div style={{ textAlign: 'center', padding: '20px 0', marginTop: '10px' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: '13px',
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: '8px 16px'
          }}
        >
          Send Feedback
        </button>
      </div>

      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 10002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #003366 0%, #1E3A5F 100%)',
              color: 'white'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>Send Feedback</div>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                Help us improve Pipe-Up
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              {submitted ? (
                <div style={{
                  textAlign: 'center',
                  padding: '30px 0',
                  color: '#155724',
                  fontSize: '15px',
                  fontWeight: 'bold'
                }}>
                  Thank you for your feedback!
                </div>
              ) : (
                <>
                  <textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="Tell us what's working, what's not, or what you'd like to see..."
                    rows={5}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setShowModal(false); setFeedbackText('') }}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!feedbackText.trim() || submitting}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: feedbackText.trim() && !submitting ? '#003366' : '#9ca3af',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: feedbackText.trim() && !submitting ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {submitting ? 'Sending...' : 'Submit'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
