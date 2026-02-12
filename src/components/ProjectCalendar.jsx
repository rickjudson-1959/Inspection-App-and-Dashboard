// ============================================================================
// PROJECT CALENDAR COMPONENT
// February 11, 2026
// Meeting scheduler with Zoom/Teams support for project dashboards
// ============================================================================

import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// Event type colors
const EVENT_COLORS = {
  meeting: '#3b82f6',      // Blue
  milestone: '#8b5cf6',    // Purple
  inspection: '#10b981',   // Green
  audit: '#f59e0b',        // Amber
  training: '#06b6d4',     // Cyan
  safety: '#ef4444',       // Red
  other: '#6b7280'         // Gray
}

const EVENT_TYPE_LABELS = {
  meeting: 'Meeting',
  milestone: 'Milestone',
  inspection: 'Inspection',
  audit: 'Audit',
  training: 'Training',
  safety: 'Safety',
  other: 'Other'
}

function ProjectCalendar({ organizationId, userId, userName }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [view, setView] = useState('month') // 'month' | 'list'
  const [orgUsers, setOrgUsers] = useState([])

  // Form state for creating/editing events
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'meeting',
    start_date: '',
    start_time: '09:00',
    end_date: '',
    end_time: '10:00',
    all_day: false,
    location_type: 'virtual',
    location_address: '',
    meeting_platform: 'zoom',
    meeting_link: '',
    meeting_passcode: '',
    attendees: [],
    send_invitations: true,
    color: '#3b82f6'
  })

  useEffect(() => {
    if (organizationId) {
      fetchEvents()
      fetchOrgUsers()
    }
  }, [organizationId, currentDate])

  async function fetchEvents() {
    setLoading(true)
    try {
      // Get events for the current month (+/- 1 week buffer)
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

      startOfMonth.setDate(startOfMonth.getDate() - 7)
      endOfMonth.setDate(endOfMonth.getDate() + 7)

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      console.error('Error fetching events:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchOrgUsers() {
    try {
      // Get users through memberships table
      const { data, error } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('organization_id', organizationId)

      if (error) {
        console.error('Error fetching memberships:', error)
        return
      }

      console.log('[Calendar] Memberships found:', data?.length || 0)

      if (!data || data.length === 0) {
        setOrgUsers([])
        return
      }

      // Get user profiles for these members
      const userIds = data.map(m => m.user_id)
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .in('id', userIds)

      if (profileError) {
        console.error('Error fetching profiles:', profileError)
        return
      }

      console.log('[Calendar] Users loaded:', profiles?.length || 0)
      // Map id to user_id for consistency
      const users = (profiles || []).map(p => ({
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: p.role
      }))
      setOrgUsers(users)
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  function openCreateModal(date = null) {
    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split('T')[0]

    setFormData({
      title: '',
      description: '',
      event_type: 'meeting',
      start_date: dateStr,
      start_time: '09:00',
      end_date: dateStr,
      end_time: '10:00',
      all_day: false,
      location_type: 'virtual',
      location_address: '',
      meeting_platform: 'zoom',
      meeting_link: '',
      meeting_passcode: '',
      attendees: [],
      send_invitations: true,
      color: '#3b82f6'
    })
    setSelectedEvent(null)
    setShowCreateModal(true)
  }

  function openEditModal(event) {
    const startDate = new Date(event.start_time)
    const endDate = new Date(event.end_time)

    setFormData({
      title: event.title || '',
      description: event.description || '',
      event_type: event.event_type || 'meeting',
      start_date: startDate.toISOString().split('T')[0],
      start_time: startDate.toTimeString().slice(0, 5),
      end_date: endDate.toISOString().split('T')[0],
      end_time: endDate.toTimeString().slice(0, 5),
      all_day: event.all_day || false,
      location_type: event.location_type || 'virtual',
      location_address: event.location_address || '',
      meeting_platform: event.meeting_platform || 'zoom',
      meeting_link: event.meeting_link || '',
      meeting_passcode: event.meeting_passcode || '',
      attendees: event.attendees || [],
      send_invitations: event.send_invitations ?? true,
      color: event.color || '#3b82f6'
    })
    setSelectedEvent(event)
    setShowCreateModal(true)
  }

  async function handleSaveEvent() {
    if (!formData.title.trim()) {
      alert('Please enter an event title')
      return
    }

    try {
      const startTime = new Date(`${formData.start_date}T${formData.start_time}`)
      const endTime = new Date(`${formData.end_date}T${formData.end_time}`)

      const eventData = {
        organization_id: organizationId,
        created_by: userId,
        created_by_name: userName,
        title: formData.title.trim(),
        description: formData.description.trim(),
        event_type: formData.event_type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: formData.all_day,
        location_type: formData.location_type,
        location_address: formData.location_type !== 'virtual' ? formData.location_address : null,
        meeting_platform: formData.location_type !== 'in_person' ? formData.meeting_platform : null,
        meeting_link: formData.location_type !== 'in_person' ? formData.meeting_link : null,
        meeting_passcode: formData.meeting_passcode || null,
        attendees: formData.attendees,
        send_invitations: formData.send_invitations,
        color: formData.color
      }

      if (selectedEvent) {
        // Update existing event
        const { error } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', selectedEvent.id)

        if (error) throw error
      } else {
        // Create new event
        const { error } = await supabase
          .from('calendar_events')
          .insert(eventData)

        if (error) throw error
      }

      setShowCreateModal(false)
      fetchEvents()
    } catch (err) {
      console.error('Error saving event:', err)
      alert('Failed to save event: ' + err.message)
    }
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) return
    if (!confirm('Are you sure you want to delete this event?')) return

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', selectedEvent.id)

      if (error) throw error

      setShowCreateModal(false)
      setShowEventModal(false)
      fetchEvents()
    } catch (err) {
      console.error('Error deleting event:', err)
      alert('Failed to delete event: ' + err.message)
    }
  }

  // Calendar helper functions
  function getDaysInMonth(date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()

    const days = []

    // Previous month days
    const prevMonth = new Date(year, month, 0)
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonth.getDate() - i),
        isCurrentMonth: false
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      })
    }

    // Next month days
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      })
    }

    return days
  }

  function getEventsForDate(date) {
    const dateStr = date.toISOString().split('T')[0]
    return events.filter(event => {
      const eventDate = new Date(event.start_time).toISOString().split('T')[0]
      return eventDate === dateStr
    })
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  function formatDateRange(start, end) {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' }
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true }

    return `${startDate.toLocaleDateString('en-US', dateOptions)} ${startDate.toLocaleTimeString('en-US', timeOptions)} - ${endDate.toLocaleTimeString('en-US', timeOptions)}`
  }

  const days = getDaysInMonth(currentDate)
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = new Date().toISOString().split('T')[0]

  // Upcoming events (next 7 days)
  const upcomingEvents = events
    .filter(e => new Date(e.start_time) >= new Date() && new Date(e.start_time) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    .slice(0, 5)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#1f2937' }}>Project Calendar</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setView(view === 'month' ? 'list' : 'month')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {view === 'month' ? '📋 List View' : '📅 Calendar View'}
          </button>
          <button
            onClick={() => openCreateModal()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* How to Set Up a Meeting - Callout */}
      <div style={{
        marginBottom: '20px',
        padding: '16px 20px',
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        borderLeft: '4px solid #3b82f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>💡</span>
          <div>
            <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '8px', fontSize: '14px' }}>
              How to Set Up a Meeting
            </div>
            <ol style={{ margin: 0, paddingLeft: '20px', color: '#1e3a8a', fontSize: '13px', lineHeight: '1.6' }}>
              <li><strong>Create your meeting in Zoom or Teams first</strong> - Open Zoom or Microsoft Teams and schedule your meeting to get the meeting link.</li>
              <li><strong>Click "+ New Event"</strong> above to create a calendar event.</li>
              <li><strong>Select "Zoom" or "Microsoft Teams"</strong> as your meeting platform.</li>
              <li><strong>Paste your meeting link</strong> in the "Meeting Link" field.</li>
              <li><strong>Add attendees</strong> from your team - they'll receive email invitations.</li>
              <li><strong>Save</strong> - Your meeting will appear on everyone's calendar!</li>
            </ol>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#3b82f6' }}>
              <strong>Tip:</strong> For recurring meetings, create the recurring meeting in Zoom/Teams first, then add a single event here with the recurring meeting link.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Calendar View */}
        <div style={{ flex: view === 'month' ? 2 : 0, display: view === 'month' ? 'block' : 'none' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {/* Month Navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '15px 20px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ← Prev
              </button>
              <h3 style={{ margin: 0, color: '#1f2937' }}>{monthName}</h3>
              <button
                onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Next →
              </button>
            </div>

            {/* Calendar Grid */}
            <div style={{ padding: '10px' }}>
              {/* Day Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '5px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={{
                    textAlign: 'center',
                    padding: '8px',
                    fontWeight: 'bold',
                    color: '#6b7280',
                    fontSize: '12px'
                  }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {days.map((day, idx) => {
                  const dayEvents = getEventsForDate(day.date)
                  const isToday = day.date.toISOString().split('T')[0] === today
                  const isSelected = selectedDate && day.date.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0]

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedDate(day.date)
                        if (dayEvents.length === 0) {
                          openCreateModal(day.date)
                        }
                      }}
                      style={{
                        minHeight: '80px',
                        padding: '4px',
                        backgroundColor: isSelected ? '#eff6ff' : isToday ? '#fef3c7' : day.isCurrentMonth ? 'white' : '#f9fafb',
                        border: isToday ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = isToday ? '#fef3c7' : day.isCurrentMonth ? 'white' : '#f9fafb' }}
                    >
                      <div style={{
                        fontSize: '12px',
                        fontWeight: isToday ? 'bold' : 'normal',
                        color: day.isCurrentMonth ? '#1f2937' : '#9ca3af',
                        marginBottom: '4px'
                      }}>
                        {day.date.getDate()}
                      </div>
                      {dayEvents.slice(0, 3).map((event, i) => (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedEvent(event)
                            setShowEventModal(true)
                          }}
                          style={{
                            fontSize: '10px',
                            padding: '2px 4px',
                            marginBottom: '2px',
                            backgroundColor: event.color || EVENT_COLORS[event.event_type],
                            color: 'white',
                            borderRadius: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: '10px', color: '#6b7280' }}>
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Events / List View */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '20px'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1f2937', fontSize: '16px' }}>
              {view === 'list' ? 'All Events' : 'Upcoming Events'}
            </h3>

            {loading ? (
              <p style={{ color: '#6b7280', fontSize: '13px' }}>Loading events...</p>
            ) : (view === 'list' ? events : upcomingEvents).length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '13px' }}>No upcoming events</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(view === 'list' ? events : upcomingEvents).map(event => (
                  <div
                    key={event.id}
                    onClick={() => {
                      setSelectedEvent(event)
                      setShowEventModal(true)
                    }}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      borderLeft: `4px solid ${event.color || EVENT_COLORS[event.event_type]}`,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  >
                    <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '13px', marginBottom: '4px' }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                      {formatDateRange(event.start_time, event.end_time)}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        backgroundColor: event.color || EVENT_COLORS[event.event_type],
                        color: 'white',
                        borderRadius: '3px'
                      }}>
                        {EVENT_TYPE_LABELS[event.event_type]}
                      </span>
                      {event.meeting_platform && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          backgroundColor: event.meeting_platform === 'zoom' ? '#2d8cff' : '#5c5ce8',
                          color: 'white',
                          borderRadius: '3px'
                        }}>
                          {event.meeting_platform === 'zoom' ? 'Zoom' : event.meeting_platform === 'teams' ? 'Teams' : 'Virtual'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event Type Legend */}
          <div style={{
            marginTop: '15px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            padding: '15px'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#6b7280', fontSize: '12px', textTransform: 'uppercase' }}>
              Event Types
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: EVENT_COLORS[key]
                  }} />
                  <span style={{ fontSize: '11px', color: '#4b5563' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Event Modal */}
      {showCreateModal && (
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
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>
                {selectedEvent ? 'Edit Event' : 'Create New Event'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {/* Title */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                  Event Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Weekly Progress Meeting"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Event Type */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                  Event Type
                </label>
                <select
                  value={formData.event_type}
                  onChange={(e) => setFormData({ ...formData, event_type: e.target.value, color: EVENT_COLORS[e.target.value] })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Date & Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value, end_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Location Type */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                  Location Type
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { value: 'virtual', label: '💻 Virtual', color: '#3b82f6' },
                    { value: 'in_person', label: '📍 In-Person', color: '#10b981' },
                    { value: 'hybrid', label: '🔄 Hybrid', color: '#8b5cf6' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, location_type: opt.value })}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: formData.location_type === opt.value ? `2px solid ${opt.color}` : '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: formData.location_type === opt.value ? `${opt.color}15` : 'white',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: formData.location_type === opt.value ? 'bold' : 'normal'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meeting Platform (for virtual/hybrid) */}
              {formData.location_type !== 'in_person' && (
                <div style={{
                  marginBottom: '15px',
                  padding: '15px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  border: '1px solid #bae6fd'
                }}>
                  <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '13px', color: '#0369a1' }}>
                    Virtual Meeting Details
                  </label>

                  {/* Platform Selection */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#374151' }}>
                      Meeting Platform
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, meeting_platform: 'zoom' })}
                        style={{
                          flex: 1,
                          padding: '12px',
                          border: formData.meeting_platform === 'zoom' ? '2px solid #2d8cff' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: formData.meeting_platform === 'zoom' ? '#e6f3ff' : 'white',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: formData.meeting_platform === 'zoom' ? 'bold' : 'normal',
                          color: formData.meeting_platform === 'zoom' ? '#2d8cff' : '#374151'
                        }}
                      >
                        🎥 Zoom
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, meeting_platform: 'teams' })}
                        style={{
                          flex: 1,
                          padding: '12px',
                          border: formData.meeting_platform === 'teams' ? '2px solid #5c5ce8' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: formData.meeting_platform === 'teams' ? '#eeeeff' : 'white',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: formData.meeting_platform === 'teams' ? 'bold' : 'normal',
                          color: formData.meeting_platform === 'teams' ? '#5c5ce8' : '#374151'
                        }}
                      >
                        📱 Microsoft Teams
                      </button>
                    </div>
                  </div>

                  {/* Meeting Link */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#374151' }}>
                      Meeting Link (paste from {formData.meeting_platform === 'zoom' ? 'Zoom' : 'Teams'})
                    </label>
                    <input
                      type="url"
                      value={formData.meeting_link}
                      onChange={(e) => setFormData({ ...formData, meeting_link: e.target.value })}
                      placeholder={formData.meeting_platform === 'zoom' ? 'https://zoom.us/j/...' : 'https://teams.microsoft.com/l/meetup-join/...'}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Meeting Passcode (optional) */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#374151' }}>
                      Meeting Passcode (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.meeting_passcode}
                      onChange={(e) => setFormData({ ...formData, meeting_passcode: e.target.value })}
                      placeholder="Enter passcode if required"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Physical Location (for in-person/hybrid) */}
              {formData.location_type !== 'virtual' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                    Physical Location
                  </label>
                  <input
                    type="text"
                    value={formData.location_address}
                    onChange={(e) => setFormData({ ...formData, location_address: e.target.value })}
                    placeholder="e.g., Site Office, KP 12+500, or address"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              {/* Description */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                  Description / Agenda
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Meeting agenda, topics to discuss, etc."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Attendees */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                  Attendees
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {formData.attendees.map((att, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        backgroundColor: '#e0f2fe',
                        borderRadius: '15px',
                        fontSize: '12px',
                        color: '#0369a1'
                      }}
                    >
                      {att.name || att.email}
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          attendees: formData.attendees.filter((_, i) => i !== idx)
                        })}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#0369a1',
                          padding: 0,
                          fontSize: '14px'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
{orgUsers.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                    No team members found. You can still create the event.
                  </p>
                ) : (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const user = orgUsers.find(u => u.user_id === e.target.value)
                        if (user && !formData.attendees.find(a => a.user_id === user.user_id)) {
                          setFormData({
                            ...formData,
                            attendees: [...formData.attendees, {
                              user_id: user.user_id,
                              email: user.email,
                              name: user.full_name,
                              rsvp: 'pending'
                            }]
                          })
                        }
                        e.target.value = ''
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">+ Add attendee ({orgUsers.length} available)...</option>
                    {orgUsers
                      .filter(u => !formData.attendees.find(a => a.user_id === u.user_id))
                      .map(user => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.full_name} ({user.role})
                        </option>
                      ))
                    }
                  </select>
                )}
              </div>

              {/* Send Invitations */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.send_invitations}
                    onChange={(e) => setFormData({ ...formData, send_invitations: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '13px', color: '#374151' }}>
                    Send email invitations to attendees
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '15px 20px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                {selectedEvent && (
                  <button
                    onClick={handleDeleteEvent}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    Delete Event
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEvent}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  {selectedEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {showEventModal && selectedEvent && (
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
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: selectedEvent.color || EVENT_COLORS[selectedEvent.event_type],
              borderRadius: '12px 12px 0 0',
              color: 'white'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0' }}>{selectedEvent.title}</h3>
                  <div style={{ fontSize: '13px', opacity: 0.9 }}>
                    {formatDateRange(selectedEvent.start_time, selectedEvent.end_time)}
                  </div>
                </div>
                <button
                  onClick={() => setShowEventModal(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '30px',
                    height: '30px',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '18px'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Event Type */}
              <div style={{ marginBottom: '15px' }}>
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: selectedEvent.color || EVENT_COLORS[selectedEvent.event_type],
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  {EVENT_TYPE_LABELS[selectedEvent.event_type]}
                </span>
              </div>

              {/* Location / Meeting Link */}
              {selectedEvent.meeting_link && (
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                    {selectedEvent.meeting_platform === 'zoom' ? '🎥 Zoom Meeting' : '📱 Teams Meeting'}
                  </div>
                  <a
                    href={selectedEvent.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      backgroundColor: selectedEvent.meeting_platform === 'zoom' ? '#2d8cff' : '#5c5ce8',
                      color: 'white',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}
                  >
                    Join Meeting
                  </a>
                  {selectedEvent.meeting_passcode && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                      Passcode: <strong>{selectedEvent.meeting_passcode}</strong>
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.location_address && (
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>📍 Location</div>
                  <div style={{ fontSize: '14px', color: '#1f2937' }}>{selectedEvent.location_address}</div>
                </div>
              )}

              {/* Description */}
              {selectedEvent.description && (
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Description</div>
                  <div style={{ fontSize: '14px', color: '#1f2937', whiteSpace: 'pre-wrap' }}>
                    {selectedEvent.description}
                  </div>
                </div>
              )}

              {/* Attendees */}
              {selectedEvent.attendees?.length > 0 && (
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>Attendees</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedEvent.attendees.map((att, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '15px',
                          fontSize: '12px',
                          color: '#374151'
                        }}
                      >
                        {att.name || att.email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Created By */}
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                Created by {selectedEvent.created_by_name || 'Unknown'}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '15px 20px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => {
                  setShowEventModal(false)
                  openEditModal(selectedEvent)
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Edit Event
              </button>
              <button
                onClick={() => setShowEventModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectCalendar
