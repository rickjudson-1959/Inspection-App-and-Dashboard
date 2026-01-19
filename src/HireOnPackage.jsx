import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './AuthContext.jsx'

const PROVINCES = [
  'Alberta', 'British Columbia', 'Saskatchewan', 'Manitoba', 'Ontario', 
  'Quebec', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 
  'Newfoundland and Labrador', 'Yukon', 'Northwest Territories', 'Nunavut'
]

export default function HireOnPackage() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState(1)
  const [inspectorProfile, setInspectorProfile] = useState(null)
  
  // Form state - matches new schema
  const [formData, setFormData] = useState({
    // Company Info
    company_name: '',
    company_address: '',
    company_city: '',
    company_province: 'Alberta',
    company_postal_code: '',
    company_phone: '',
    company_email: '',
    
    // Contact Info
    primary_contact_name: '',
    primary_contact_phone: '',
    primary_contact_email: '',
    
    // Banking
    bank_name: '',
    bank_institution: '',
    bank_transit: '',
    bank_account: '',
  })

  useEffect(() => {
    loadProfile()
  }, [user])

  async function loadProfile() {
    if (!user) return
    setLoading(true)
    
    try {
      const { data: profile, error } = await supabase
        .from('inspector_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (error) {
        console.error('Error loading profile:', error)
      }
      
      if (profile) {
        setInspectorProfile(profile)
        setFormData({
          company_name: profile.company_name || '',
          company_address: profile.company_address || '',
          company_city: profile.company_city || '',
          company_province: profile.company_province || 'Alberta',
          company_postal_code: profile.company_postal_code || '',
          company_phone: profile.company_phone || '',
          company_email: profile.company_email || '',
          primary_contact_name: profile.primary_contact_name || '',
          primary_contact_phone: profile.primary_contact_phone || '',
          primary_contact_email: profile.primary_contact_email || '',
          bank_name: profile.bank_name || '',
          bank_institution: profile.bank_institution || '',
          bank_transit: profile.bank_transit || '',
          bank_account: profile.bank_account || '',
        })
      }
    } catch (err) {
      console.error('Error loading profile:', err)
    }
    
    setLoading(false)
  }

  function handleInputChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function saveSection(sectionNum) {
    setSaving(true)
    
    try {
      let profileId = inspectorProfile?.id
      
      const profileData = {
        ...formData,
        updated_at: new Date().toISOString()
      }
      
      if (!profileId) {
        // Create new profile
        const { data: newProfile, error } = await supabase
          .from('inspector_profiles')
          .insert({
            user_id: user.id,
            ...profileData,
            created_by: user.id
          })
          .select()
          .single()
        
        if (error) throw error
        profileId = newProfile.id
        setInspectorProfile(newProfile)
      } else {
        // Update existing profile
        const { error } = await supabase
          .from('inspector_profiles')
          .update({
            ...profileData,
            updated_by: user.id
          })
          .eq('id', profileId)
        
        if (error) throw error
      }
      
      // Move to next section
      if (sectionNum < 3) {
        setActiveSection(sectionNum + 1)
      }
      
    } catch (err) {
      console.error('Error saving:', err)
      alert('Error saving: ' + err.message)
    }
    
    setSaving(false)
  }

  async function submitForReview() {
    setSaving(true)
    
    try {
      // Check required fields
      const requiredFields = ['company_name', 'company_city', 'primary_contact_name', 'primary_contact_phone']
      const missingFields = requiredFields.filter(f => !formData[f])
      
      if (missingFields.length > 0) {
        alert('Please complete all required fields: ' + missingFields.join(', '))
        setSaving(false)
        return
      }
      
      // Save and mark as complete
      const { error } = await supabase
        .from('inspector_profiles')
        .update({
          ...formData,
          profile_complete: true,
          updated_at: new Date().toISOString(),
          updated_by: user.id
        })
        .eq('id', inspectorProfile.id)
      
      if (error) throw error
      
      alert('Your hire-on package has been submitted for review!')
      navigate('/inspector-invoicing')
      
    } catch (err) {
      console.error('Error submitting:', err)
      alert('Error submitting: ' + err.message)
    }
    
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px 40px' }}>
        <button 
          onClick={() => navigate('/inspector-invoicing')}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px', marginBottom: '8px', opacity: 0.8 }}
        >
          ← Back to Inspector Invoicing
        </button>
        <h1 style={{ margin: 0, fontSize: '24px' }}>📋 Inspector Hire-On Package</h1>
        <p style={{ margin: '8px 0 0 0', opacity: 0.8 }}>Complete your profile to start working</p>
      </div>

      {/* Progress Bar */}
      <div style={{ backgroundColor: 'white', padding: '20px 40px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '600px', margin: '0 auto' }}>
          {[
            { num: 1, label: 'Company Info' },
            { num: 2, label: 'Contact Info' },
            { num: 3, label: 'Banking' }
          ].map(step => (
            <div 
              key={step.num}
              onClick={() => inspectorProfile && setActiveSection(step.num)}
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                cursor: inspectorProfile ? 'pointer' : 'default',
                opacity: activeSection >= step.num ? 1 : 0.5
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: activeSection >= step.num ? '#059669' : '#d1d5db',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                marginBottom: '8px'
              }}>
                {activeSection > step.num ? '✓' : step.num}
              </div>
              <span style={{ fontSize: '13px', color: activeSection >= step.num ? '#059669' : '#6b7280' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* Section 1: Company Info */}
        {activeSection === 1 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 24px 0', color: '#111827' }}>Company Information</h2>
            
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Inspector / Company Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  placeholder="Your name or company name"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Address
                </label>
                <input
                  type="text"
                  value={formData.company_address}
                  onChange={(e) => handleInputChange('company_address', e.target.value)}
                  placeholder="Street address"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    City <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.company_city}
                    onChange={(e) => handleInputChange('company_city', e.target.value)}
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Province
                  </label>
                  <select
                    value={formData.company_province}
                    onChange={(e) => handleInputChange('company_province', e.target.value)}
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  >
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={formData.company_postal_code}
                    onChange={(e) => handleInputChange('company_postal_code', e.target.value.toUpperCase())}
                    placeholder="T2P 1A1"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Company Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.company_phone}
                    onChange={(e) => handleInputChange('company_phone', e.target.value)}
                    placeholder="(403) 555-1234"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Company Email
                  </label>
                  <input
                    type="email"
                    value={formData.company_email}
                    onChange={(e) => handleInputChange('company_email', e.target.value)}
                    placeholder="info@company.ca"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => saveSection(1)}
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save & Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Section 2: Contact Info */}
        {activeSection === 2 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 24px 0', color: '#111827' }}>Primary Contact Information</h2>
            
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Contact Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.primary_contact_name}
                  onChange={(e) => handleInputChange('primary_contact_name', e.target.value)}
                  placeholder="Full name"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Phone <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.primary_contact_phone}
                    onChange={(e) => handleInputChange('primary_contact_phone', e.target.value)}
                    placeholder="(403) 555-1234"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.primary_contact_email}
                    onChange={(e) => handleInputChange('primary_contact_email', e.target.value)}
                    placeholder="contact@company.ca"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => setActiveSection(1)}
                style={{
                  padding: '12px 32px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => saveSection(2)}
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save & Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Section 3: Banking */}
        {activeSection === 3 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#111827' }}>Banking Information</h2>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
              For direct deposit of invoice payments
            </p>
            
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Bank Name
                </label>
                <input
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => handleInputChange('bank_name', e.target.value)}
                  placeholder="TD Canada Trust"
                  style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Institution #
                  </label>
                  <input
                    type="text"
                    value={formData.bank_institution}
                    onChange={(e) => handleInputChange('bank_institution', e.target.value)}
                    placeholder="004"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Transit #
                  </label>
                  <input
                    type="text"
                    value={formData.bank_transit}
                    onChange={(e) => handleInputChange('bank_transit', e.target.value)}
                    placeholder="12345"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Account #
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account}
                    onChange={(e) => handleInputChange('bank_account', e.target.value)}
                    placeholder="1234567"
                    style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '15px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => setActiveSection(2)}
                style={{
                  padding: '12px 32px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={submitForReview}
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Submitting...' : 'Submit for Review ✓'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
