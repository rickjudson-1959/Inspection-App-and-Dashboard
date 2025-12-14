import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'

function ReportsPage() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ dateFrom: '', dateTo: '', inspector: '', spread: '' })

  const isSuperAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    fetchReports()
  }, [])

  async function fetchReports() {
    setLoading(true)
    let query = supabase
      .from('daily_tickets')
      .select('*')
      .order('date', { ascending: false })

    // Filter by organization for non-super admins
    if (!isSuperAdmin && userProfile?.organization_id) {
      query = query.eq('organization_id', userProfile.organization_id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching reports:', error)
    }
    setReports(data || [])
    setLoading(false)
  }

  function applyFilters() {
    let filtered = [...reports]
    if (filter.dateFrom) {
      filtered = filtered.filter(r => r.date >= filter.dateFrom)
    }
    if (filter.dateTo) {
      filtered = filtered.filter(r => r.date <= filter.dateTo)
    }
    if (filter.inspector) {
      filtered = filtered.filter(r => r.inspector_name?.toLowerCase().includes(filter.inspector.toLowerCase()))
    }
    if (filter.spread) {
      filtered = filtered.filter(r => r.spread?.toLowerCase().includes(filter.spread.toLowerCase()))
    }
    return filtered
  }

  const filteredReports = applyFilters()

  // Calculate totals from activity blocks
  function getReportTotals(report) {
    const blocks = report.activity_blocks || []
    let totalLabour = 0
    let totalEquipment = 0
    let activities = []

    blocks.forEach(block => {
      if (block.activityType) activities.push(block.activityType)
      if (block.labourEntries) {
        block.labourEntries.forEach(entry => {
          totalLabour += ((entry.rt || 0) + (entry.ot || 0)) * (entry.count || 1)
        })
      }
      if (block.equipmentEntries) {
        block.equipmentEntries.forEach(entry => {
          totalEquipment += (entry.hours || 0) * (entry.count || 1)
        })
      }
    })

    return { totalLabour, totalEquipment, activities: [...new Set(activities)] }
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading reports...</div>
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>📋 Inspector Reports</h1>
          <p s