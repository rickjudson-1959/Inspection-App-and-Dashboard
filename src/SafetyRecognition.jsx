import React, { useState } from 'react'

function SafetyRecognition({ data, onChange, inspectorName, reportDate }) {
  const [showForm, setShowForm] = useState(data?.enabled || false)

  // Default structure
  const defaultData = {
    enabled: false,
    cards: []
  }

  // Merge incoming data with defaults
  const safetyData = {
    ...defaultData,
    ...data,
    cards: data?.cards || []
  }

  const toggleForm = () => {
    const newEnabled = !showForm
    setShowForm(newEnabled)
    onChange({ ...safetyData, enabled: newEnabled })
  }

  const addCard = () => {
    const newCard = {
      id: Date.now(),
      cardType: 'positive', // 'positive' or 'safe'
      observerName: inspectorName || '',
      observerDate: reportDate || '',
      observeeName: '',
      location: '',
      companyType: '', // 'pembina' or 'contractor'
      causeType: '', // 'behavior', 'condition', 'both'
      situationDescription: '',
      whatCouldHaveHappened: '',
      dialogueOccurred: '',
      dialogueComment: '',
      questionsAsked: '',
      responses: '',
      actions: [],
      acknowledged: false,
      incidentNumber: '',
      supervisorSignoff: '',
      comments: ''
    }
    onChange({ ...safetyData, cards: [...safetyData.cards, newCard] })
  }

  const updateCard = (cardId, field, value) => {
    const updated = safetyData.cards.map(card => {
      if (card.id === cardId) {
        return { ...card, [field]: value }
      }
      return card
    })
    onChange({ ...safetyData, cards: updated })
  }

  const removeCard = (cardId) => {
    onChange({ ...safetyData, cards: safetyData.cards.filter(c => c.id !== cardId) })
  }

  const addAction = (cardId) => {
    const newAction = {
      id: Date.now(),
      action: '',
      byWhom: '',
      dueDate: '',
      dateCompleted: ''
    }
    const updated = safetyData.cards.map(card => {
      if (card.id === cardId) {
        return { ...card, actions: [...(card.actions || []), newAction] }
      }
      return card
    })
    onChange({ ...safetyData, cards: updated })
  }

  const updateAction = (cardId, actionId, field, value) => {
    const updated = safetyData.cards.map(card => {
      if (card.id === cardId) {
        const updatedActions = (card.actions || []).map(action => {
          if (action.id === actionId) {
            return { ...action, [field]: value }
          }
          return action
        })
        return { ...card, actions: updatedActions }
      }
      return card
    })
    onChange({ ...safetyData, cards: updated })
  }

  const removeAction = (cardId, actionId) => {
    const updated = safetyData.cards.map(card => {
      if (card.id === cardId) {
        return { ...card, actions: (card.actions || []).filter(a => a.id !== actionId) }
      }
      return card
    })
    onChange({ ...safetyData, cards: updated })
  }

  // Styles
  const sectionStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #dee2e6'
  }

  const cardStyle = {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '2px solid #28a745',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }

  const safeCardStyle = {
    ...cardStyle,
    border: '2px solid #ffc107'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#666',
    marginBottom: '4px'
  }

  const inputStyle = {
    width: '100%',
    padding: '8px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const textareaStyle = {
    ...inputStyle,
    minHeight: '80px',
    resize: 'vertical'
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    marginTop: '10px'
  }

  const thStyle = {
    padding: '8px',
    backgroundColor: '#28a745',
    color: 'white',
    textAlign: 'left',
    fontSize: '12px',
    border: '1px solid #1e7e34'
  }

  const tdStyle = {
    padding: '6px',
    border: '1px solid #dee2e6'
  }

  const tableInputStyle = {
    width: '100%',
    padding: '6px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box'
  }

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h4 style={{ margin: 0, color: '#28a745', fontSize: '14px' }}>🏆 Safety Recognition/Hazard ID Cards</h4>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
            Record positive safety observations or Hazard ID cards
          </p>
        </div>
        <button
          onClick={toggleForm}
          style={{
            padding: '8px 16px',
            backgroundColor: showForm ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          {showForm ? '− Hide Cards' : '+ Add Safety Card'}
        </button>
      </div>

      {showForm && (
        <div>
          {/* Add Card Button */}
          <div style={{ marginBottom: '15px' }}>
            <button
              onClick={addCard}
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              + New Safety Card
            </button>
          </div>

          {/* Cards List */}
          {safetyData.cards.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
              No safety cards recorded. Click "New Safety Card" to add one.
            </p>
          ) : (
            safetyData.cards.map((card, index) => (
              <div 
                key={card.id} 
                style={card.cardType === 'safe' ? safeCardStyle : cardStyle}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: `2px solid ${card.cardType === 'safe' ? '#ffc107' : '#28a745'}` }}>
                  <h4 style={{ margin: 0, color: card.cardType === 'safe' ? '#856404' : '#155724' }}>
                    {card.cardType === 'safe' ? '⚠️ Hazard ID Card' : '🏆 Positive Recognition'} #{index + 1}
                  </h4>
                  <button
                    onClick={() => removeCard(card.id)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Remove
                  </button>
                </div>

                {/* Card Type Selection */}
                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                  <label style={{ fontWeight: 'bold', marginRight: '20px' }}>Card Type:</label>
                  <label style={{ marginRight: '20px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`cardType-${card.id}`}
                      checked={card.cardType === 'positive'}
                      onChange={() => updateCard(card.id, 'cardType', 'positive')}
                      style={{ marginRight: '5px' }}
                    />
                    🏆 Positive Recognition
                  </label>
                  <label style={{ cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`cardType-${card.id}`}
                      checked={card.cardType === 'safe'}
                      onChange={() => updateCard(card.id, 'cardType', 'safe')}
                      style={{ marginRight: '5px' }}
                    />
                    ⚠️ Hazard ID Card (Near Miss/Hazard)
                  </label>
                </div>

                {/* Observer Info */}
                <div style={{ ...gridStyle, marginBottom: '15px' }}>
                  <div>
                    <label style={labelStyle}>Observer Name</label>
                    <input
                      type="text"
                      value={card.observerName}
                      onChange={(e) => updateCard(card.id, 'observerName', e.target.value)}
                      placeholder="Your name"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={card.observerDate}
                      onChange={(e) => updateCard(card.id, 'observerDate', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Person Observed/Recognized</label>
                    <input
                      type="text"
                      value={card.observeeName}
                      onChange={(e) => updateCard(card.id, 'observeeName', e.target.value)}
                      placeholder="Name of person"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <input
                      type="text"
                      value={card.location}
                      onChange={(e) => updateCard(card.id, 'location', e.target.value)}
                      placeholder="Location"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Company Type */}
                <div style={{ marginBottom: '15px' }}>
                  <label style={labelStyle}>Company</label>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`company-${card.id}`}
                        checked={card.companyType === 'client'}
                        onChange={() => updateCard(card.id, 'companyType', 'client')}
                        style={{ marginRight: '5px' }}
                      />
                      Client
                    </label>
                    <label style={{ cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`company-${card.id}`}
                        checked={card.companyType === 'contractor'}
                        onChange={() => updateCard(card.id, 'companyType', 'contractor')}
                        style={{ marginRight: '5px' }}
                      />
                      Contractor
                    </label>
                  </div>
                </div>

                {/* Cause Type (for S.A.F.E. cards) */}
                {card.cardType === 'safe' && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={labelStyle}>Cause (Please Check One)</label>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <label style={{ cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`cause-${card.id}`}
                          checked={card.causeType === 'behavior'}
                          onChange={() => updateCard(card.id, 'causeType', 'behavior')}
                          style={{ marginRight: '5px' }}
                        />
                        Behavior
                      </label>
                      <label style={{ cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`cause-${card.id}`}
                          checked={card.causeType === 'condition'}
                          onChange={() => updateCard(card.id, 'causeType', 'condition')}
                          style={{ marginRight: '5px' }}
                        />
                        Condition
                      </label>
                      <label style={{ cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`cause-${card.id}`}
                          checked={card.causeType === 'both'}
                          onChange={() => updateCard(card.id, 'causeType', 'both')}
                          style={{ marginRight: '5px' }}
                        />
                        Both
                      </label>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div style={{ marginBottom: '15px' }}>
                  <label style={labelStyle}>
                    {card.cardType === 'safe' ? 'Brief Description of Observation' : 'Situation/Environment'}
                  </label>
                  <textarea
                    value={card.situationDescription}
                    onChange={(e) => updateCard(card.id, 'situationDescription', e.target.value)}
                    placeholder={card.cardType === 'safe' ? 'Describe what was observed...' : 'Describe the positive safety behavior observed...'}
                    style={textareaStyle}
                  />
                </div>

                {/* What Could Have Happened (S.A.F.E. cards only) */}
                {card.cardType === 'safe' && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={labelStyle}>What could have happened if not corrected?</label>
                    <textarea
                      value={card.whatCouldHaveHappened}
                      onChange={(e) => updateCard(card.id, 'whatCouldHaveHappened', e.target.value)}
                      placeholder="Describe potential consequences..."
                      style={textareaStyle}
                    />
                  </div>
                )}

                {/* Dialogue Section (Positive Recognition) */}
                {card.cardType === 'positive' && (
                  <>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={labelStyle}>Dialogue and Acknowledgement Occurred?</label>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <label style={{ cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`dialogue-${card.id}`}
                            checked={card.dialogueOccurred === 'yes'}
                            onChange={() => updateCard(card.id, 'dialogueOccurred', 'yes')}
                            style={{ marginRight: '5px' }}
                          />
                          Yes
                        </label>
                        <label style={{ cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`dialogue-${card.id}`}
                            checked={card.dialogueOccurred === 'no'}
                            onChange={() => updateCard(card.id, 'dialogueOccurred', 'no')}
                            style={{ marginRight: '5px' }}
                          />
                          No
                        </label>
                        <input
                          type="text"
                          value={card.dialogueComment}
                          onChange={(e) => updateCard(card.id, 'dialogueComment', e.target.value)}
                          placeholder="Comment"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    </div>

                    <div style={{ ...gridStyle, marginBottom: '15px' }}>
                      <div>
                        <label style={labelStyle}>Questions Asked</label>
                        <textarea
                          value={card.questionsAsked}
                          onChange={(e) => updateCard(card.id, 'questionsAsked', e.target.value)}
                          placeholder="What questions were asked?"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Responses</label>
                        <textarea
                          value={card.responses}
                          onChange={(e) => updateCard(card.id, 'responses', e.target.value)}
                          placeholder="What were the responses?"
                          style={{ ...textareaStyle, minHeight: '60px' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Actions/Recommendations Table */}
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      {card.cardType === 'safe' ? 'Actions' : 'Actions/Recommendations'}
                    </label>
                    <button
                      onClick={() => addAction(card.id)}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      + Add Action
                    </button>
                  </div>

                  {(card.actions || []).length > 0 && (
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, backgroundColor: card.cardType === 'safe' ? '#ffc107' : '#28a745', borderColor: card.cardType === 'safe' ? '#d39e00' : '#1e7e34', color: card.cardType === 'safe' ? '#000' : '#fff' }}>Action</th>
                          <th style={{ ...thStyle, backgroundColor: card.cardType === 'safe' ? '#ffc107' : '#28a745', borderColor: card.cardType === 'safe' ? '#d39e00' : '#1e7e34', color: card.cardType === 'safe' ? '#000' : '#fff' }}>By Whom</th>
                          <th style={{ ...thStyle, backgroundColor: card.cardType === 'safe' ? '#ffc107' : '#28a745', borderColor: card.cardType === 'safe' ? '#d39e00' : '#1e7e34', color: card.cardType === 'safe' ? '#000' : '#fff' }}>Due Date</th>
                          <th style={{ ...thStyle, backgroundColor: card.cardType === 'safe' ? '#ffc107' : '#28a745', borderColor: card.cardType === 'safe' ? '#d39e00' : '#1e7e34', color: card.cardType === 'safe' ? '#000' : '#fff' }}>Date Completed</th>
                          <th style={{ ...thStyle, width: '50px', backgroundColor: card.cardType === 'safe' ? '#ffc107' : '#28a745', borderColor: card.cardType === 'safe' ? '#d39e00' : '#1e7e34', color: card.cardType === 'safe' ? '#000' : '#fff' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(card.actions || []).map(action => (
                          <tr key={action.id}>
                            <td style={tdStyle}>
                              <input
                                type="text"
                                value={action.action}
                                onChange={(e) => updateAction(card.id, action.id, 'action', e.target.value)}
                                placeholder="Action item"
                                style={tableInputStyle}
                              />
                            </td>
                            <td style={tdStyle}>
                              <input
                                type="text"
                                value={action.byWhom}
                                onChange={(e) => updateAction(card.id, action.id, 'byWhom', e.target.value)}
                                placeholder="Name"
                                style={tableInputStyle}
                              />
                            </td>
                            <td style={tdStyle}>
                              <input
                                type="date"
                                value={action.dueDate}
                                onChange={(e) => updateAction(card.id, action.id, 'dueDate', e.target.value)}
                                style={tableInputStyle}
                              />
                            </td>
                            <td style={tdStyle}>
                              <input
                                type="date"
                                value={action.dateCompleted}
                                onChange={(e) => updateAction(card.id, action.id, 'dateCompleted', e.target.value)}
                                style={tableInputStyle}
                              />
                            </td>
                            <td style={tdStyle}>
                              <button
                                onClick={() => removeAction(card.id, action.id)}
                                style={{
                                  padding: '2px 6px',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '11px'
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer - Acknowledgement */}
                <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={card.acknowledged}
                        onChange={(e) => updateCard(card.id, 'acknowledged', e.target.checked)}
                        style={{ marginRight: '8px', width: '18px', height: '18px' }}
                      />
                      <strong>Acknowledged</strong>
                    </label>
                    {card.cardType === 'safe' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Incident #:</label>
                        <input
                          type="text"
                          value={card.incidentNumber}
                          onChange={(e) => updateCard(card.id, 'incidentNumber', e.target.value)}
                          placeholder="Incident #"
                          style={{ ...inputStyle, width: '120px' }}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Supervisor Review:</label>
                      <input
                        type="text"
                        value={card.supervisorSignoff}
                        onChange={(e) => updateCard(card.id, 'supervisorSignoff', e.target.value)}
                        placeholder="Name"
                        style={{ ...inputStyle, width: '150px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Comments */}
                <div style={{ marginTop: '15px' }}>
                  <label style={labelStyle}>Additional Comments</label>
                  <textarea
                    value={card.comments}
                    onChange={(e) => updateCard(card.id, 'comments', e.target.value)}
                    placeholder="Any additional comments..."
                    style={{ ...textareaStyle, minHeight: '60px' }}
                  />
                </div>
              </div>
            ))
          )}

          {/* Summary */}
          {safetyData.cards.length > 0 && (
            <div style={{ padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px', fontSize: '13px' }}>
              <strong>Summary:</strong>{' '}
              {safetyData.cards.filter(c => c.cardType === 'positive').length} Positive Recognition |{' '}
              {safetyData.cards.filter(c => c.cardType === 'safe').length} Hazard ID Cards
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SafetyRecognition
