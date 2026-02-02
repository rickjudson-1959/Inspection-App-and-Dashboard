import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import ComplianceAuditTrail from './ComplianceAuditTrail.jsx'
import RateImport from './RateImport.jsx'
import MasterSwitcher from './MasterSwitcher.jsx'
import ShadowAuditDashboard from './ShadowAuditDashboard.jsx'
import {
  aggregateReliabilityScore,
  calculateTotalBilledHours,
  calculateTotalShadowHours,
  calculateValueLost,
  aggregateEfficiencyVerification
} from './shadowAuditUtils.js'
import { MetricInfoIcon, MetricIntegrityModal, useMetricIntegrityModal } from './components/MetricIntegrityInfo.jsx'
import { useOrgQuery } from './utils/queryHelpers.js'
import TenantSwitcher from './components/TenantSwitcher.jsx'
import { useOrgPath } from './contexts/OrgContext.jsx'
import SignaturePad from './components/SignaturePad.jsx'
import AIAgentStatusIcon from './components/AIAgentStatusIcon.jsx'
import AgentAuditFindingsPanel from './components/AgentAuditFindingsPanel.jsx'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

function AdminPortal() {
  const navigate = useNavigate()
  const { signOut, userProfile } = useAuth()
  const { orgPath } = useOrgPath()
  const { addOrgFilter, organizationId, getOrgId, isReady } = useOrgQuery()
  const [organizations, setOrganizations] = useState([])
  const [users, setUsers] = useState([])
  const [inspectorProfiles, setInspectorProfiles] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Pending Approvals state
  const [pendingReports, setPendingReports] = useState([])
  const [loadingPending, setLoadingPending] = useState(false)

  // Mat Inventory state
  const [matInventory, setMatInventory] = useState([])
  const [matSummary, setMatSummary] = useState({ rigMats: 0, swampMats: 0 })
  const [recentMatMovements, setRecentMatMovements] = useState([])
  const [loadingMats, setLoadingMats] = useState(false)

  // Efficiency metrics state (for overview dashboard)
  const [recentReports, setRecentReports] = useState([])

  // AI Agent Audit Panel state
  const [auditPanelData, setAuditPanelData] = useState(null)
  const [loadingAuditPanel, setLoadingAuditPanel] = useState(false)

  // Audit Activity state
  const [auditLog, setAuditLog] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // All Reports state
  const [allReports, setAllReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)

  // Timesheet Review Queue state (Phase 4)
  const [pendingTimesheets, setPendingTimesheets] = useState([])
  const [loadingTimesheets, setLoadingTimesheets] = useState(false)
  const [selectedTimesheet, setSelectedTimesheet] = useState(null)
  const [showTimesheetModal, setShowTimesheetModal] = useState(false)
  const [timesheetItems, setTimesheetItems] = useState([])
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [timesheetToReject, setTimesheetToReject] = useState(null)

  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [newProject, setNewProject] = useState({ name: '', shortCode: '', organizationId: '' })

  // Inspector Profile Modal state
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [profileDocuments, setProfileDocuments] = useState([])
  const [loadingProfile, setLoadingProfile] = useState(false)

  // Handover/Closeout state
  const [selectedOrgForHandover, setSelectedOrgForHandover] = useState('')
  const [handoverAudit, setHandoverAudit] = useState(null)
  const [generatingPackage, setGeneratingPackage] = useState(false)
  const [handoverProgress, setHandoverProgress] = useState('')
  const [handoverHistory, setHandoverHistory] = useState([])
  const [manifestPreview, setManifestPreview] = useState(null)
  const [generatingManifest, setGeneratingManifest] = useState(false)

  // Setup tab state
  const [selectedOrgForSetup, setSelectedOrgForSetup] = useState('')

  // Project Governance state (uses contract_config table)
  const [governanceData, setGovernanceData] = useState({
    contract_number: '',
    standard_workday: 10,
    ap_email: '',
    start_kp: '',
    end_kp: '',
    default_diameter: '',
    per_diem_rate: 0,
    default_pipe_specs: {},
    custom_document_fields: [] // Owner DC custom metadata fields
  })

  // Transmittal state
  const [transmittals, setTransmittals] = useState([])
  const [showTransmittalModal, setShowTransmittalModal] = useState(false)
  const [transmittalForm, setTransmittalForm] = useState({
    from_name: '',
    from_title: 'Construction Manager',
    to_name: '',
    to_company: '',
    subject: '',
    notes: '',
    selectedDocIds: []
  })
  const [generatingTransmittal, setGeneratingTransmittal] = useState(false)

  // Document metadata state (for uploads with custom fields)
  const [uploadMetadata, setUploadMetadata] = useState({})
  const [configExists, setConfigExists] = useState(false)
  const [savingGovernance, setSavingGovernance] = useState(false)
  const [governanceMessage, setGovernanceMessage] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [orgDocuments, setOrgDocuments] = useState([])

  // Project Document Vault state
  const [projectDocuments, setProjectDocuments] = useState([])
  const [uploadingVaultDoc, setUploadingVaultDoc] = useState(null) // tracks which category is uploading

  // Document Version History state
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [selectedCategoryForHistory, setSelectedCategoryForHistory] = useState(null)

  // ITP Revision Prompt state
  const [showITPResetPrompt, setShowITPResetPrompt] = useState(false)
  const [pendingITPUpload, setPendingITPUpload] = useState(null) // { file, category }

  // Addendum upload state
  const [uploadingAddendum, setUploadingAddendum] = useState(null) // parent document id

  // ITP Digital Signature state
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signingRole, setSigningRole] = useState(null) // { key, label, shortLabel }
  const [savingSignature, setSavingSignature] = useState(false)

  // Document Sync Status state (Owner DC Tracking)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [selectedDocForSync, setSelectedDocForSync] = useState(null)
  const [syncForm, setSyncForm] = useState({
    sync_status: 'transmitted',
    owner_transmittal_id: '',
    owner_comments: ''
  })
  const [updatingSyncStatus, setUpdatingSyncStatus] = useState(false)

  // Overview tab document stats (separate from Setup tab documents)
  const [overviewDocs, setOverviewDocs] = useState([])
  const [loadingOverviewDocs, setLoadingOverviewDocs] = useState(false)

  // Document vault categories
  const documentVaultCategories = [
    { key: 'prime_contract', label: 'Prime Contract', icon: '📜' },
    { key: 'scope_of_work', label: 'Scope of Work (SOW)', icon: '📋' },
    { key: 'ifc_drawings', label: 'IFC Drawings', icon: '📐' },
    { key: 'typical_drawings', label: 'Typical Drawings', icon: '📏' },
    { key: 'project_specs', label: 'Project Specifications', icon: '📑', supportsAddenda: true },
    { key: 'weld_procedures', label: 'Weld Procedures (WPS)', icon: '🔧', supportsAddenda: true },
    { key: 'erp', label: 'Emergency Response Plan (ERP)', icon: '🚨' },
    { key: 'emp', label: 'Environmental Management Plan (EMP)', icon: '🌿' },
    { key: 'itp', label: 'Inspection & Test Plan (ITP)', icon: '✅', requiresSignOff: true, supportsAddenda: true }
  ]

  // ITP Sign-off roles required for approval
  const itpSignOffRoles = [
    { key: 'chief_welding_inspector', label: 'Chief Welding Inspector', shortLabel: 'CWI' },
    { key: 'chief_inspector', label: 'Chief Inspector', shortLabel: 'CI' },
    { key: 'construction_manager', label: 'Construction Manager', shortLabel: 'CM' }
  ]

  // Technical Resource Library categories (super_admin only for management)
  const technicalLibraryCategories = [
    { key: 'api_1169', label: 'API 1169 - Pipeline Construction Inspection', icon: '📘', description: 'Standard for pipeline construction inspection' },
    { key: 'csa_z662', label: 'CSA Z662 - Oil & Gas Pipeline Systems', icon: '📗', description: 'Canadian standards for pipeline systems' },
    { key: 'pipeline_authority_ref', label: 'Practical Guide for Pipeline Construction Inspectors', icon: '📕', description: 'Comprehensive field guide for pipeline construction inspection best practices.' },
    { key: 'inspector_playbook', label: "Pipeline Inspector's Playbook", icon: '📙', description: 'Essential playbook for pipeline inspection procedures and techniques.' },
    { key: 'rules_of_thumb', label: 'Pipeline Rules of Thumb', icon: '📓', description: 'Quick reference guide with practical rules and calculations for pipeline work.' }
  ]

  // State for global library documents
  const [globalLibraryDocs, setGlobalLibraryDocs] = useState([])

  // Metric Integrity Info modal
  const metricInfoModal = useMetricIntegrityModal()

  // Invite User state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('inspector')
  const [inviting, setInviting] = useState(false)

  const isSuperAdmin = userProfile?.role === 'super_admin'

  // Fleet Onboarding state (Super Admin only)
  const [fleetForm, setFleetForm] = useState({
    organizationName: '',
    slug: '',
    adminEmail: '',
    adminFullName: ''
  })
  const [provisioning, setProvisioning] = useState(false)
  const [provisionResult, setProvisionResult] = useState(null)

  // Usage Statistics state (Super Admin only)
  const [usageStats, setUsageStats] = useState([])
  const [loadingStats, setLoadingStats] = useState(false)

  // Reset data when organization changes to prevent showing stale data
  useEffect(() => {
    if (organizationId) {
      // Clear stale data before fetching new
      setRecentReports([])
      setPendingReports([])
      setAllReports([])
      setAuditLog([])
      setOverviewDocs([])
      setProjectDocuments([])
      setMatInventory([])
      setRecentMatMovements([])
      setPendingTimesheets([])

      if (isReady()) {
        fetchData()
      }
    }
  }, [organizationId])

  useEffect(() => {
    if (!isReady()) return
    if (activeTab === 'approvals') fetchPendingApprovals()
    if (activeTab === 'mats') fetchMatData()
    if (activeTab === 'audit') fetchAuditLog()
    if (activeTab === 'reports') fetchAllReports()
    if (activeTab === 'timesheets') fetchPendingTimesheets()
    if (activeTab === 'stats' && isSuperAdmin) fetchUsageStats()
    if (activeTab === 'setup' && selectedOrgForSetup) fetchGovernanceData(selectedOrgForSetup)
  }, [activeTab, organizationId, selectedOrgForSetup])

  // Fetch document sync stats for Overview tab
  useEffect(() => {
    async function fetchOverviewDocs() {
      if (activeTab !== 'overview' || !organizationId) return

      setLoadingOverviewDocs(true)
      try {
        const { data: vaultDocs } = await supabase
          .from('project_documents')
          .select('id, category, sync_status, is_global, is_current, is_addendum')
          .eq('organization_id', organizationId)
          .eq('is_global', false)
          .or('is_current.is.null,is_current.eq.true')
          .or('is_addendum.is.null,is_addendum.eq.false')

        setOverviewDocs(vaultDocs || [])
      } catch (err) {
        console.error('Error fetching overview docs:', err)
      } finally {
        setLoadingOverviewDocs(false)
      }
    }

    fetchOverviewDocs()
  }, [activeTab, organizationId])

  // Auto-select current organization for Setup tab - always update when org changes
  useEffect(() => {
    if (organizationId) {
      setSelectedOrgForSetup(organizationId)
    }
  }, [organizationId])

  async function fetchData() {
    setLoading(true)
    // Organizations - super admin sees all, others see their org
    const { data: orgs } = await supabase.from('organizations').select('*').order('name')
    setOrganizations(orgs || [])

    // Users - filter by org membership (super admin sees all)
    let usersQuery = supabase.from('user_profiles').select('*, organizations(name)').order('email')
    if (!isSuperAdmin && organizationId) {
      usersQuery = usersQuery.eq('organization_id', organizationId)
    }
    const { data: usersData } = await usersQuery
    setUsers(usersData || [])

    // Fetch inspector profiles to link with users
    let inspectorQuery = supabase.from('inspector_profiles').select('id, user_id, company_name, profile_complete, cleared_to_work')
    inspectorQuery = addOrgFilter(inspectorQuery, true)
    const { data: inspectorProfilesData } = await inspectorQuery
    setInspectorProfiles(inspectorProfilesData || [])

    // Projects - filter by org
    let projectsQuery = supabase.from('projects').select('*, organizations(name)').order('name')
    projectsQuery = addOrgFilter(projectsQuery, true)
    const { data: projectsData } = await projectsQuery
    setProjects(projectsData || [])

    // Fetch recent reports for efficiency metrics (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    let reportsQuery = supabase
      .from('daily_tickets')
      .select('id, date, spread, activity_blocks')
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })
    reportsQuery = addOrgFilter(reportsQuery, true)
    const { data: reportsData } = await reportsQuery
    setRecentReports(reportsData || [])

    setLoading(false)
  }

  // Calculate efficiency metrics from recent reports
  const efficiencyMetrics = useMemo(() => {
    if (!recentReports || recentReports.length === 0) {
      return {
        reliability: { overallScore: 100, status: 'GREEN', icon: '🛡️', label: 'No Data', greenCount: 0, amberCount: 0, redCount: 0 },
        totalBilledHours: 0,
        totalShadowHours: 0,
        totalValueLost: 0,
        inertiaRatio: 100,
        reportCount: 0
      }
    }

    const allBlocks = recentReports.flatMap(r => r.activity_blocks || [])
    const reliability = aggregateReliabilityScore(allBlocks)
    const verification = aggregateEfficiencyVerification(allBlocks)

    let totalBilledHours = 0
    let totalShadowHours = 0
    let totalValueLost = 0

    allBlocks.forEach(block => {
      totalBilledHours += calculateTotalBilledHours(block)
      totalShadowHours += calculateTotalShadowHours(block)
      totalValueLost += calculateValueLost(block, {}, {})
    })

    const inertiaRatio = totalBilledHours > 0 ? (totalShadowHours / totalBilledHours) * 100 : 100

    return {
      reliability,
      verification,
      totalBilledHours,
      totalShadowHours,
      totalValueLost,
      inertiaRatio,
      reportCount: recentReports.length
    }
  }, [recentReports])

  // Calculate document sync stats for the selected organization
  const syncStats = useMemo(() => {
    const vaultDocs = projectDocuments.filter(d => !d.is_global && d.is_current !== false && !d.is_addendum)

    if (vaultDocs.length === 0) {
      return {
        total: 0,
        internal: 0,
        transmitted: 0,
        acknowledged: 0,
        rejected: 0,
        percentages: { internal: 0, transmitted: 0, acknowledged: 0, rejected: 0 }
      }
    }

    const counts = {
      internal: vaultDocs.filter(d => !d.sync_status || d.sync_status === 'internal').length,
      transmitted: vaultDocs.filter(d => d.sync_status === 'transmitted').length,
      acknowledged: vaultDocs.filter(d => d.sync_status === 'acknowledged').length,
      rejected: vaultDocs.filter(d => d.sync_status === 'rejected').length
    }

    const total = vaultDocs.length

    return {
      total,
      ...counts,
      percentages: {
        internal: total > 0 ? Math.round((counts.internal / total) * 100) : 0,
        transmitted: total > 0 ? Math.round((counts.transmitted / total) * 100) : 0,
        acknowledged: total > 0 ? Math.round((counts.acknowledged / total) * 100) : 0,
        rejected: total > 0 ? Math.round((counts.rejected / total) * 100) : 0
      }
    }
  }, [projectDocuments])

  // Calculate document sync stats for Overview tab (uses overviewDocs)
  const overviewSyncStats = useMemo(() => {
    if (overviewDocs.length === 0) {
      return {
        total: 0,
        internal: 0,
        transmitted: 0,
        acknowledged: 0,
        rejected: 0,
        percentages: { internal: 0, transmitted: 0, acknowledged: 0, rejected: 0 }
      }
    }

    const counts = {
      internal: overviewDocs.filter(d => !d.sync_status || d.sync_status === 'internal').length,
      transmitted: overviewDocs.filter(d => d.sync_status === 'transmitted').length,
      acknowledged: overviewDocs.filter(d => d.sync_status === 'acknowledged').length,
      rejected: overviewDocs.filter(d => d.sync_status === 'rejected').length
    }

    const total = overviewDocs.length

    return {
      total,
      ...counts,
      percentages: {
        internal: total > 0 ? Math.round((counts.internal / total) * 100) : 0,
        transmitted: total > 0 ? Math.round((counts.transmitted / total) * 100) : 0,
        acknowledged: total > 0 ? Math.round((counts.acknowledged / total) * 100) : 0,
        rejected: total > 0 ? Math.round((counts.rejected / total) * 100) : 0
      }
    }
  }, [overviewDocs])

  // ==================== INSPECTOR PROFILE MODAL ====================
  async function openProfileModal(profileId) {
    setLoadingProfile(true)
    setShowProfileModal(true)
    try {
      // Load full profile
      const { data: profileData, error: profileError } = await supabase
        .from('inspector_profiles')
        .select('*')
        .eq('id', profileId)
        .single()

      if (profileError) throw profileError
      setSelectedProfile(profileData)

      // Load documents
      const { data: docsData } = await supabase
        .from('inspector_documents')
        .select('*')
        .eq('inspector_profile_id', profileId)
        .order('created_at', { ascending: false })

      setProfileDocuments(docsData || [])
    } catch (err) {
      console.error('Error loading profile:', err)
      alert('Error loading profile: ' + err.message)
    }
    setLoadingProfile(false)
  }

  function getExpiryStatus(expiryDate) {
    if (!expiryDate) return { color: '#6b7280', label: 'No Expiry', bg: '#f3f4f6' }
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) return { color: '#dc2626', bg: '#fee2e2', label: 'EXPIRED' }
    if (daysUntil <= 7) return { color: '#ea580c', bg: '#ffedd5', label: `${daysUntil}d` }
    if (daysUntil <= 30) return { color: '#ca8a04', bg: '#fef9c3', label: `${daysUntil}d` }
    return { color: '#16a34a', bg: '#dcfce7', label: `${daysUntil}d` }
  }

  // ==================== PENDING APPROVALS ====================
  async function fetchPendingApprovals() {
    setLoadingPending(true)
    try {
      // Get all submitted reports
      let statusQuery = supabase
        .from('report_status')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true })
      statusQuery = addOrgFilter(statusQuery, true)
      const { data: statusData, error: statusError } = await statusQuery

      if (statusError) throw statusError

      // Get the actual report data for each
      const reportsWithData = []
      for (const status of (statusData || [])) {
        const { data: ticket } = await supabase
          .from('daily_tickets')
          .select('*')
          .eq('id', status.report_id)
          .single()

        if (ticket) {
          reportsWithData.push({
            ...status,
            ticket
          })
        }
      }

      setPendingReports(reportsWithData)
    } catch (err) {
      console.error('Error fetching pending approvals:', err)
    }
    setLoadingPending(false)
  }

  async function approveReport(reportId) {
    if (!confirm('Approve this report?')) return

    try {
      const now = new Date().toISOString()

      await supabase
        .from('report_status')
        .update({
          status: 'approved',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          review_decision: 'approved',
          updated_at: now
        })
        .eq('report_id', reportId)

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        changed_by: userProfile?.id,
        changed_by_name: userProfile?.full_name || userProfile?.email,
        changed_by_role: userProfile?.role,
        change_type: 'approve',
        organization_id: getOrgId()
      })

      fetchPendingApprovals()
      alert('Report approved')
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error approving report')
    }
  }

  async function requestRevision(reportId, notes) {
    const revisionNotes = notes || prompt('Enter revision notes (what needs to be changed):')
    if (!revisionNotes) return

    try {
      const now = new Date().toISOString()

      await supabase
        .from('report_status')
        .update({
          status: 'revision_requested',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          review_decision: 'revision_requested',
          revision_notes: revisionNotes,
          updated_at: now
        })
        .eq('report_id', reportId)

      // Log to audit
      await supabase.from('report_audit_log').insert({
        report_id: reportId,
        changed_by: userProfile?.id,
        changed_by_name: userProfile?.full_name || userProfile?.email,
        changed_by_role: userProfile?.role,
        change_type: 'revision_request',
        change_reason: revisionNotes
      })

      fetchPendingApprovals()
      alert('Revision requested')
    } catch (err) {
      console.error('Error requesting revision:', err)
      alert('Error requesting revision')
    }
  }

  // ==================== MAT INVENTORY ====================
  async function fetchMatData() {
    setLoadingMats(true)
    try {
      // Get all transactions to calculate inventory
      let matQuery = supabase
        .from('mat_transactions')
        .select('*')
        .order('created_at', { ascending: false })
      matQuery = addOrgFilter(matQuery, true)
      const { data: transactions } = await matQuery

      if (transactions) {
        // Calculate summary
        let rigTotal = 0
        let swampTotal = 0
        const locationMap = {}

        transactions.forEach(tx => {
          const multiplier = (tx.action === 'Deploy' || tx.action === 'Relocate') ? 1 :
                            (tx.action === 'Retrieve' || tx.action === 'Damaged') ? -1 : 0

          if (tx.mat_type === 'Rig Mat') {
            rigTotal += (tx.quantity || 0) * multiplier
          } else if (tx.mat_type === 'Swamp Mat') {
            swampTotal += (tx.quantity || 0) * multiplier
          }

          // Track by location
          if (tx.to_location && multiplier > 0) {
            const key = `${tx.to_location}-${tx.mat_type}`
            if (!locationMap[key]) {
              locationMap[key] = { location: tx.to_location, mat_type: tx.mat_type, count: 0 }
            }
            locationMap[key].count += tx.quantity || 0
          }
          if (tx.from_location && multiplier < 0) {
            const key = `${tx.from_location}-${tx.mat_type}`
            if (locationMap[key]) {
              locationMap[key].count -= tx.quantity || 0
            }
          }
        })

        setMatSummary({ rigMats: rigTotal, swampMats: swampTotal })
        setMatInventory(Object.values(locationMap).filter(item => item.count > 0))
        setRecentMatMovements(transactions.slice(0, 20))
      }
    } catch (err) {
      console.error('Error fetching mat data:', err)
    }
    setLoadingMats(false)
  }

  // ==================== AUDIT LOG ====================
  async function fetchAuditLog() {
    setLoadingAudit(true)
    try {
      let auditQuery = supabase
        .from('report_audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100)
      auditQuery = addOrgFilter(auditQuery, true)
      const { data } = await auditQuery

      setAuditLog(data || [])
    } catch (err) {
      console.error('Error fetching audit log:', err)
    }
    setLoadingAudit(false)
  }

  // ==================== ALL REPORTS ====================
  async function fetchAllReports() {
    setLoadingReports(true)
    try {
      let reportsQuery = supabase
        .from('daily_tickets')
        .select('id, date, inspector_name, spread, pipeline, activity_blocks, pdf_hash, pdf_storage_url, pdf_document_id, pdf_generated_at')
        .order('date', { ascending: false })
        .limit(100)
      reportsQuery = addOrgFilter(reportsQuery, true) // Force filter for selected org
      const { data: reports } = await reportsQuery

      // Get statuses for all reports
      let statusQuery = supabase
        .from('report_status')
        .select('report_id, status')
      statusQuery = addOrgFilter(statusQuery, true) // Force filter for selected org
      const { data: statuses } = await statusQuery

      const statusMap = {}
      ;(statuses || []).forEach(s => { statusMap[s.report_id] = s.status })

      const reportsWithStatus = (reports || []).map(r => ({
        ...r,
        status: statusMap[r.id] || 'draft'
      }))

      setAllReports(reportsWithStatus)
    } catch (err) {
      console.error('Error fetching reports:', err)
    }
    setLoadingReports(false)
  }

  // ==================== TIMESHEET REVIEW QUEUE (Phase 4) ====================
  async function fetchPendingTimesheets() {
    setLoadingTimesheets(true)
    try {
      // Get all submitted timesheets with inspector info
      let timesheetQuery = supabase
        .from('inspector_timesheets')
        .select(`
          *,
          user_profiles:inspector_id (full_name, email),
          inspector_profiles:inspector_id (company_name)
        `)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true })
      timesheetQuery = addOrgFilter(timesheetQuery, true)
      const { data: timesheets, error } = await timesheetQuery

      if (error) throw error
      setPendingTimesheets(timesheets || [])
    } catch (err) {
      console.error('Error fetching pending timesheets:', err)
    }
    setLoadingTimesheets(false)
  }

  // Fetch usage statistics across all organizations (Super Admin only)
  async function fetchUsageStats() {
    if (!isSuperAdmin) return
    setLoadingStats(true)
    try {
      // Get all organizations
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .order('name')

      if (orgsError) throw orgsError

      // For each org, get ticket and report counts plus last activity
      const statsPromises = orgs.map(async (org) => {
        // Count daily_tickets
        const { count: ticketCount } = await supabase
          .from('daily_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)

        // Count daily_reports
        const { count: reportCount } = await supabase
          .from('daily_reports')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)

        // Get most recent activity from daily_tickets
        const { data: lastTicket } = await supabase
          .from('daily_tickets')
          .select('created_at')
          .eq('organization_id', org.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastActive = lastTicket?.created_at || null
        const isActiveRecently = lastActive
          ? (new Date() - new Date(lastActive)) < 24 * 60 * 60 * 1000
          : false

        return {
          ...org,
          ticketCount: ticketCount || 0,
          reportCount: reportCount || 0,
          lastActive,
          isActiveRecently
        }
      })

      const stats = await Promise.all(statsPromises)
      setUsageStats(stats)
    } catch (err) {
      console.error('Error fetching usage stats:', err)
    }
    setLoadingStats(false)
  }

  // Fetch Project Governance data from contract_config table
  async function fetchGovernanceData(orgId) {
    if (!orgId) return

    try {
      // Fetch from contract_config table
      const { data: config, error } = await supabase
        .from('contract_config')
        .select('*')
        .eq('organization_id', orgId)
        .single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows returned

      if (config) {
        setConfigExists(true)
        setGovernanceData({
          contract_number: config.contract_number || '',
          standard_workday: config.standard_workday || 10,
          ap_email: config.ap_email || '',
          start_kp: config.start_kp || '',
          end_kp: config.end_kp || '',
          default_diameter: config.default_diameter || '',
          per_diem_rate: config.per_diem_rate || 0,
          default_pipe_specs: config.default_pipe_specs || {},
          custom_document_fields: config.custom_document_fields || []
        })
      } else {
        setConfigExists(false)
        setGovernanceData({
          contract_number: '',
          standard_workday: 10,
          ap_email: '',
          start_kp: '',
          end_kp: '',
          default_diameter: '',
          per_diem_rate: 0,
          default_pipe_specs: {},
          custom_document_fields: []
        })
      }

      // Fetch transmittals for this organization
      const { data: transmittalData } = await supabase
        .from('transmittals')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      setTransmittals(transmittalData || [])

      // Fetch organization documents (Insurance/WCB)
      const { data: docs } = await supabase
        .from('organization_documents')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      setOrgDocuments(docs || [])

      // Fetch project vault documents
      const { data: vaultDocs } = await supabase
        .from('project_documents')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      setProjectDocuments(vaultDocs || [])

      // Fetch global library documents (technical resources)
      const { data: globalDocs } = await supabase
        .from('project_documents')
        .select('*')
        .eq('is_global', true)
        .in('category', ['api_1169', 'csa_z662', 'pipeline_authority_ref', 'inspector_playbook', 'rules_of_thumb'])
        .order('created_at', { ascending: false })

      setGlobalLibraryDocs(globalDocs || [])
    } catch (err) {
      console.error('Error fetching governance data:', err)
      setConfigExists(false)
      setGovernanceData({
        contract_number: '',
        standard_workday: 10,
        ap_email: '',
        start_kp: '',
        end_kp: '',
        default_diameter: '',
        per_diem_rate: 0,
        default_pipe_specs: {}
      })
      setOrgDocuments([])
      setProjectDocuments([])
      setGlobalLibraryDocs([])
    }
  }

  // Check if ITP has signatures that would need reset
  function itpHasSignatures() {
    const itpDoc = projectDocuments.find(d => d.category === 'itp' && !d.is_addendum)
    return itpDoc?.sign_offs && Object.keys(itpDoc.sign_offs).length > 0
  }

  // Handle file selection for vault upload (checks for ITP signature reset)
  function handleVaultFileSelect(file, category) {
    if (!file) return

    // For ITP with existing signatures, show confirmation prompt
    if (category === 'itp' && itpHasSignatures()) {
      setPendingITPUpload({ file, category })
      setShowITPResetPrompt(true)
      return
    }

    // Otherwise proceed with normal upload
    uploadVaultDocument(file, category, false)
  }

  // Upload document to Project Vault with version control
  async function uploadVaultDocument(file, category, resetSignatures = false) {
    if (!selectedOrgForSetup || !file) return

    setUploadingVaultDoc(category)
    setGovernanceMessage(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${category}_${Date.now()}.${fileExt}`
      const filePath = `project-vault/${selectedOrgForSetup}/${category}/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      // Get current version number for this category (excluding addenda)
      const existingDocs = projectDocuments.filter(d => d.category === category && !d.is_addendum)
      const currentDoc = existingDocs.find(d => d.is_current !== false)
      const maxVersion = Math.max(...existingDocs.map(d => d.version_number || 1), 0)
      const newVersion = maxVersion + 1

      // Mark all previous versions as not current
      if (currentDoc) {
        await supabase
          .from('project_documents')
          .update({ is_current: false })
          .eq('organization_id', selectedOrgForSetup)
          .eq('category', category)
          .eq('is_addendum', false)
      }

      // Prepare new document data (include custom metadata if provided)
      const newDocData = {
        organization_id: selectedOrgForSetup,
        category: category,
        file_name: file.name,
        file_url: urlData.publicUrl,
        version_number: newVersion,
        is_current: true,
        is_addendum: false,
        uploaded_by: userProfile?.id,
        metadata: uploadMetadata[category] || {}
      }

      // Clear metadata for this category after use
      setUploadMetadata(prev => {
        const updated = { ...prev }
        delete updated[category]
        return updated
      })

      // For ITP, handle signature reset
      if (category === 'itp' && resetSignatures) {
        newDocData.sign_offs = {}
      } else if (category === 'itp' && currentDoc?.sign_offs) {
        // Preserve signatures if not resetting
        newDocData.sign_offs = currentDoc.sign_offs
        newDocData.document_hash = currentDoc.document_hash
      }

      // Insert new document record
      const { error: insertError } = await supabase
        .from('project_documents')
        .insert(newDocData)

      if (insertError) throw insertError

      // Refresh documents list
      fetchGovernanceData(selectedOrgForSetup)

      const versionMsg = newVersion > 1 ? ` (Rev ${newVersion - 1})` : ''
      const resetMsg = resetSignatures ? ' Signatures have been reset.' : ''
      setGovernanceMessage({ type: 'success', text: `Document uploaded successfully${versionMsg}!${resetMsg}` })
    } catch (err) {
      console.error('Error uploading vault document:', err)
      setGovernanceMessage({ type: 'error', text: 'Upload failed: ' + err.message })
    }

    setUploadingVaultDoc(null)
  }

  // Handle ITP reset prompt response
  function handleITPResetResponse(resetSignatures) {
    if (pendingITPUpload) {
      uploadVaultDocument(pendingITPUpload.file, pendingITPUpload.category, resetSignatures)
    }
    setShowITPResetPrompt(false)
    setPendingITPUpload(null)
  }

  // Upload addendum/supporting document
  async function uploadAddendum(file, parentDoc) {
    if (!selectedOrgForSetup || !file || !parentDoc) return

    setUploadingAddendum(parentDoc.id)
    setGovernanceMessage(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${parentDoc.category}_addendum_${Date.now()}.${fileExt}`
      const filePath = `project-vault/${selectedOrgForSetup}/${parentDoc.category}/addenda/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      // Count existing addenda for this parent
      const existingAddenda = projectDocuments.filter(d => d.parent_document_id === parentDoc.id)

      // Insert addendum record
      const { error: insertError } = await supabase
        .from('project_documents')
        .insert({
          organization_id: selectedOrgForSetup,
          category: parentDoc.category,
          file_name: file.name,
          file_url: urlData.publicUrl,
          version_number: existingAddenda.length + 1,
          is_current: true,
          is_addendum: true,
          parent_document_id: parentDoc.id,
          uploaded_by: userProfile?.id
        })

      if (insertError) throw insertError

      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: `Supporting document added successfully!` })
    } catch (err) {
      console.error('Error uploading addendum:', err)
      setGovernanceMessage({ type: 'error', text: 'Upload failed: ' + err.message })
    }

    setUploadingAddendum(null)
  }

  // Check if a vault category has a document
  function hasVaultDocument(category) {
    return projectDocuments.some(d => d.category === category && !d.is_addendum && d.is_current !== false)
  }

  // Get current document for a category
  function getVaultDocument(category) {
    // Find current version (is_current=true or most recent if is_current not set)
    const docs = projectDocuments.filter(d => d.category === category && !d.is_addendum)
    return docs.find(d => d.is_current !== false) || docs[0]
  }

  // Get document version history for a category
  function getDocumentHistory(category) {
    return projectDocuments
      .filter(d => d.category === category && !d.is_addendum)
      .sort((a, b) => (b.version_number || 1) - (a.version_number || 1))
  }

  // Get addenda for a document
  function getDocumentAddenda(parentDocId) {
    return projectDocuments
      .filter(d => d.parent_document_id === parentDocId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }

  // Check if document was updated in last 48 hours
  function isRecentlyUpdated(category) {
    const doc = getVaultDocument(category)
    if (!doc) return false
    const uploadTime = new Date(doc.created_at)
    const now = new Date()
    const hoursDiff = (now - uploadTime) / (1000 * 60 * 60)
    return hoursDiff <= 48
  }

  // Open history modal
  function openHistoryModal(category) {
    setSelectedCategoryForHistory(category)
    setShowHistoryModal(true)
  }

  // Check if config is complete (core fields filled)
  function isConfigComplete() {
    return governanceData.standard_workday > 0 &&
           governanceData.start_kp &&
           governanceData.end_kp
  }

  // ITP Sign-off helpers
  function getItpDocument() {
    return projectDocuments.find(d => d.category === 'itp')
  }

  function getItpSignOffs() {
    const itpDoc = getItpDocument()
    return itpDoc?.sign_offs || {}
  }

  function hasItpSignOff(roleKey) {
    const signOffs = getItpSignOffs()
    return !!signOffs[roleKey]?.signed_at
  }

  function isItpFullyApproved() {
    return itpSignOffRoles.every(role => hasItpSignOff(role.key))
  }

  function getItpStatus() {
    const itpDoc = getItpDocument()
    if (!itpDoc) return 'NO_DOCUMENT'
    if (isItpFullyApproved()) return 'ACTIVE'
    return 'STATIONARY'
  }

  // Open signature pad for ITP sign-off
  function initiateItpSignOff(roleKey) {
    const itpDoc = getItpDocument()
    if (!itpDoc) {
      setGovernanceMessage({ type: 'error', text: 'Please upload the ITP document first' })
      return
    }

    const roleInfo = itpSignOffRoles.find(r => r.key === roleKey)
    setSigningRole(roleInfo)
    setShowSignaturePad(true)
  }

  // Generate document hash for verification
  async function generateDocumentHash(itpDoc) {
    const encoder = new TextEncoder()
    const content = `${itpDoc.id}|${itpDoc.file_name}|${itpDoc.file_url}|${itpDoc.created_at}`
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Handle signature save from SignaturePad component
  async function handleSignatureSave(signatureData) {
    const itpDoc = getItpDocument()
    if (!itpDoc || !signingRole) return

    setSavingSignature(true)

    try {
      // 1. Generate document verification hash
      const documentHash = await generateDocumentHash(itpDoc)

      // 2. Upload signature image to private storage bucket
      const fileName = `itp_${itpDoc.id}_${signingRole.key}_${Date.now()}.png`
      const storagePath = `signatures/${selectedOrgForSetup}/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(storagePath, signatureData.blob, {
          contentType: 'image/png',
          upsert: false
        })

      if (uploadError) throw uploadError

      // 3. Get the signed URL for the signature (valid for 1 year)
      const { data: urlData } = await supabase.storage
        .from('signatures')
        .createSignedUrl(storagePath, 31536000) // 1 year expiry

      const signatureUrl = urlData?.signedUrl

      // 4. Update sign_offs JSONB with signature data
      const signOffs = { ...getItpSignOffs() }
      signOffs[signingRole.key] = {
        signed_by: userProfile?.full_name || userProfile?.email || 'Unknown',
        signed_by_id: userProfile?.id,
        signed_at: signatureData.timestamp,
        role_label: signingRole.label,
        signature_url: signatureUrl,
        signature_hash: signatureData.hash,
        document_hash: documentHash
      }

      // 5. Update the project_documents record
      const { error: updateError } = await supabase
        .from('project_documents')
        .update({
          sign_offs: signOffs,
          document_hash: documentHash
        })
        .eq('id', itpDoc.id)

      if (updateError) throw updateError

      // 6. Close modal and refresh
      setShowSignaturePad(false)
      setSigningRole(null)
      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: `${signingRole.label} signature captured and verified!` })

    } catch (err) {
      console.error('Error saving signature:', err)
      setGovernanceMessage({ type: 'error', text: 'Failed to save signature: ' + err.message })
    } finally {
      setSavingSignature(false)
    }
  }

  // Cancel signature
  function cancelSignature() {
    setShowSignaturePad(false)
    setSigningRole(null)
  }

  // Remove ITP sign-off (for corrections)
  async function removeItpSignOff(roleKey) {
    const itpDoc = getItpDocument()
    if (!itpDoc) return

    const signOffs = { ...getItpSignOffs() }
    delete signOffs[roleKey]

    try {
      const { error } = await supabase
        .from('project_documents')
        .update({ sign_offs: signOffs })
        .eq('id', itpDoc.id)

      if (error) throw error

      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: 'Sign-off removed' })
    } catch (err) {
      console.error('Error removing sign-off:', err)
      setGovernanceMessage({ type: 'error', text: 'Failed to remove sign-off: ' + err.message })
    }
  }

  // ==================== DOCUMENT SYNC STATUS FUNCTIONS ====================

  // Get sync status badge color and label
  function getSyncStatusBadge(status) {
    switch (status) {
      case 'transmitted':
        return { color: '#3b82f6', bg: '#dbeafe', label: 'Transmitted' }
      case 'acknowledged':
        return { color: '#16a34a', bg: '#dcfce7', label: 'Acknowledged' }
      case 'rejected':
        return { color: '#dc2626', bg: '#fee2e2', label: 'Rejected' }
      default:
        return { color: '#6b7280', bg: '#f3f4f6', label: 'Internal' }
    }
  }

  // Open sync status modal
  function openSyncModal(doc, initialStatus = 'transmitted') {
    setSelectedDocForSync(doc)
    setSyncForm({
      sync_status: initialStatus,
      owner_transmittal_id: doc.owner_transmittal_id || '',
      owner_comments: doc.owner_comments || ''
    })
    setShowSyncModal(true)
  }

  // Update document sync status
  async function updateSyncStatus() {
    if (!selectedDocForSync) return

    setUpdatingSyncStatus(true)
    setGovernanceMessage(null)

    try {
      const updateData = {
        sync_status: syncForm.sync_status,
        owner_transmittal_id: syncForm.owner_transmittal_id || null,
        owner_comments: syncForm.owner_comments || null
      }

      // Add timestamps based on status
      if (syncForm.sync_status === 'transmitted' && !selectedDocForSync.transmitted_at) {
        updateData.transmitted_at = new Date().toISOString()
      }
      if (syncForm.sync_status === 'acknowledged') {
        updateData.acknowledged_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('project_documents')
        .update(updateData)
        .eq('id', selectedDocForSync.id)

      if (error) throw error

      fetchGovernanceData(selectedOrgForSetup)
      setShowSyncModal(false)
      setSelectedDocForSync(null)

      const statusLabel = getSyncStatusBadge(syncForm.sync_status).label
      setGovernanceMessage({ type: 'success', text: `Document status updated to "${statusLabel}"` })

    } catch (err) {
      console.error('Error updating sync status:', err)
      setGovernanceMessage({ type: 'error', text: 'Failed to update status: ' + err.message })
    } finally {
      setUpdatingSyncStatus(false)
    }
  }

  // Export DC Status Report as CSV
  function exportDCStatusReport() {
    const vaultDocs = projectDocuments.filter(d => !d.is_global && d.is_current !== false && !d.is_addendum)

    if (vaultDocs.length === 0) {
      setGovernanceMessage({ type: 'error', text: 'No documents to export' })
      return
    }

    const headers = 'Category,Filename,Rev,Uploaded_At,Sync_Status,Owner_Transmittal_ID,Transmitted_At,Acknowledged_At,Owner_Comments'
    const rows = vaultDocs.map(doc => {
      const cat = documentVaultCategories.find(c => c.key === doc.category)
      return [
        `"${cat?.label || doc.category}"`,
        `"${doc.file_name}"`,
        doc.version_number || 1,
        doc.uploaded_at ? new Date(doc.uploaded_at).toISOString().split('T')[0] : '',
        doc.sync_status || 'internal',
        `"${doc.owner_transmittal_id || ''}"`,
        doc.transmitted_at ? new Date(doc.transmitted_at).toISOString().split('T')[0] : '',
        doc.acknowledged_at ? new Date(doc.acknowledged_at).toISOString().split('T')[0] : '',
        `"${(doc.owner_comments || '').replace(/"/g, '""')}"`
      ].join(',')
    })

    const org = organizations.find(o => o.id === selectedOrgForSetup)
    const summary = `\n"Report Generated","${new Date().toISOString()}","Organization: ${org?.name || 'N/A'}"`

    const csv = headers + '\n' + rows.join('\n') + summary
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `DC_Status_Report_${org?.slug || 'project'}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)

    setGovernanceMessage({ type: 'success', text: 'DC Status Report exported!' })
  }

  // Check if any documents are rejected (need revision)
  function hasRejectedDocuments() {
    return projectDocuments.some(d => !d.is_global && d.is_current !== false && d.sync_status === 'rejected')
  }

  // Technical Library helpers
  function getLibraryDocument(category) {
    return globalLibraryDocs.find(d => d.category === category)
  }

  function hasLibraryDocument(category) {
    return globalLibraryDocs.some(d => d.category === category)
  }

  // Upload global library document (super_admin only)
  async function uploadLibraryDocument(file, category) {
    if (!isSuperAdmin) {
      setGovernanceMessage({ type: 'error', text: 'Only Super Admins can manage the Technical Library' })
      return
    }

    setUploadingVaultDoc(category)
    setGovernanceMessage(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${category}_${Date.now()}.${fileExt}`
      const filePath = `technical-library/${category}/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      // Get current version number for this category
      const existingDoc = getLibraryDocument(category)
      const newVersion = existingDoc ? (existingDoc.version_number || 1) + 1 : 1

      // If existing doc, update it; otherwise insert new
      if (existingDoc) {
        const { error: updateError } = await supabase
          .from('project_documents')
          .update({
            file_name: file.name,
            file_url: urlData.publicUrl,
            version_number: newVersion,
            uploaded_by: userProfile?.id
          })
          .eq('id', existingDoc.id)

        if (updateError) throw updateError
      } else {
        // Insert as global document (null org_id for global, or use a system org)
        const { error: insertError } = await supabase
          .from('project_documents')
          .insert({
            organization_id: selectedOrgForSetup || organizationId, // Use current org as owner but mark global
            category: category,
            file_name: file.name,
            file_url: urlData.publicUrl,
            version_number: newVersion,
            is_global: true,
            uploaded_by: userProfile?.id
          })

        if (insertError) throw insertError
      }

      // Refresh documents
      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: 'Technical resource uploaded successfully!' })
    } catch (err) {
      console.error('Error uploading library document:', err)
      setGovernanceMessage({ type: 'error', text: 'Upload failed: ' + err.message })
    }

    setUploadingVaultDoc(null)
  }

  // Delete library document (super_admin only)
  async function deleteLibraryDocument(category) {
    if (!isSuperAdmin) return

    const doc = getLibraryDocument(category)
    if (!doc) return

    if (!confirm(`Are you sure you want to remove "${doc.file_name}" from the Technical Library?`)) return

    try {
      const { error } = await supabase
        .from('project_documents')
        .delete()
        .eq('id', doc.id)

      if (error) throw error

      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: 'Document removed from library' })
    } catch (err) {
      console.error('Error deleting library document:', err)
      setGovernanceMessage({ type: 'error', text: 'Failed to remove document: ' + err.message })
    }
  }

  // ==================== CUSTOM DOCUMENT FIELDS (Owner DC) ====================

  // Add a custom field definition
  function addCustomField() {
    const newField = {
      key: `custom_${Date.now()}`,
      label: '',
      required: false
    }
    setGovernanceData(prev => ({
      ...prev,
      custom_document_fields: [...(prev.custom_document_fields || []), newField]
    }))
  }

  // Update a custom field definition
  function updateCustomField(index, updates) {
    setGovernanceData(prev => ({
      ...prev,
      custom_document_fields: prev.custom_document_fields.map((f, i) =>
        i === index ? { ...f, ...updates } : f
      )
    }))
  }

  // Remove a custom field definition
  function removeCustomField(index) {
    setGovernanceData(prev => ({
      ...prev,
      custom_document_fields: prev.custom_document_fields.filter((_, i) => i !== index)
    }))
  }

  // ==================== TRANSMITTAL FUNCTIONS ====================

  // Generate next transmittal number
  function getNextTransmittalNumber() {
    const org = organizations.find(o => o.id === selectedOrgForSetup)
    const prefix = org?.slug?.toUpperCase()?.substring(0, 3) || 'TRN'
    const count = transmittals.length + 1
    return `${prefix}-TR-${String(count).padStart(4, '0')}`
  }

  // Open transmittal modal
  function openTransmittalModal() {
    setTransmittalForm({
      from_name: userProfile?.full_name || '',
      from_title: 'Construction Manager',
      to_name: '',
      to_company: '',
      subject: `Document Transmittal - ${governanceData.contract_number || 'Project Documents'}`,
      notes: '',
      selectedDocIds: []
    })
    setShowTransmittalModal(true)
  }

  // Toggle document selection for transmittal
  function toggleDocForTransmittal(docId) {
    setTransmittalForm(prev => ({
      ...prev,
      selectedDocIds: prev.selectedDocIds.includes(docId)
        ? prev.selectedDocIds.filter(id => id !== docId)
        : [...prev.selectedDocIds, docId]
    }))
  }

  // Generate transmittal PDF and save
  async function generateTransmittal() {
    if (!selectedOrgForSetup || transmittalForm.selectedDocIds.length === 0) {
      setGovernanceMessage({ type: 'error', text: 'Please select at least one document' })
      return
    }

    setGeneratingTransmittal(true)
    setGovernanceMessage(null)

    try {
      const transmittalNumber = getNextTransmittalNumber()
      const org = organizations.find(o => o.id === selectedOrgForSetup)
      const selectedDocs = projectDocuments.filter(d => transmittalForm.selectedDocIds.includes(d.id))

      // Build PDF using jsPDF
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()

      // Header
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('DOCUMENT TRANSMITTAL', 105, 20, { align: 'center' })

      doc.setFontSize(14)
      doc.text(transmittalNumber, 105, 28, { align: 'center' })

      // Transmittal details
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      const startY = 45
      let y = startY

      doc.setFont('helvetica', 'bold')
      doc.text('Date:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(new Date().toLocaleDateString(), 50, y)

      y += 8
      doc.setFont('helvetica', 'bold')
      doc.text('Project:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(org?.name || 'N/A', 50, y)

      y += 8
      doc.setFont('helvetica', 'bold')
      doc.text('Contract:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(governanceData.contract_number || 'N/A', 50, y)

      y += 12
      doc.setFont('helvetica', 'bold')
      doc.text('From:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(`${transmittalForm.from_name}`, 50, y)
      y += 5
      doc.text(`${transmittalForm.from_title}`, 50, y)

      y += 10
      doc.setFont('helvetica', 'bold')
      doc.text('To:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(`${transmittalForm.to_name}`, 50, y)
      if (transmittalForm.to_company) {
        y += 5
        doc.text(`${transmittalForm.to_company}`, 50, y)
      }

      y += 10
      doc.setFont('helvetica', 'bold')
      doc.text('Subject:', 20, y)
      doc.setFont('helvetica', 'normal')
      doc.text(transmittalForm.subject, 50, y)

      // Document manifest table
      y += 15
      doc.setFont('helvetica', 'bold')
      doc.text('DOCUMENTS INCLUDED:', 20, y)

      y += 8
      doc.setFontSize(9)

      // Table header
      doc.setFillColor(240, 240, 240)
      doc.rect(20, y - 4, 170, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.text('#', 22, y)
      doc.text('Document', 32, y)
      doc.text('Rev', 130, y)
      doc.text('Date', 145, y)
      doc.text('Owner Doc #', 165, y)

      y += 8
      doc.setFont('helvetica', 'normal')

      selectedDocs.forEach((docItem, idx) => {
        const metadata = docItem.metadata || {}
        const ownerDocNum = metadata.owner_doc_num || metadata.owner_doc_number || '—'

        doc.text(String(idx + 1), 22, y)
        doc.text(docItem.file_name?.substring(0, 50) || 'Unknown', 32, y)
        doc.text(String(docItem.version_number || 1), 130, y)
        doc.text(docItem.uploaded_at ? new Date(docItem.uploaded_at).toLocaleDateString() : '—', 145, y)
        doc.text(String(ownerDocNum).substring(0, 15), 165, y)
        y += 6

        if (y > 270) {
          doc.addPage()
          y = 20
        }
      })

      // Notes
      if (transmittalForm.notes) {
        y += 10
        doc.setFont('helvetica', 'bold')
        doc.text('Notes:', 20, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        const splitNotes = doc.splitTextToSize(transmittalForm.notes, 170)
        doc.text(splitNotes, 20, y)
      }

      // Footer
      y = 280
      doc.setFontSize(8)
      doc.setTextColor(128)
      doc.text(`Generated: ${new Date().toISOString()}`, 20, y)
      doc.text(`Total Documents: ${selectedDocs.length}`, 105, y, { align: 'center' })

      // Convert to blob
      const pdfBlob = doc.output('blob')

      // Upload to storage
      const fileName = `${transmittalNumber}_${new Date().toISOString().split('T')[0]}.pdf`
      const storagePath = `transmittals/${selectedOrgForSetup}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, pdfBlob, { contentType: 'application/pdf' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath)

      // Save transmittal record
      const { error: insertError } = await supabase
        .from('transmittals')
        .insert({
          organization_id: selectedOrgForSetup,
          transmittal_number: transmittalNumber,
          from_name: transmittalForm.from_name,
          from_title: transmittalForm.from_title,
          to_name: transmittalForm.to_name,
          to_company: transmittalForm.to_company,
          subject: transmittalForm.subject,
          notes: transmittalForm.notes,
          document_ids: transmittalForm.selectedDocIds,
          pdf_url: publicUrl,
          created_by: user?.id
        })

      if (insertError) throw insertError

      // Download PDF
      const link = document.createElement('a')
      link.href = URL.createObjectURL(pdfBlob)
      link.download = fileName
      link.click()

      // Refresh transmittals
      fetchGovernanceData(selectedOrgForSetup)

      setShowTransmittalModal(false)
      setGovernanceMessage({ type: 'success', text: `Transmittal ${transmittalNumber} generated and saved!` })

    } catch (err) {
      console.error('Error generating transmittal:', err)
      setGovernanceMessage({ type: 'error', text: 'Failed to generate transmittal: ' + err.message })
    } finally {
      setGeneratingTransmittal(false)
    }
  }

  // ==================== HANDOVER & CLOSEOUT FUNCTIONS ====================

  // Run handover readiness audit
  async function runHandoverAudit(orgId) {
    if (!orgId) return null

    const audit = {
      blockers: [],
      warnings: [],
      ready: true,
      documents: { governance: [], engineering: [], fieldReports: [], compliance: [] },
      stats: { totalDocuments: 0, totalReports: 0 }
    }

    try {
      // Fetch project documents
      const { data: docs } = await supabase
        .from('project_documents')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_current', true)
        .is('is_addendum', false)

      const projectDocs = docs || []

      // Check critical documents
      const criticalDocs = ['prime_contract', 'scope_of_work', 'itp']
      const engineeringDocs = ['ifc_drawings', 'typical_drawings', 'project_specs', 'weld_procedures']
      const complianceDocs = ['erp', 'emp']

      // Check for critical documents
      for (const cat of criticalDocs) {
        const doc = projectDocs.find(d => d.category === cat)
        if (!doc) {
          audit.blockers.push(`Missing: ${cat.replace(/_/g, ' ').toUpperCase()}`)
          audit.ready = false
        } else {
          audit.documents.governance.push(doc)
        }
      }

      // Check ITP approval status
      const itpDoc = projectDocs.find(d => d.category === 'itp')
      if (itpDoc) {
        const signOffs = itpDoc.sign_offs || {}
        const requiredRoles = ['chief_welding_inspector', 'chief_inspector', 'construction_manager']
        const missingSignOffs = requiredRoles.filter(role => !signOffs[role]?.signed_at)
        if (missingSignOffs.length > 0) {
          audit.blockers.push(`ITP missing signatures: ${missingSignOffs.length} of 3`)
          audit.ready = false
        }
      }

      // Check engineering documents
      for (const cat of engineeringDocs) {
        const doc = projectDocs.find(d => d.category === cat)
        if (!doc) {
          audit.warnings.push(`Missing optional: ${cat.replace(/_/g, ' ')}`)
        } else {
          audit.documents.engineering.push(doc)
        }
      }

      // Check compliance documents
      for (const cat of complianceDocs) {
        const doc = projectDocs.find(d => d.category === cat)
        if (!doc) {
          audit.warnings.push(`Missing compliance: ${cat.replace(/_/g, ' ').toUpperCase()}`)
        } else {
          audit.documents.compliance.push(doc)
        }
      }

      // Fetch daily tickets count
      const { count: ticketCount } = await supabase
        .from('daily_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)

      audit.stats.totalReports = ticketCount || 0
      audit.stats.totalDocuments = projectDocs.length

      if (ticketCount === 0) {
        audit.warnings.push('No daily field reports found')
      }

      // Fetch addenda for field reports section
      const { data: addenda } = await supabase
        .from('project_documents')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_addendum', true)

      audit.documents.fieldReports = addenda || []

    } catch (err) {
      console.error('Error running handover audit:', err)
      audit.blockers.push('Error running audit: ' + err.message)
      audit.ready = false
    }

    return audit
  }

  // Fetch file as blob from URL
  async function fetchFileAsBlob(url) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.blob()
    } catch (err) {
      console.error('Error fetching file:', url, err)
      return null
    }
  }

  // Compute SHA-256 hash of a blob
  async function computeFileHash(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } catch (err) {
      console.error('Error computing hash:', err)
      return 'HASH_ERROR'
    }
  }

  // Generate manifest preview data (for UI and CSV)
  async function generateManifestPreview() {
    if (!selectedOrgForHandover || !handoverAudit) return

    setGeneratingManifest(true)
    const manifestEntries = []

    try {
      const folderMap = {
        governance: '01_Governance',
        engineering: '02_Engineering',
        compliance: '04_Compliance',
        fieldReports: '03_Field_Reports'
      }

      const categoryLabels = {
        itp: 'Inspection & Test Plan',
        specifications: 'Specifications',
        wps: 'Welding Procedure Spec',
        compliance_matrix: 'Compliance Matrix',
        environmental_permits: 'Environmental Permits',
        land_access: 'Land Access',
        safety_plans: 'Safety Plans',
        ndt_procedures: 'NDT Procedures'
      }

      // Process all document categories
      for (const [section, docs] of Object.entries(handoverAudit.documents)) {
        const folder = folderMap[section] || section

        for (const doc of docs) {
          const blob = await fetchFileAsBlob(doc.file_url)
          const hash = blob ? await computeFileHash(blob) : 'FILE_NOT_FOUND'

          manifestEntries.push({
            category: categoryLabels[doc.category] || doc.category,
            folder: folder,
            filename: doc.file_name,
            rev: doc.version_number || 1,
            uploadedAt: doc.uploaded_at ? new Date(doc.uploaded_at).toISOString().split('T')[0] : 'N/A',
            hash: hash,
            metadata: doc.metadata || {}
          })
        }
      }

      setManifestPreview(manifestEntries)
    } catch (err) {
      console.error('Error generating manifest preview:', err)
    } finally {
      setGeneratingManifest(false)
    }
  }

  // Convert manifest data to CSV string
  function manifestToCSV(entries, orgName, customFields = []) {
    // Build dynamic headers based on custom fields
    let headers = 'Category,Folder,Filename,Rev,Uploaded_At,SHA256_Hash'
    customFields.forEach(field => {
      headers += `,"${field.label.replace(/"/g, '""')}"`
    })

    const rows = entries.map(e => {
      let row = `"${e.category}","${e.folder}","${e.filename}",${e.rev},${e.uploadedAt},${e.hash}`
      // Add custom metadata values
      customFields.forEach(field => {
        const value = (e.metadata || {})[field.key] || ''
        row += `,"${String(value).replace(/"/g, '""')}"`
      })
      return row
    })

    // Build summary row with matching column count
    let summary = `\n"SUMMARY","Total Files: ${entries.length}","Generated: ${new Date().toISOString()}","Organization: ${orgName || 'N/A'}","",""`
    customFields.forEach(() => { summary += ',""' })

    return headers + '\n' + rows.join('\n') + summary
  }

  // Generate handover package
  async function generateHandoverPackage() {
    if (!selectedOrgForHandover) return

    setGeneratingPackage(true)
    setHandoverProgress('Running handover audit...')

    try {
      // Run audit first
      const audit = await runHandoverAudit(selectedOrgForHandover)
      setHandoverAudit(audit)

      if (!audit.ready) {
        setHandoverProgress('')
        setGeneratingPackage(false)
        return
      }

      // Get organization name and custom fields
      const org = organizations.find(o => o.id === selectedOrgForHandover)
      const orgName = org?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Project'
      const timestamp = new Date().toISOString().split('T')[0]

      // Fetch custom document fields for this org
      const { data: orgConfig } = await supabase
        .from('contract_config')
        .select('custom_document_fields')
        .eq('organization_id', selectedOrgForHandover)
        .single()

      const customFields = orgConfig?.custom_document_fields || []

      const zip = new JSZip()
      const rootFolder = zip.folder(`Handover_Package_${orgName}_${timestamp}`)

      // Create folder structure
      const governanceFolder = rootFolder.folder('01_Governance')
      const engineeringFolder = rootFolder.folder('02_Engineering')
      const fieldReportsFolder = rootFolder.folder('03_Field_Reports')
      const complianceFolder = rootFolder.folder('04_Compliance')

      let filesAdded = 0
      const totalFiles = audit.documents.governance.length +
                        audit.documents.engineering.length +
                        audit.documents.compliance.length

      // Add governance documents
      setHandoverProgress('Adding governance documents...')
      for (const doc of audit.documents.governance) {
        const blob = await fetchFileAsBlob(doc.file_url)
        if (blob) {
          const fileName = `${doc.category}_v${doc.version_number || 1}_${doc.file_name}`
          governanceFolder.file(fileName, blob)
          filesAdded++
          setHandoverProgress(`Adding files... (${filesAdded}/${totalFiles})`)
        }
      }

      // Add engineering documents
      setHandoverProgress('Adding engineering documents...')
      for (const doc of audit.documents.engineering) {
        const blob = await fetchFileAsBlob(doc.file_url)
        if (blob) {
          const fileName = `${doc.category}_v${doc.version_number || 1}_${doc.file_name}`
          engineeringFolder.file(fileName, blob)
          filesAdded++
          setHandoverProgress(`Adding files... (${filesAdded}/${totalFiles})`)
        }
      }

      // Add compliance documents
      setHandoverProgress('Adding compliance documents...')
      for (const doc of audit.documents.compliance) {
        const blob = await fetchFileAsBlob(doc.file_url)
        if (blob) {
          const fileName = `${doc.category}_v${doc.version_number || 1}_${doc.file_name}`
          complianceFolder.file(fileName, blob)
          filesAdded++
          setHandoverProgress(`Adding files... (${filesAdded}/${totalFiles})`)
        }
      }

      // Fetch and add daily tickets
      setHandoverProgress('Fetching field reports...')
      const { data: tickets } = await supabase
        .from('daily_tickets')
        .select('*')
        .eq('organization_id', selectedOrgForHandover)
        .order('date', { ascending: true })

      if (tickets && tickets.length > 0) {
        // Create a summary CSV of all tickets
        const csvHeader = 'ID,Date,Inspector,Spread,Pipeline,Activities,Status\n'
        const csvRows = tickets.map(t =>
          `${t.id},"${t.date}","${t.inspector_name || ''}","${t.spread || ''}","${t.pipeline || ''}","${(t.activity_blocks || []).map(b => b.activityType).join('; ')}","${t.status || 'draft'}"`
        ).join('\n')
        fieldReportsFolder.file('Daily_Tickets_Summary.csv', csvHeader + csvRows)
      }

      // Add addenda/completion records
      for (const doc of audit.documents.fieldReports) {
        const blob = await fetchFileAsBlob(doc.file_url)
        if (blob) {
          fieldReportsFolder.file(`Addendum_${doc.file_name}`, blob)
        }
      }

      // Generate manifest with SHA-256 hashes
      setHandoverProgress('Generating manifest with file hashes...')

      const folderMap = {
        governance: '01_Governance',
        engineering: '02_Engineering',
        compliance: '04_Compliance',
        fieldReports: '03_Field_Reports'
      }

      const categoryLabels = {
        itp: 'Inspection & Test Plan',
        specifications: 'Specifications',
        wps: 'Welding Procedure Spec',
        compliance_matrix: 'Compliance Matrix',
        environmental_permits: 'Environmental Permits',
        land_access: 'Land Access',
        safety_plans: 'Safety Plans',
        ndt_procedures: 'NDT Procedures'
      }

      const manifestEntries = []
      let hashIndex = 0
      const totalForHash = audit.documents.governance.length +
                          audit.documents.engineering.length +
                          audit.documents.compliance.length +
                          audit.documents.fieldReports.length

      // Compute hashes for all documents
      for (const [section, docs] of Object.entries(audit.documents)) {
        const folder = folderMap[section] || section

        for (const doc of docs) {
          hashIndex++
          setHandoverProgress(`Computing file hashes... (${hashIndex}/${totalForHash})`)

          const blob = await fetchFileAsBlob(doc.file_url)
          const hash = blob ? await computeFileHash(blob) : 'FILE_NOT_FOUND'

          manifestEntries.push({
            category: categoryLabels[doc.category] || doc.category,
            folder: folder,
            filename: doc.file_name,
            rev: doc.version_number || 1,
            uploadedAt: doc.uploaded_at ? new Date(doc.uploaded_at).toISOString().split('T')[0] : 'N/A',
            hash: hash,
            metadata: doc.metadata || {}
          })
        }
      }

      // Generate CSV manifest with custom metadata fields
      const csvManifest = manifestToCSV(manifestEntries, org?.name, customFields)
      rootFolder.file('Project_Manifest.csv', csvManifest)

      // Also keep JSON manifest for programmatic access
      const manifest = {
        generated: new Date().toISOString(),
        organization: org?.name,
        organizationId: selectedOrgForHandover,
        statistics: audit.stats,
        documents: {
          governance: audit.documents.governance.map(d => d.file_name),
          engineering: audit.documents.engineering.map(d => d.file_name),
          compliance: audit.documents.compliance.map(d => d.file_name),
          fieldReports: audit.documents.fieldReports.map(d => d.file_name)
        },
        auditResults: {
          blockers: audit.blockers,
          warnings: audit.warnings
        }
      }
      rootFolder.file('MANIFEST.json', JSON.stringify(manifest, null, 2))

      // Generate ZIP
      setHandoverProgress('Generating ZIP archive...')
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      })

      // Save to browser
      const zipFileName = `Handover_Package_${orgName}_${timestamp}.zip`
      saveAs(zipBlob, zipFileName)

      // Upload to Supabase Storage for permanent record
      setHandoverProgress('Archiving to storage...')
      const storagePath = `handovers/${selectedOrgForHandover}/${zipFileName}`

      const { error: uploadError } = await supabase.storage
        .from('handovers')
        .upload(storagePath, zipBlob, {
          contentType: 'application/zip',
          upsert: false
        })

      if (uploadError) {
        console.warn('Could not archive to storage:', uploadError.message)
      }

      // Refresh handover history
      fetchHandoverHistory(selectedOrgForHandover)

      setHandoverProgress('Complete! Package downloaded.')

    } catch (err) {
      console.error('Error generating handover package:', err)
      setHandoverProgress('Error: ' + err.message)
    } finally {
      setGeneratingPackage(false)
    }
  }

  // Fetch handover history
  async function fetchHandoverHistory(orgId) {
    if (!orgId) return

    try {
      const { data, error } = await supabase.storage
        .from('handovers')
        .list(`handovers/${orgId}`, {
          limit: 20,
          sortBy: { column: 'created_at', order: 'desc' }
        })

      if (error) throw error
      setHandoverHistory(data || [])
    } catch (err) {
      console.error('Error fetching handover history:', err)
      setHandoverHistory([])
    }
  }

  // ==================== END HANDOVER FUNCTIONS ====================

  // Save Project Governance data (upsert to contract_config)
  async function saveGovernanceData() {
    if (!selectedOrgForSetup) {
      setGovernanceMessage({ type: 'error', text: 'Please select a client first' })
      return
    }

    setSavingGovernance(true)
    setGovernanceMessage(null)

    try {
      const configData = {
        organization_id: selectedOrgForSetup,
        contract_number: governanceData.contract_number,
        standard_workday: governanceData.standard_workday,
        ap_email: governanceData.ap_email,
        start_kp: governanceData.start_kp,
        end_kp: governanceData.end_kp,
        default_diameter: governanceData.default_diameter,
        per_diem_rate: governanceData.per_diem_rate,
        default_pipe_specs: governanceData.default_pipe_specs,
        custom_document_fields: governanceData.custom_document_fields
      }

      // Upsert: insert or update based on organization_id
      const { error } = await supabase
        .from('contract_config')
        .upsert(configData, { onConflict: 'organization_id' })

      if (error) throw error

      setConfigExists(true)
      setGovernanceMessage({ type: 'success', text: 'Project configuration saved successfully!' })
    } catch (err) {
      console.error('Error saving governance data:', err)
      setGovernanceMessage({ type: 'error', text: 'Error saving: ' + err.message })
    }

    setSavingGovernance(false)
  }

  // Upload organization document (Insurance/WCB)
  async function uploadOrgDocument(file, docType) {
    if (!selectedOrgForSetup || !file) return

    setUploadingDoc(true)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${selectedOrgForSetup}/${docType}_${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('organization-documents')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('organization-documents')
        .getPublicUrl(fileName)

      // Save document record
      const { error: insertError } = await supabase
        .from('organization_documents')
        .insert({
          organization_id: selectedOrgForSetup,
          document_type: docType,
          file_name: file.name,
          file_path: fileName,
          file_url: urlData.publicUrl,
          uploaded_by: userProfile?.id
        })

      if (insertError) throw insertError

      // Refresh documents list
      fetchGovernanceData(selectedOrgForSetup)
      setGovernanceMessage({ type: 'success', text: `${docType} certificate uploaded successfully!` })
    } catch (err) {
      console.error('Error uploading document:', err)
      setGovernanceMessage({ type: 'error', text: 'Upload failed: ' + err.message })
    }

    setUploadingDoc(false)
  }

  // Provision a new organization (Super Admin only)
  async function provisionOrganization() {
    if (!isSuperAdmin) return
    if (!fleetForm.organizationName || !fleetForm.slug || !fleetForm.adminEmail || !fleetForm.adminFullName) {
      setProvisionResult({ success: false, message: 'All fields are required' })
      return
    }

    setProvisioning(true)
    setProvisionResult(null)

    try {
      // 1. Create the organization
      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: fleetForm.organizationName,
          slug: fleetForm.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        })
        .select()
        .single()

      if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`)

      // 2. Invite the admin user via Supabase Auth
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(fleetForm.adminEmail, {
        data: {
          full_name: fleetForm.adminFullName,
          role: 'admin'
        }
      })

      // If invite fails, we might need to use the edge function approach
      if (inviteError) {
        // Try using edge function for invitation
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: fleetForm.adminEmail,
            fullName: fleetForm.adminFullName,
            role: 'admin',
            organizationId: newOrg.id
          }
        })

        if (edgeError) {
          console.warn('Edge function invite failed:', edgeError)
          // Continue anyway - we'll create the user profile manually
        }
      }

      // 3. Create user_profile for the admin (will be linked when they sign up)
      // For now, log the invitation details
      setProvisionResult({
        success: true,
        message: `Organization "${fleetForm.organizationName}" created successfully!`,
        details: {
          organizationId: newOrg.id,
          slug: newOrg.slug,
          adminEmail: fleetForm.adminEmail,
          note: 'Admin invitation sent. User will be linked on first login.'
        }
      })

      // Reset form
      setFleetForm({
        organizationName: '',
        slug: '',
        adminEmail: '',
        adminFullName: ''
      })

      // Refresh organizations list
      fetchData()

    } catch (err) {
      console.error('Error provisioning organization:', err)
      setProvisionResult({ success: false, message: err.message })
    }

    setProvisioning(false)
  }

  // Auto-generate slug from organization name
  function generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  async function viewTimesheetDetails(timesheet) {
    setSelectedTimesheet(timesheet)
    setShowTimesheetModal(true)
    
    // Fetch the line items for this timesheet
    try {
      const { data: items, error } = await supabase
        .from('inspector_timesheet_items')
        .select(`
          *,
          daily_tickets:daily_ticket_id (date, spread, activity_blocks)
        `)
        .eq('timesheet_id', timesheet.id)
        .order('work_date', { ascending: true })

      if (error) throw error
      setTimesheetItems(items || [])
    } catch (err) {
      console.error('Error fetching timesheet items:', err)
      setTimesheetItems([])
    }
  }

  async function approveTimesheet(timesheetId) {
    if (!confirm('Approve this timesheet for payment?')) return

    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('inspector_timesheets')
        .update({
          status: 'approved',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          updated_at: now
        })
        .eq('id', timesheetId)

      if (error) throw error

      // Log to audit
      await supabase.from('billing_audit_log').insert({
        entity_type: 'inspector_timesheet',
        entity_id: timesheetId.toString(),
        action: 'approve',
        performed_by: userProfile?.id,
        performed_by_name: userProfile?.full_name || userProfile?.email,
        details: { status_change: 'submitted → approved' },
        organization_id: getOrgId()
      })

      // Send email notification
      try {
        await supabase.functions.invoke('timesheet-notification', {
          body: {
            timesheet_id: timesheetId,
            action: 'approved',
            reviewer_name: userProfile?.full_name || userProfile?.email
          }
        })
      } catch (emailErr) {
        console.warn('Email notification failed (timesheet still approved):', emailErr)
      }

      setShowTimesheetModal(false)
      setSelectedTimesheet(null)
      fetchPendingTimesheets()
      alert('Timesheet approved!')
    } catch (err) {
      console.error('Error approving timesheet:', err)
      alert('Error approving timesheet: ' + err.message)
    }
  }

  function openRejectModal(timesheet) {
    setTimesheetToReject(timesheet)
    setRejectNotes('')
    setShowRejectModal(true)
  }

  async function rejectTimesheet() {
    if (!rejectNotes.trim()) {
      alert('Please provide rejection notes explaining what needs to be corrected.')
      return
    }

    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('inspector_timesheets')
        .update({
          status: 'revision_requested',
          reviewed_at: now,
          reviewed_by: userProfile?.id,
          reviewed_by_name: userProfile?.full_name || userProfile?.email,
          revision_notes: rejectNotes,
          updated_at: now
        })
        .eq('id', timesheetToReject.id)

      if (error) throw error

      // Log to audit
      await supabase.from('billing_audit_log').insert({
        entity_type: 'inspector_timesheet',
        entity_id: timesheetToReject.id.toString(),
        action: 'revision_requested',
        performed_by: userProfile?.id,
        performed_by_name: userProfile?.full_name || userProfile?.email,
        details: {
          status_change: 'submitted → revision_requested',
          revision_notes: rejectNotes
        },
        organization_id: getOrgId()
      })

      // Send email notification
      try {
        await supabase.functions.invoke('timesheet-notification', {
          body: {
            timesheet_id: timesheetToReject.id,
            action: 'revision_requested',
            revision_notes: rejectNotes,
            reviewer_name: userProfile?.full_name || userProfile?.email
          }
        })
      } catch (emailErr) {
        console.warn('Email notification failed (revision still requested):', emailErr)
      }

      setShowRejectModal(false)
      setTimesheetToReject(null)
      setRejectNotes('')
      setShowTimesheetModal(false)
      setSelectedTimesheet(null)
      fetchPendingTimesheets()
      alert('Timesheet returned for revision')
    } catch (err) {
      console.error('Error rejecting timesheet:', err)
      alert('Error rejecting timesheet: ' + err.message)
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0)
  }

  // ==================== USER ROLE EDITOR ====================
  async function updateUserRole(userId, newRole) {
    if (!confirm(`Change this user's role to ${newRole}?`)) return

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole, user_role: newRole })
        .eq('id', userId)

      if (error) throw error

      fetchData()
      alert('Role updated successfully')
    } catch (err) {
      console.error('Error updating role:', err)
      alert('Error updating role: ' + err.message)
    }
  }

  async function deleteUser(userId, userEmail) {
    // Prevent deleting yourself
    if (userEmail === userProfile?.email) {
      alert('You cannot delete your own account')
      return
    }
    
    if (!confirm(`Are you sure you want to delete ${userEmail}?\n\nThis action cannot be undone. Any reports they created will be preserved.`)) {
      return
    }
    
    try {
      // Delete from user_profiles first
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)
      
      if (profileError) {
        console.error('Error deleting profile:', profileError)
        throw profileError
      }
      
      // Try to delete from auth.users via Edge Function
      try {
        await supabase.functions.invoke('delete-user', {
          body: { user_id: userId }
        })
      } catch (fnErr) {
        console.warn('Edge function not available - user removed from profiles but may need manual deletion from Auth:', fnErr)
      }
      
      fetchData()
      alert(`User ${userEmail} has been deleted successfully`)
      
    } catch (err) {
      console.error('Error deleting user:', err)
      alert('Error deleting user: ' + err.message)
    }
  }

  async function inviteUser() {
    if (!inviteEmail || !inviteName) {
      alert('Please fill in email and name')
      return
    }

    console.log('📨 Sending invitation to:', inviteEmail)
    console.log('👤 Name:', inviteName, '| Role:', inviteRole)

    setInviting(true)
    try {
      const response = await fetch('https://aatvckalnvojlykfgnmz.supabase.co/functions/v1/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName,
          user_role: inviteRole
        })
      })

      const result = await response.json()
      console.log('📬 Edge function response:', result)

      if (!response.ok) {
        throw new Error(result.error || 'Failed to invite user')
      }

      // Log invitation details
      console.log('📧 Invite result:', {
        email_sent: result.email_sent,
        email_error: result.email_error,
        user_id: result.user_id
      })

      // Always show invitation link in console - make it very visible
      if (result.invitation_link) {
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: green; font-weight: bold')
        console.log('%c🔗 INVITATION LINK - Copy this and send to the user:', 'color: green; font-size: 14px; font-weight: bold')
        console.log('%c' + result.invitation_link, 'color: blue; font-size: 12px')
        console.log('%c═══════════════════════════════════════════════════════════════', 'color: green; font-weight: bold')
      } else {
        console.warn('⚠️ No invitation link was returned from the server')
      }

      // Show appropriate message
      if (result.email_sent) {
        alert(`Invitation sent to ${inviteEmail}!`)
      } else {
        alert(`User created but email not sent: ${result.email_error || 'Unknown error'}. Check console for invitation link.`)
      }

      setShowInviteModal(false)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('inspector')
      fetchData()

    } catch (err) {
      console.error('❌ Error inviting user:', err)
      alert('Error inviting user: ' + err.message)
    }
    setInviting(false)
  }

  async function createOrganization() {
    if (!newOrg.name || !newOrg.slug) {
      alert('Please fill in organization name and slug')
      return
    }
    const { error } = await supabase.from('organizations').insert([{
      name: newOrg.name,
      slug: newOrg.slug.toLowerCase().replace(/\s+/g, '-')
    }])
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setNewOrg({ name: '', slug: '' })
      fetchData()
    }
  }

  async function createProject() {
    if (!newProject.name || !newProject.shortCode || !newProject.organizationId) {
      alert('Please fill in all project fields')
      return
    }
    const { error } = await supabase.from('projects').insert([{
      name: newProject.name,
      short_code: newProject.shortCode,
      organization_id: newProject.organizationId
    }])
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setNewProject({ name: '', shortCode: '', organizationId: '' })
      fetchData()
    }
  }

  // Export Master Production Spreadsheet (CLX2 Format)
  async function exportMasterProduction() {
    const PROJECT_NAME = "Clearwater Pipeline - Demo Project"
    const PROJECT_SHORT = "CWP"
    
    const { data: reports, error } = await supabase
      .from('daily_tickets')
      .select('*')
      .order('date', { ascending: true })

    if (error) {
      alert('Error fetching reports: ' + error.message)
      return
    }

    if (!reports || reports.length === 0) {
      alert('No reports found in database')
      return
    }

    const parseKP = (kpStr) => {
      if (!kpStr) return null
      const str = String(kpStr).trim()
      if (str.includes('+')) {
        const [km, m] = str.split('+')
        return (parseFloat(km) || 0) * 1000 + (parseFloat(m) || 0)
      }
      const num = parseFloat(str)
      if (isNaN(num)) return null
      return num < 100 ? num * 1000 : num
    }

    const formatKP = (metres) => {
      if (metres === null || metres === undefined) return ''
      const km = Math.floor(metres / 1000)
      const m = Math.round(metres % 1000)
      return `${km}+${m.toString().padStart(3, '0')}`
    }

    const phases = [
      'Clearing', 'Access', 'Topsoil', 'Grading', 'Stringing', 'Bending',
      'Welding - Mainline', 'Welding - Tie-in', 'Coating', 'Lowering-in',
      'Backfill', 'Hydro Test', 'Tie-ins', 'Cleanup - Machine', 'Cleanup - Final',
      'HDD', 'HD Bores', 'Other'
    ]

    const headers = ['Date', 'Spread', 'Inspector']
    phases.forEach(phase => {
      headers.push(`${phase} From`, `${phase} To`, `${phase} M`)
    })
    headers.push('Total Metres', 'Labour Hours', 'Equipment Hours', 'Time Lost')

    const dataRows = []
    let grandTotalMetres = 0
    let grandTotalLabour = 0
    let grandTotalEquipment = 0
    let grandTotalTimeLost = 0

    const phaseTotals = {}
    phases.forEach(p => { phaseTotals[p] = { metres: 0, minKP: null, maxKP: null } })

    reports.forEach(report => {
      const row = [report.date || '', report.spread || '', report.inspector_name || '']
      let dayTotalMetres = 0
      let dayLabourHours = 0
      let dayEquipmentHours = 0
      let dayTimeLost = 0

      const blocks = report.activity_blocks || []
      const activityMap = {}
      
      blocks.forEach(block => {
        const actType = block.activityType || 'Other'
        const startM = parseKP(block.startKP)
        const endM = parseKP(block.endKP)
        const metres = (startM !== null && endM !== null) ? Math.abs(endM - startM) : 0

        if (!activityMap[actType]) {
          activityMap[actType] = { startKP: block.startKP, endKP: block.endKP, metres: 0 }
        }
        activityMap[actType].metres += metres

        if (phaseTotals[actType]) {
          phaseTotals[actType].metres += metres
          if (startM !== null && (phaseTotals[actType].minKP === null || startM < phaseTotals[actType].minKP)) {
            phaseTotals[actType].minKP = startM
          }
          if (endM !== null && (phaseTotals[actType].maxKP === null || endM > phaseTotals[actType].maxKP)) {
            phaseTotals[actType].maxKP = endM
          }
        }

        if (block.labourEntries) {
          block.labourEntries.forEach(entry => {
            dayLabourHours += (entry.hours || 0) * (entry.count || 1)
          })
        }
        if (block.equipmentEntries) {
          block.equipmentEntries.forEach(entry => {
            dayEquipmentHours += (entry.hours || 0) * (entry.count || 1)
          })
        }
        dayTimeLost += parseFloat(block.timeLostHours) || 0
      })

      phases.forEach(phase => {
        const data = activityMap[phase]
        if (data) {
          row.push(data.startKP || '', data.endKP || '', data.metres || 0)
          dayTotalMetres += data.metres || 0
        } else {
          row.push('', '', '')
        }
      })

      row.push(dayTotalMetres, dayLabourHours.toFixed(1), dayEquipmentHours.toFixed(1), dayTimeLost.toFixed(1))
      grandTotalMetres += dayTotalMetres
      grandTotalLabour += dayLabourHours
      grandTotalEquipment += dayEquipmentHours
      grandTotalTimeLost += dayTimeLost
      dataRows.push(row)
    })

    const wsData = []
    wsData.push([`${PROJECT_NAME} - MASTER PRODUCTION SPREADSHEET`])
    wsData.push([`Generated: ${new Date().toLocaleString()}`])
    wsData.push([`Total Reports: ${reports.length}`])
    wsData.push([''])
    wsData.push(['=== PRODUCTION SUMMARY ==='])
    wsData.push(['Phase', 'From KP', 'To KP', 'Total Metres'])
    
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        wsData.push([phase, formatKP(data.minKP), formatKP(data.maxKP), data.metres])
      }
    })
    
    wsData.push(['GRAND TOTAL', '', '', grandTotalMetres])
    wsData.push([''])
    wsData.push(['Total Labour Hours:', grandTotalLabour.toFixed(1)])
    wsData.push(['Total Equipment Hours:', grandTotalEquipment.toFixed(1)])
    wsData.push(['Total Time Lost:', grandTotalTimeLost.toFixed(1)])
    wsData.push([''])
    wsData.push(['=== DAILY PRODUCTION DETAIL ==='])
    wsData.push(headers)
    dataRows.forEach(row => wsData.push(row))

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const colWidths = [{ wch: 12 }, { wch: 10 }, { wch: 15 }]
    phases.forEach(() => { colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 8 }) })
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Production')

    const summaryData = [['PHASE PRODUCTION SUMMARY'], [''], ['Phase', 'Start KP', 'End KP', 'Total Metres', 'Reports']]
    phases.forEach(phase => {
      const data = phaseTotals[phase]
      if (data.metres > 0) {
        const reportCount = reports.filter(r => (r.activity_blocks || []).some(b => b.activityType === phase)).length
        summaryData.push([phase, formatKP(data.minKP), formatKP(data.maxKP), data.metres, reportCount])
      }
    })
    summaryData.push([''])
    summaryData.push(['TOTALS', '', '', grandTotalMetres, reports.length])

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `${PROJECT_SHORT}_Master_Production_${today}.xlsx`)
  }

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString()
  }

  if (loading) {
    return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>
  }

  const roleOptions = ['inspector', 'chief_inspector', 'cm', 'pm', 'executive', 'admin', 'super_admin']

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ backgroundColor: '#003366', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>Pipe-Up Admin Portal</h1>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.8 }}>{isSuperAdmin ? 'Super Admin' : 'Admin'} - {userProfile?.organizations?.name || 'All Organizations'}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <AIAgentStatusIcon
            organizationId={organizationId}
            onFlagClick={async (ticketId, flagData) => {
              setLoadingAuditPanel(true)
              try {
                // Fetch the ticket details
                const { data: ticket, error } = await supabase
                  .from('daily_tickets')
                  .select('*')
                  .eq('id', ticketId)
                  .single()

                if (error) throw error

                setAuditPanelData({
                  ticket,
                  flag: flagData
                })
              } catch (err) {
                console.error('Error fetching flagged ticket:', err)
                alert(`Error loading ticket #${ticketId}`)
              } finally {
                setLoadingAuditPanel(false)
              }
            }}
          />
          <TenantSwitcher compact />
          <MasterSwitcher compact />
          <button onClick={() => navigate(orgPath('/inspector-invoicing'))} style={{ padding: '10px 20px', backgroundColor: '#8b5cf6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Inspector Invoicing</button>
          <button onClick={() => navigate(orgPath('/dashboard'))} style={{ padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>CMT Dashboard</button>
          <button onClick={() => navigate(orgPath('/evm-dashboard'))} style={{ padding: '10px 20px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>EVM Dashboard</button>
          <button onClick={() => navigate(orgPath('/reconciliation'))} style={{ padding: '10px 20px', backgroundColor: '#ffc107', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reconciliation</button>
          <button onClick={() => navigate(orgPath('/changes'))} style={{ padding: '10px 20px', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Change Orders</button>
          <button onClick={() => navigate(orgPath('/contractor-lems'))} style={{ padding: '10px 20px', backgroundColor: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Contractor LEMs</button>
          <button onClick={signOut} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #ddd', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
          {[
            'overview', 'approvals', 'efficiency', 'mats', 'audit', 'setup', 'projects', 'users', 'reports',
            ...(isSuperAdmin ? ['fleet', 'stats', 'handover'] : [])
          ].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '15px 25px', border: 'none', backgroundColor: activeTab === tab ? '#003366' : 'transparent', color: activeTab === tab ? 'white' : '#333', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === tab ? 'bold' : 'normal', position: 'relative' }}>
              {tab === 'approvals' ? `Approvals ${pendingReports.length > 0 ? `(${pendingReports.length})` : ''}` :
               tab === 'fleet' ? '🚀 Fleet Onboarding' :
               tab === 'stats' ? '📊 Usage Statistics' :
               tab === 'handover' ? '📦 Project Handover' :
               tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {activeTab === 'overview' && (
          <div>
            <h2>Dashboard Overview</h2>

            {/* System Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Organizations</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#003366' }}>{organizations.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Projects</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#28a745' }}>{projects.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Users</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#17a2b8' }}>{users.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer', border: pendingReports.length > 0 ? '2px solid #ffc107' : 'none' }} onClick={() => setActiveTab('approvals')}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Pending Approvals</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: pendingReports.length > 0 ? '#ffc107' : '#28a745' }}>{pendingReports.length}</p>
              </div>
              <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>Reports (30 days)</h3>
                <p style={{ margin: 0, fontSize: '36px', fontWeight: 'bold', color: '#6f42c1' }}>{efficiencyMetrics.reportCount}</p>
              </div>
            </div>

            {/* Document Sync Health Widget */}
            {organizationId && overviewSyncStats.total > 0 && (
              <div style={{
                marginTop: '20px',
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: overviewSyncStats.rejected > 0 ? '2px solid #dc2626' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#333', fontSize: '16px' }}>📄 Document Sync Health</h3>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    {overviewSyncStats.total} document{overviewSyncStats.total !== 1 ? 's' : ''} in vault
                  </span>
                </div>

                {/* Critical Alerts */}
                {overviewSyncStats.rejected > 0 && (
                  <div style={{
                    marginBottom: '15px',
                    padding: '12px 15px',
                    backgroundColor: '#fee2e2',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '20px' }}>🚨</span>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '14px' }}>
                        Action Required: {overviewSyncStats.rejected} Owner Rejection{overviewSyncStats.rejected !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: '#991b1b' }}>
                        New revision(s) required immediately
                      </div>
                    </div>
                  </div>
                )}

                {overviewSyncStats.internal > 0 && (
                  <div style={{
                    marginBottom: '15px',
                    padding: '10px 15px',
                    backgroundColor: '#fef9c3',
                    borderRadius: '6px',
                    border: '1px solid #fde68a',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '16px' }}>📤</span>
                    <div style={{ fontSize: '13px', color: '#a16207' }}>
                      <strong>{overviewSyncStats.internal}</strong> document{overviewSyncStats.internal !== 1 ? 's' : ''} pending transmittal to Owner
                    </div>
                  </div>
                )}

                {/* Status Bar */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    height: '24px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    backgroundColor: '#e5e7eb'
                  }}>
                    {overviewSyncStats.percentages.internal > 0 && (
                      <div
                        style={{
                          width: `${overviewSyncStats.percentages.internal}%`,
                          backgroundColor: '#fbbf24',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#78350f',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          minWidth: overviewSyncStats.percentages.internal > 10 ? 'auto' : '0'
                        }}
                        title={`Internal: ${overviewSyncStats.internal}`}
                      >
                        {overviewSyncStats.percentages.internal > 10 ? `${overviewSyncStats.percentages.internal}%` : ''}
                      </div>
                    )}
                    {overviewSyncStats.percentages.transmitted > 0 && (
                      <div
                        style={{
                          width: `${overviewSyncStats.percentages.transmitted}%`,
                          backgroundColor: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          minWidth: overviewSyncStats.percentages.transmitted > 10 ? 'auto' : '0'
                        }}
                        title={`Transmitted: ${overviewSyncStats.transmitted}`}
                      >
                        {overviewSyncStats.percentages.transmitted > 10 ? `${overviewSyncStats.percentages.transmitted}%` : ''}
                      </div>
                    )}
                    {overviewSyncStats.percentages.acknowledged > 0 && (
                      <div
                        style={{
                          width: `${overviewSyncStats.percentages.acknowledged}%`,
                          backgroundColor: '#22c55e',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          minWidth: overviewSyncStats.percentages.acknowledged > 10 ? 'auto' : '0'
                        }}
                        title={`Acknowledged: ${overviewSyncStats.acknowledged}`}
                      >
                        {overviewSyncStats.percentages.acknowledged > 10 ? `${overviewSyncStats.percentages.acknowledged}%` : ''}
                      </div>
                    )}
                    {overviewSyncStats.percentages.rejected > 0 && (
                      <div
                        style={{
                          width: `${overviewSyncStats.percentages.rejected}%`,
                          backgroundColor: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          minWidth: overviewSyncStats.percentages.rejected > 10 ? 'auto' : '0'
                        }}
                        title={`Rejected: ${overviewSyncStats.rejected}`}
                      >
                        {overviewSyncStats.percentages.rejected > 10 ? `${overviewSyncStats.percentages.rejected}%` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#fbbf24' }}></div>
                    <span>Internal ({overviewSyncStats.internal})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#3b82f6' }}></div>
                    <span>Transmitted ({overviewSyncStats.transmitted})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#22c55e' }}></div>
                    <span>Acknowledged ({overviewSyncStats.acknowledged})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#ef4444' }}></div>
                    <span>Rejected ({overviewSyncStats.rejected})</span>
                  </div>
                </div>
              </div>
            )}

            {/* Efficiency & Reliability Metrics */}
            <div style={{ marginTop: '30px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ margin: 0, color: '#333' }}>📊 Efficiency & Data Reliability (Last 30 Days)</h3>
              <button
                onClick={metricInfoModal.open}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  backgroundColor: '#e8eaf6',
                  border: '1px solid #1a237e',
                  borderRadius: '15px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: '#1a237e',
                  fontWeight: '600'
                }}
              >
                <span style={{ fontSize: '14px' }}>ℹ️</span> Learn More
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>

              {/* Reliability Shield */}
              <div style={{
                backgroundColor: efficiencyMetrics.reliability?.bgColor || '#d4edda',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: `2px solid ${efficiencyMetrics.reliability?.color || '#28a745'}`,
                textAlign: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('efficiency')}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>
                  {efficiencyMetrics.reliability?.icon || '🛡️'}
                </div>
                <h3 style={{ margin: '0 0 5px 0', color: '#666', fontSize: '12px', textTransform: 'uppercase' }}>Data Reliability</h3>
                <p style={{
                  margin: 0,
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: efficiencyMetrics.reliability?.color || '#28a745'
                }}>
                  {efficiencyMetrics.reliability?.overallScore || 100}%
                </p>
                <p style={{
                  margin: '5px 0 0 0',
                  fontSize: '12px',
                  color: efficiencyMetrics.reliability?.color || '#28a745',
                  fontWeight: 'bold'
                }}>
                  {efficiencyMetrics.reliability?.label || 'Reliable'}
                </p>
              </div>

              {/* Efficiency Score */}
              <div style={{
                backgroundColor: efficiencyMetrics.inertiaRatio >= 90 ? '#d4edda' :
                                efficiencyMetrics.inertiaRatio >= 70 ? '#fff3cd' : '#f8d7da',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                textAlign: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('efficiency')}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>⚡</div>
                <h3 style={{ margin: '0 0 5px 0', color: '#666', fontSize: '12px', textTransform: 'uppercase' }}>Efficiency Score</h3>
                <p style={{
                  margin: 0,
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: efficiencyMetrics.inertiaRatio >= 90 ? '#28a745' :
                         efficiencyMetrics.inertiaRatio >= 70 ? '#856404' : '#dc3545'
                }}>
                  {efficiencyMetrics.inertiaRatio.toFixed(0)}%
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#666' }}>
                  {efficiencyMetrics.totalShadowHours.toFixed(0)} / {efficiencyMetrics.totalBilledHours.toFixed(0)} hrs productive
                </p>
              </div>

              {/* Value Lost */}
              <div style={{
                backgroundColor: '#f8d7da',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                textAlign: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('efficiency')}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>💸</div>
                <h3 style={{ margin: '0 0 5px 0', color: '#666', fontSize: '12px', textTransform: 'uppercase' }}>Value Lost</h3>
                <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#dc3545' }}>
                  ${(efficiencyMetrics.totalValueLost / 1000).toFixed(0)}K
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Due to management drag
                </p>
              </div>

              {/* Block Status Breakdown */}
              <div style={{
                backgroundColor: (efficiencyMetrics.reliability?.redCount || 0) > 0 ? '#f8d7da' :
                                (efficiencyMetrics.reliability?.amberCount || 0) > 0 ? '#fff3cd' : '#d4edda',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                textAlign: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('efficiency')}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>📋</div>
                <h3 style={{ margin: '0 0 5px 0', color: '#666', fontSize: '12px', textTransform: 'uppercase' }}>Block Status</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                      {efficiencyMetrics.reliability?.greenCount || 0}
                    </div>
                    <div style={{ fontSize: '10px', color: '#28a745' }}>Green</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffc107' }}>
                      {efficiencyMetrics.reliability?.amberCount || 0}
                    </div>
                    <div style={{ fontSize: '10px', color: '#856404' }}>Amber</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
                      {efficiencyMetrics.reliability?.redCount || 0}
                    </div>
                    <div style={{ fontSize: '10px', color: '#dc3545' }}>Red</div>
                  </div>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#666' }}>
                  {efficiencyMetrics.reliability?.blockCount || 0} blocks analyzed
                </p>
              </div>

              {/* True Cost */}
              <div style={{
                backgroundColor: '#e2d5f1',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                textAlign: 'center',
                cursor: 'pointer'
              }} onClick={() => setActiveTab('efficiency')}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎯</div>
                <h3 style={{ margin: '0 0 5px 0', color: '#666', fontSize: '12px', textTransform: 'uppercase' }}>True Cost Impact</h3>
                <p style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#6f42c1' }}>
                  ${((efficiencyMetrics.totalValueLost + (efficiencyMetrics.verification?.totalReworkCost || 0)) / 1000).toFixed(0)}K
                </p>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#666' }}>
                  Value lost + rework
                </p>
              </div>
            </div>

            {/* Critical Alerts Section */}
            {efficiencyMetrics.verification?.criticalAlerts?.length > 0 && (
              <div style={{
                marginTop: '20px',
                padding: '15px 20px',
                backgroundColor: '#f8d7da',
                borderRadius: '8px',
                border: '1px solid #f5c6cb'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#721c24' }}>
                  🚨 Critical Alerts ({efficiencyMetrics.verification.criticalAlerts.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {efficiencyMetrics.verification.criticalAlerts.slice(0, 8).map((alert, idx) => (
                    <span key={idx} style={{
                      padding: '4px 12px',
                      backgroundColor: alert.severity === 'critical' ? '#dc3545' : '#ffc107',
                      color: alert.severity === 'critical' ? '#fff' : '#333',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>
                      {alert.type.replace(/_/g, ' ')}: {alert.activityType || 'Unknown'}
                    </span>
                  ))}
                  {efficiencyMetrics.verification.criticalAlerts.length > 8 && (
                    <span style={{ fontSize: '11px', color: '#721c24', alignSelf: 'center' }}>
                      +{efficiencyMetrics.verification.criticalAlerts.length - 8} more
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setActiveTab('efficiency')}
                  style={{
                    marginTop: '10px',
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  View Full Efficiency Report →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== PENDING APPROVALS TAB ==================== */}
        {activeTab === 'approvals' && (
          <div>
            <h2>📋 Pending Approvals</h2>
            <p style={{ color: '#666' }}>Reports submitted by inspectors awaiting your approval</p>
            
            {loadingPending ? (
              <p>Loading...</p>
            ) : pendingReports.length === 0 ? (
              <div style={{ backgroundColor: '#d4edda', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                <p style={{ margin: 0, color: '#155724' }}>✓ No reports pending approval</p>
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginTop: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                      <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Submitted</th>
                      <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReports.map(report => (
                      <tr key={report.report_id}>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.date}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.submitted_by_name || report.ticket?.inspector_name}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{report.ticket?.spread || '-'}</td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                          {(report.ticket?.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>
                          {formatDate(report.submitted_at)}
                        </td>
                        <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <button onClick={() => navigate(`/report?id=${report.report_id}`)} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
                            👁️ View
                          </button>
                          <button onClick={() => approveReport(report.report_id)} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => requestRevision(report.report_id)} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            ↩ Revision
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== SHADOW EFFICIENCY AUDIT TAB ==================== */}
        {activeTab === 'efficiency' && (
          <ShadowAuditDashboard />
        )}

        {/* ==================== MAT INVENTORY TAB ==================== */}
        {activeTab === 'mats' && (
          <div>
            <h2>🛤️ Mat Inventory</h2>
            <p style={{ color: '#666' }}>Current mat deployment across the project</p>

            {loadingMats ? (
              <p>Loading...</p>
            ) : (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' }}>
                  <div style={{ backgroundColor: '#e7f3ff', padding: '25px', borderRadius: '8px', border: '1px solid #b8daff', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#004085', fontSize: '14px' }}>RIG MATS DEPLOYED</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#004085' }}>{matSummary.rigMats}</p>
                  </div>
                  <div style={{ backgroundColor: '#d4edda', padding: '25px', borderRadius: '8px', border: '1px solid #c3e6cb', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#155724', fontSize: '14px' }}>SWAMP MATS DEPLOYED</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#155724' }}>{matSummary.swampMats}</p>
                  </div>
                  <div style={{ backgroundColor: '#fff3cd', padding: '25px', borderRadius: '8px', border: '1px solid #ffc107', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#856404', fontSize: '14px' }}>TOTAL MATS OUT</h3>
                    <p style={{ margin: 0, fontSize: '48px', fontWeight: 'bold', color: '#856404' }}>{matSummary.rigMats + matSummary.swampMats}</p>
                  </div>
                </div>

                {/* Inventory by Location */}
                <div style={{ marginTop: '30px' }}>
                  <h3>Mats by Location</h3>
                  {matInventory.length === 0 ? (
                    <p style={{ color: '#666' }}>No mats currently deployed</p>
                  ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Location</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Mat Type</th>
                            <th style={{ padding: '15px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matInventory.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{item.location}</td>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{item.mat_type}</td>
                              <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent Movements */}
                <div style={{ marginTop: '30px' }}>
                  <h3>Recent Movements</h3>
                  {recentMatMovements.length === 0 ? (
                    <p style={{ color: '#666' }}>No mat movements recorded</p>
                  ) : (
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Date</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Action</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Type</th>
                            <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Qty</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>From</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>To</th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '13px' }}>Crew</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentMatMovements.map((tx, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.report_date || formatDate(tx.created_at).split(',')[0]}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                                <span style={{ 
                                  padding: '3px 8px', 
                                  borderRadius: '3px', 
                                  fontSize: '11px', 
                                  backgroundColor: tx.action === 'Deploy' ? '#28a745' : tx.action === 'Retrieve' ? '#17a2b8' : tx.action === 'Damaged' ? '#dc3545' : '#ffc107',
                                  color: tx.action === 'Retrieve' || tx.action === 'Deploy' || tx.action === 'Damaged' ? 'white' : 'black'
                                }}>
                                  {tx.action}
                                </span>
                              </td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.mat_type}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{tx.quantity}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.from_location || '-'}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.to_location || '-'}</td>
                              <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{tx.crew || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== AUDIT LOG TAB ==================== */}
        {activeTab === 'audit' && (
          <ComplianceAuditTrail />
        )}

        {/* ==================== SETUP TAB ==================== */}
        {activeTab === 'setup' && (
          <div>
            <h2>⚙️ Client Setup</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>Add new clients and import rate sheets</p>
            
            {/* Add New Client Section */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              border: '2px solid #28a745'
            }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#28a745' }}>➕ Add New Client</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Client/Organization Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g., FortisBC Energy Inc." 
                    value={newOrg.name} 
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }} 
                  />
                </div>
                <div style={{ minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Slug (auto-generated)</label>
                  <input 
                    type="text" 
                    placeholder="fortisbc-energy-inc" 
                    value={newOrg.slug} 
                    onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value })} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f8f9fa' }} 
                  />
                </div>
                <button 
                  onClick={async () => {
                    if (!newOrg.name) {
                      alert('Please enter a client name')
                      return
                    }
                    const { error } = await supabase.from('organizations').insert([{
                      name: newOrg.name,
                      slug: newOrg.slug || newOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                    }])
                    if (error) {
                      alert('Error creating client: ' + error.message)
                    } else {
                      alert(`✅ Client "${newOrg.name}" created successfully!`)
                      setNewOrg({ name: '', slug: '' })
                      fetchData()
                    }
                  }} 
                  style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '42px' }}
                >
                  ➕ Add Client
                </button>
              </div>
              <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                After adding a client, select them below to import their labour and equipment rates.
              </p>
            </div>

            {/* Organization Selector */}
            <div style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <label style={{ fontWeight: '600', marginRight: '15px', fontSize: '16px' }}>
                Select Client for Rate Import:
              </label>
              <select 
                value={selectedOrgForSetup}
                onChange={(e) => setSelectedOrgForSetup(e.target.value)}
                style={{ 
                  padding: '10px 15px', 
                  borderRadius: '4px', 
                  border: '1px solid #ddd', 
                  minWidth: '350px',
                  fontSize: '15px'
                }}
              >
                <option value="">-- Select Client --</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              {!selectedOrgForSetup && (
                <p style={{ color: '#dc3545', marginTop: '10px', fontSize: '14px' }}>
                  ⚠️ Please select a client before configuring settings
                </p>
              )}
            </div>

            {/* Rate Import Component */}
            <RateImport
              organizationId={selectedOrgForSetup}
              organizationName={organizations.find(o => o.id === selectedOrgForSetup)?.name || ''}
              onComplete={(count) => {
                alert(`Successfully imported ${count} rates!`)
              }}
            />

            {/* Project Governance Section - Below Rate Import */}
            {selectedOrgForSetup && (
              <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                marginTop: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: '2px solid #28a745'
              }}>
                {/* Header with Status Indicator */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, color: '#28a745' }}>📋 Project Governance</h3>
                  <span style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: isConfigComplete() ? '#d4edda' : '#fff3cd',
                    color: isConfigComplete() ? '#155724' : '#856404',
                    border: `1px solid ${isConfigComplete() ? '#c3e6cb' : '#ffeeba'}`
                  }}>
                    {isConfigComplete() ? '✓ Config Complete' : '⚠ Config Incomplete'}
                  </span>
                </div>

                {governanceMessage && (
                  <div style={{
                    padding: '12px',
                    borderRadius: '4px',
                    marginBottom: '20px',
                    backgroundColor: governanceMessage.type === 'success' ? '#d4edda' : '#f8d7da',
                    color: governanceMessage.type === 'success' ? '#155724' : '#721c24',
                    border: `1px solid ${governanceMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
                  }}>
                    {governanceMessage.text}
                  </div>
                )}

                {/* Contract Details Row */}
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      Standard Workday *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={governanceData.standard_workday}
                      onChange={(e) => setGovernanceData({ ...governanceData, standard_workday: parseFloat(e.target.value) || 10 })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '10px', color: '#666' }}>hours</span>
                  </div>
                  <div style={{ flex: 2, minWidth: '180px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      Contract Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., CON-2026-001"
                      value={governanceData.contract_number}
                      onChange={(e) => setGovernanceData({ ...governanceData, contract_number: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      AP Email (Accounts Payable)
                    </label>
                    <input
                      type="email"
                      placeholder="ap@client.com"
                      value={governanceData.ap_email}
                      onChange={(e) => setGovernanceData({ ...governanceData, ap_email: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* Project Boundaries & Specs Row */}
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <div style={{ minWidth: '130px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      Start KP *
                    </label>
                    <input
                      type="text"
                      placeholder="0+000"
                      value={governanceData.start_kp}
                      onChange={(e) => setGovernanceData({ ...governanceData, start_kp: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ minWidth: '130px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      End KP *
                    </label>
                    <input
                      type="text"
                      placeholder="47+000"
                      value={governanceData.end_kp}
                      onChange={(e) => setGovernanceData({ ...governanceData, end_kp: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      Default Diameter
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., NPS 24"
                      value={governanceData.default_diameter}
                      onChange={(e) => setGovernanceData({ ...governanceData, default_diameter: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ minWidth: '140px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>
                      Per Diem Rate
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={governanceData.per_diem_rate}
                      onChange={(e) => setGovernanceData({ ...governanceData, per_diem_rate: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '10px', color: '#666' }}>$/day</span>
                  </div>
                </div>

                {/* Document Upload Section */}
                <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '15px', color: '#374151' }}>
                    📄 Document Upload (Insurance & WCB Certificates)
                  </label>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '6px' }}>Insurance Certificate</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          if (e.target.files[0]) uploadOrgDocument(e.target.files[0], 'Insurance')
                        }}
                        disabled={uploadingDoc}
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '6px' }}>WCB Certificate</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          if (e.target.files[0]) uploadOrgDocument(e.target.files[0], 'WCB')
                        }}
                        disabled={uploadingDoc}
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                  </div>
                  {uploadingDoc && <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#666' }}>⏳ Uploading...</p>}

                  {/* Existing Documents */}
                  {orgDocuments.length > 0 && (
                    <div style={{ marginTop: '15px' }}>
                      <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>Uploaded Documents:</p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {orgDocuments.map(doc => (
                          <a
                            key={doc.id}
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              backgroundColor: doc.document_type === 'Insurance' ? '#17a2b8' : '#28a745',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '12px',
                              textDecoration: 'none'
                            }}
                          >
                            📄 {doc.document_type} - {doc.file_name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ==================== PROJECT DOCUMENT VAULT ==================== */}
                <div style={{
                  marginBottom: '20px',
                  padding: '20px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  border: '2px solid #28a745'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h4 style={{ margin: 0, color: '#28a745' }}>📚 Project Document Vault</h4>
                      {hasRejectedDocuments() && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          animation: 'pulse 2s infinite'
                        }}>
                          ⚠️ REVISION REQUIRED
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        onClick={exportDCStatusReport}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                        title="Export DC Status Report"
                      >
                        📊 DC Report
                      </button>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        backgroundColor: documentVaultCategories.every(cat => hasVaultDocument(cat.key)) ? '#d4edda' : '#fff3cd',
                        color: documentVaultCategories.every(cat => hasVaultDocument(cat.key)) ? '#155724' : '#856404'
                      }}>
                        {projectDocuments.filter(d => !d.is_global && d.is_current !== false).length} / {documentVaultCategories.length} Documents
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                    {documentVaultCategories.map(cat => {
                      const doc = getVaultDocument(cat.key)
                      const hasDoc = !!doc
                      const history = getDocumentHistory(cat.key)
                      const addenda = doc ? getDocumentAddenda(doc.id) : []
                      const recentlyUpdated = isRecentlyUpdated(cat.key)
                      return (
                        <div
                          key={cat.key}
                          style={{
                            padding: '15px',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            border: `2px solid ${hasDoc ? '#28a745' : '#dc3545'}`,
                            position: 'relative'
                          }}
                        >
                          {/* Traffic Light Status */}
                          <div style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            backgroundColor: hasDoc ? '#28a745' : '#dc3545',
                            boxShadow: hasDoc ? '0 0 6px #28a745' : '0 0 6px #dc3545'
                          }} title={hasDoc ? 'Document uploaded' : 'Missing document'} />

                          {/* Updated Badge */}
                          {recentlyUpdated && (
                            <div style={{
                              position: 'absolute',
                              top: '-8px',
                              left: '10px',
                              padding: '2px 8px',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              borderRadius: '10px',
                              fontSize: '9px',
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                              UPDATED
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '20px' }}>{cat.icon}</span>
                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>{cat.label}</span>
                          </div>

                          {hasDoc ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                <a
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    backgroundColor: doc.sync_status === 'rejected' ? '#dc2626' : '#28a745',
                                    color: 'white',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    textDecoration: 'none'
                                  }}
                                >
                                  📄 {doc.file_name}
                                </a>

                                {/* Sync Status Badge */}
                                <span
                                  onClick={() => openSyncModal(doc, doc.sync_status || 'internal')}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '9px',
                                    fontWeight: 'bold',
                                    backgroundColor: getSyncStatusBadge(doc.sync_status).bg,
                                    color: getSyncStatusBadge(doc.sync_status).color,
                                    cursor: 'pointer',
                                    border: `1px solid ${getSyncStatusBadge(doc.sync_status).color}`
                                  }}
                                  title="Click to update sync status"
                                >
                                  {getSyncStatusBadge(doc.sync_status).label}
                                </span>

                                {doc.owner_transmittal_id && (
                                  <span style={{ fontSize: '9px', color: '#6b7280' }}>
                                    TR# {doc.owner_transmittal_id}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px' }}>
                                Rev {(doc.version_number || 1) - 1} • {new Date(doc.created_at).toLocaleDateString()}
                                {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                                  <span style={{ marginLeft: '8px', color: '#d97706' }}>
                                    {Object.entries(doc.metadata).map(([k, v]) => v ? `${k}: ${v}` : null).filter(Boolean).join(' | ')}
                                  </span>
                                )}
                                {history.length > 1 && (
                                  <button
                                    onClick={() => openHistoryModal(cat.key)}
                                    style={{
                                      marginLeft: '8px',
                                      padding: '2px 6px',
                                      fontSize: '9px',
                                      backgroundColor: '#6c757d',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    History ({history.length})
                                  </button>
                                )}
                              </div>

                              {/* Addenda List */}
                              {addenda.length > 0 && (
                                <div style={{ marginBottom: '8px', paddingLeft: '10px', borderLeft: '2px solid #dee2e6' }}>
                                  <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Supporting Documents:</div>
                                  {addenda.map((add, idx) => (
                                    <a
                                      key={add.id}
                                      href={add.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'block',
                                        fontSize: '10px',
                                        color: '#007bff',
                                        marginBottom: '2px'
                                      }}
                                    >
                                      └ {add.file_name}
                                    </a>
                                  ))}
                                </div>
                              )}

                              {/* Custom metadata fields for replacement uploads */}
                              {(governanceData.custom_document_fields || []).length > 0 && (
                                <div style={{ marginBottom: '8px', padding: '6px', backgroundColor: '#fffbeb', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#d97706', marginBottom: '4px' }}>Update DC Metadata:</div>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {governanceData.custom_document_fields.map(field => (
                                      <input
                                        key={field.key}
                                        type="text"
                                        placeholder={field.label}
                                        value={(uploadMetadata[cat.key] || {})[field.key] || ''}
                                        onChange={(e) => setUploadMetadata(prev => ({
                                          ...prev,
                                          [cat.key]: { ...(prev[cat.key] || {}), [field.key]: e.target.value }
                                        }))}
                                        style={{
                                          padding: '3px 6px',
                                          borderRadius: '3px',
                                          border: '1px solid #d1d5db',
                                          fontSize: '10px',
                                          width: '120px'
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <label style={{
                                  fontSize: '11px',
                                  color: '#666',
                                  cursor: 'pointer'
                                }}>
                                  <span style={{ textDecoration: 'underline' }}>Replace</span>
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
                                    onChange={(e) => {
                                      if (e.target.files[0]) handleVaultFileSelect(e.target.files[0], cat.key)
                                    }}
                                    disabled={uploadingVaultDoc === cat.key}
                                    style={{ display: 'none' }}
                                  />
                                </label>

                                {/* Add Supporting Document button */}
                                {cat.supportsAddenda && (
                                  <label style={{
                                    fontSize: '11px',
                                    color: '#007bff',
                                    cursor: uploadingAddendum === doc.id ? 'not-allowed' : 'pointer'
                                  }}>
                                    <span style={{ textDecoration: 'underline' }}>
                                      {uploadingAddendum === doc.id ? '⏳...' : '+ Add Supporting Doc'}
                                    </span>
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
                                      onChange={(e) => {
                                        if (e.target.files[0]) uploadAddendum(e.target.files[0], doc)
                                      }}
                                      disabled={uploadingAddendum === doc.id}
                                      style={{ display: 'none' }}
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p style={{ fontSize: '11px', color: '#dc3545', margin: '0 0 10px 0' }}>
                                ⚠️ No document uploaded
                              </p>

                              {/* Custom metadata fields for Owner DC */}
                              {(governanceData.custom_document_fields || []).length > 0 && (
                                <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#fffbeb', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#d97706', marginBottom: '6px' }}>Owner DC Metadata:</div>
                                  {governanceData.custom_document_fields.map(field => (
                                    <div key={field.key} style={{ marginBottom: '4px' }}>
                                      <input
                                        type="text"
                                        placeholder={field.label + (field.required ? ' *' : '')}
                                        value={(uploadMetadata[cat.key] || {})[field.key] || ''}
                                        onChange={(e) => setUploadMetadata(prev => ({
                                          ...prev,
                                          [cat.key]: { ...(prev[cat.key] || {}), [field.key]: e.target.value }
                                        }))}
                                        style={{
                                          width: '100%',
                                          padding: '4px 8px',
                                          borderRadius: '3px',
                                          border: '1px solid #d1d5db',
                                          fontSize: '11px'
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}

                              <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                backgroundColor: '#007bff',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: uploadingVaultDoc === cat.key ? 'not-allowed' : 'pointer',
                                opacity: uploadingVaultDoc === cat.key ? 0.6 : 1
                              }}>
                                {uploadingVaultDoc === cat.key ? '⏳ Uploading...' : '📤 Upload Document'}
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.dwg"
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleVaultFileSelect(e.target.files[0], cat.key)
                                  }}
                                  disabled={uploadingVaultDoc === cat.key}
                                  style={{ display: 'none' }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <p style={{ margin: '15px 0 0', fontSize: '11px', color: '#666' }}>
                    Accepted formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, DWG
                  </p>
                </div>

                {/* ==================== ITP BLUEPRINT & COMPLETION ==================== */}
                {getItpDocument() && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '20px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: `3px solid ${isItpFullyApproved() ? '#28a745' : '#ffc107'}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}>
                    {/* ===== ITP BLUEPRINT (THE PLAN) ===== */}
                    <div style={{ marginBottom: '25px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '15px'
                      }}>
                        <span style={{ fontSize: '24px' }}>📋</span>
                        <div>
                          <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px' }}>
                            ITP Blueprint
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                            The Inspection & Test Plan - requires Pre-Construction Approval
                          </p>
                        </div>
                      </div>

                      {/* Approval Status Banner */}
                      <div style={{
                        padding: '15px 20px',
                        marginBottom: '20px',
                        borderRadius: '6px',
                        backgroundColor: isItpFullyApproved() ? '#d4edda' : '#fff3cd',
                        border: `2px solid ${isItpFullyApproved() ? '#28a745' : '#ffc107'}`,
                        textAlign: 'center'
                      }}>
                        <div style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: isItpFullyApproved() ? '#155724' : '#856404',
                          marginBottom: '5px'
                        }}>
                          {isItpFullyApproved() ? (
                            <>🟢 APPROVED FOR CONSTRUCTION</>
                          ) : (
                            <>🟡 PENDING APPROVAL - NOT READY FOR CONSTRUCTION</>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: isItpFullyApproved() ? '#155724' : '#856404' }}>
                          {isItpFullyApproved()
                            ? 'All required pre-construction approvals have been captured. Construction may proceed.'
                            : 'ITP Blueprint requires approval from all three roles before construction can begin.'
                          }
                        </div>
                      </div>

                      <h4 style={{ margin: '0 0 15px 0', color: '#374151' }}>
                        ✅ Pre-Construction Approval Matrix
                      </h4>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                      {itpSignOffRoles.map(role => {
                        const signOff = getItpSignOffs()[role.key]
                        const isSigned = !!signOff?.signed_at
                        return (
                          <div
                            key={role.key}
                            style={{
                              padding: '15px',
                              borderRadius: '8px',
                              backgroundColor: isSigned ? '#d4edda' : '#fff3cd',
                              border: `2px solid ${isSigned ? '#28a745' : '#ffc107'}`
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '10px'
                            }}>
                              <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#374151' }}>
                                {role.label}
                              </span>
                              <span style={{
                                display: 'inline-block',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: isSigned ? '#28a745' : '#ffc107',
                                color: 'white',
                                fontSize: '12px',
                                textAlign: 'center',
                                lineHeight: '20px',
                                fontWeight: 'bold'
                              }}>
                                {isSigned ? '✓' : '!'}
                              </span>
                            </div>

                            {isSigned ? (
                              <div>
                                {/* Signature Image */}
                                {signOff.signature_url && (
                                  <div style={{
                                    marginBottom: '8px',
                                    padding: '5px',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #c3e6cb'
                                  }}>
                                    <img
                                      src={signOff.signature_url}
                                      alt={`${signOff.signed_by}'s signature`}
                                      style={{
                                        maxWidth: '100%',
                                        maxHeight: '60px',
                                        display: 'block',
                                        margin: '0 auto'
                                      }}
                                    />
                                  </div>
                                )}

                                {/* Verified Badge */}
                                {signOff.signature_hash && (
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 8px',
                                    backgroundColor: '#155724',
                                    color: 'white',
                                    borderRadius: '12px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    marginBottom: '6px'
                                  }}>
                                    🔒 VERIFIED
                                  </div>
                                )}

                                <div style={{ fontSize: '12px', color: '#155724', marginBottom: '3px' }}>
                                  ✓ Signed by: {signOff.signed_by}
                                </div>
                                <div style={{ fontSize: '10px', color: '#666' }}>
                                  {new Date(signOff.signed_at).toLocaleString()}
                                </div>

                                {/* Hash preview for audit */}
                                {signOff.signature_hash && (
                                  <div style={{ fontSize: '9px', color: '#999', marginTop: '4px', wordBreak: 'break-all' }}>
                                    Hash: {signOff.signature_hash.substring(0, 16)}...
                                  </div>
                                )}

                                {(isSuperAdmin || userProfile?.role === 'admin') && (
                                  <button
                                    onClick={() => removeItpSignOff(role.key)}
                                    style={{
                                      marginTop: '8px',
                                      padding: '4px 10px',
                                      fontSize: '10px',
                                      backgroundColor: '#dc3545',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Remove Sign-off
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: '12px', color: '#856404', marginBottom: '10px' }}>
                                  ⚠️ Awaiting signature
                                </div>
                                <button
                                  onClick={() => initiateItpSignOff(role.key)}
                                  style={{
                                    padding: '8px 16px',
                                    fontSize: '12px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  Sign as {role.shortLabel}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <p style={{ margin: '15px 0 0', fontSize: '11px', color: '#666' }}>
                      Digital signatures are cryptographically verified with SHA-256 hashes and stored securely for audit purposes.
                    </p>
                    </div>
                    {/* ===== END ITP BLUEPRINT ===== */}

                    {/* ===== ITP COMPLETION RECORDS ===== */}
                    <div style={{
                      marginTop: '25px',
                      paddingTop: '20px',
                      borderTop: '2px dashed #dee2e6'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '15px'
                      }}>
                        <span style={{ fontSize: '24px' }}>📁</span>
                        <div>
                          <h3 style={{ margin: 0, color: '#1f2937', fontSize: '18px' }}>
                            ITP Completion Records
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#6b7280' }}>
                            Supporting documents and completion records - do not affect Blueprint approval
                          </p>
                        </div>
                      </div>

                      {/* Addenda List */}
                      {(() => {
                        const itpDoc = getItpDocument()
                        const addenda = itpDoc ? getDocumentAddenda(itpDoc.id) : []
                        return (
                          <div style={{
                            backgroundColor: '#f8f9fa',
                            borderRadius: '6px',
                            padding: '15px'
                          }}>
                            {addenda.length > 0 ? (
                              <div style={{ marginBottom: '15px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#374151', marginBottom: '10px' }}>
                                  Supporting Documents ({addenda.length})
                                </div>
                                {addenda.map((add, idx) => (
                                  <div key={add.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    marginBottom: '6px',
                                    border: '1px solid #e5e7eb'
                                  }}>
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: '500' }}>{add.file_name}</div>
                                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                                        Added: {new Date(add.created_at).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <a
                                      href={add.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        padding: '4px 10px',
                                        backgroundColor: '#3b82f6',
                                        color: 'white',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        textDecoration: 'none'
                                      }}
                                    >
                                      View
                                    </a>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 15px 0' }}>
                                No supporting documents added yet.
                              </p>
                            )}

                            {/* Add Supporting Document Button */}
                            {itpDoc && (
                              <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                backgroundColor: '#6366f1',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: uploadingAddendum === itpDoc.id ? 'not-allowed' : 'pointer',
                                opacity: uploadingAddendum === itpDoc.id ? 0.6 : 1
                              }}>
                                {uploadingAddendum === itpDoc.id ? '⏳ Uploading...' : '➕ Add Completion Record'}
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                                  onChange={(e) => {
                                    if (e.target.files[0]) uploadAddendum(e.target.files[0], itpDoc)
                                  }}
                                  disabled={uploadingAddendum === itpDoc.id}
                                  style={{ display: 'none' }}
                                />
                              </label>
                            )}

                            <p style={{ margin: '10px 0 0', fontSize: '10px', color: '#9ca3af' }}>
                              Add test results, inspection records, and other completion documentation here.
                              These do not reset the Blueprint approval status.
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                    {/* ===== END ITP COMPLETION RECORDS ===== */}
                  </div>
                )}

                {/* ITP Upload Prompt if no document */}
                {!getItpDocument() && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '20px',
                    backgroundColor: '#f8d7da',
                    borderRadius: '8px',
                    border: '2px solid #dc3545',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#721c24', marginBottom: '10px' }}>
                      🚨 No Inspection & Test Plan (ITP) Uploaded
                    </div>
                    <div style={{ fontSize: '13px', color: '#721c24' }}>
                      Upload the ITP document in the Project Document Vault above to enable the approval workflow.
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={saveGovernanceData}
                  disabled={savingGovernance}
                  style={{
                    padding: '12px 30px',
                    backgroundColor: savingGovernance ? '#9ca3af' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: savingGovernance ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  {savingGovernance ? '⏳ Saving...' : '💾 Save Configuration'}
                </button>
              </div>
            )}

            {/* ==================== OWNER DOCUMENT CONTROL (DC) FIELDS ==================== */}
            {selectedOrgForSetup && (
              <div style={{
                marginTop: '30px',
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: '2px solid #f59e0b'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#d97706' }}>🏷️ Owner Document Control Fields</h3>
                  <button
                    onClick={addCustomField}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    + Add Field
                  </button>
                </div>

                <p style={{ color: '#666', fontSize: '12px', margin: '0 0 15px 0' }}>
                  Define custom metadata fields that the Owner's Document Control system requires.
                  These fields will appear on every document upload so you can tag files with the Owner's specific IDs.
                </p>

                {(governanceData.custom_document_fields || []).length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
                    No custom fields defined. Click "+ Add Field" to create fields like "Owner Doc Number" or "WBS Code".
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {governanceData.custom_document_fields.map((field, idx) => (
                      <div key={field.key} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px',
                        backgroundColor: '#fffbeb',
                        borderRadius: '6px',
                        border: '1px solid #fde68a'
                      }}>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateCustomField(idx, { label: e.target.value })}
                          placeholder="Field Label (e.g., Owner Doc Number)"
                          style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            fontSize: '13px'
                          }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#666' }}>
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateCustomField(idx, { required: e.target.checked })}
                          />
                          Required
                        </label>
                        <button
                          onClick={() => removeCustomField(idx)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p style={{ color: '#92400e', fontSize: '11px', marginTop: '10px' }}>
                  💡 Remember to click "Save Configuration" to save your custom fields.
                </p>
              </div>
            )}

            {/* ==================== TRANSMITTAL GENERATOR ==================== */}
            {selectedOrgForSetup && projectDocuments.length > 0 && (
              <div style={{
                marginTop: '30px',
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: '2px solid #8b5cf6'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: '#7c3aed' }}>📨 Document Transmittals</h3>
                  <button
                    onClick={openTransmittalModal}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}
                  >
                    📄 Create Transmittal
                  </button>
                </div>

                <p style={{ color: '#666', fontSize: '12px', margin: '0 0 15px 0' }}>
                  Generate formal PDF cover letters for batches of files to send to the Owner's Document Control.
                </p>

                {transmittals.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f3ff' }}>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd6fe' }}>Transmittal #</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd6fe' }}>Date</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd6fe' }}>To</th>
                          <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #ddd6fe' }}>Docs</th>
                          <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #ddd6fe' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transmittals.slice(0, 5).map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 'bold' }}>{t.transmittal_number}</td>
                            <td style={{ padding: '8px' }}>{t.date_sent ? new Date(t.date_sent).toLocaleDateString() : '—'}</td>
                            <td style={{ padding: '8px' }}>{t.to_name} {t.to_company && `(${t.to_company})`}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{t.document_ids?.length || 0}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {t.pdf_url && (
                                <a
                                  href={t.pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 'bold' }}
                                >
                                  📥 Download
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {transmittals.length > 5 && (
                      <p style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>
                        Showing 5 of {transmittals.length} transmittals
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
                    No transmittals generated yet. Click "Create Transmittal" to generate a formal document package.
                  </p>
                )}
              </div>
            )}

            {/* ==================== TECHNICAL RESOURCE LIBRARY ==================== */}
            <div style={{
              marginTop: '30px',
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              border: '2px solid #6366f1'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#6366f1' }}>📚 Technical Resource Library</h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  backgroundColor: '#e0e7ff',
                  color: '#4338ca'
                }}>
                  {isSuperAdmin ? 'Super Admin - Full Access' : 'Read Only'}
                </span>
              </div>

              <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
                Industry standards and reference materials available to all inspectors across projects.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {technicalLibraryCategories.map(cat => {
                  const doc = getLibraryDocument(cat.key)
                  const hasDoc = !!doc
                  return (
                    <div
                      key={cat.key}
                      style={{
                        padding: '15px',
                        backgroundColor: hasDoc ? '#f0fdf4' : '#fef2f2',
                        borderRadius: '8px',
                        border: `2px solid ${hasDoc ? '#22c55e' : '#ef4444'}`,
                        position: 'relative'
                      }}
                    >
                      {/* Status Light */}
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        backgroundColor: hasDoc ? '#22c55e' : '#ef4444',
                        boxShadow: hasDoc ? '0 0 6px #22c55e' : '0 0 6px #ef4444'
                      }} />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#374151' }}>{cat.label}</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>{cat.description}</div>
                        </div>
                      </div>

                      {hasDoc ? (
                        <div>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              backgroundColor: '#6366f1',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '12px',
                              textDecoration: 'none',
                              marginBottom: '8px'
                            }}
                          >
                            📄 View Document
                          </a>
                          <div style={{ fontSize: '10px', color: '#666', marginTop: '5px' }}>
                            {doc.file_name} • v{doc.version_number || 1} • {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                          {isSuperAdmin && (
                            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                              <label style={{
                                padding: '4px 10px',
                                fontSize: '11px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}>
                                Replace
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx"
                                  onChange={(e) => {
                                    if (e.target.files[0]) uploadLibraryDocument(e.target.files[0], cat.key)
                                  }}
                                  disabled={uploadingVaultDoc === cat.key}
                                  style={{ display: 'none' }}
                                />
                              </label>
                              <button
                                onClick={() => deleteLibraryDocument(cat.key)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '11px',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 10px 0' }}>
                            ⚠️ Not uploaded
                          </p>
                          {isSuperAdmin ? (
                            <label style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              backgroundColor: '#6366f1',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: uploadingVaultDoc === cat.key ? 'not-allowed' : 'pointer',
                              opacity: uploadingVaultDoc === cat.key ? 0.6 : 1
                            }}>
                              {uploadingVaultDoc === cat.key ? '⏳ Uploading...' : '📤 Upload Document'}
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => {
                                  if (e.target.files[0]) uploadLibraryDocument(e.target.files[0], cat.key)
                                }}
                                disabled={uploadingVaultDoc === cat.key}
                                style={{ display: 'none' }}
                              />
                            </label>
                          ) : (
                            <p style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                              Contact Super Admin to upload this resource
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p style={{ margin: '15px 0 0', fontSize: '11px', color: '#666' }}>
                📖 These resources are marked as Global and accessible to all field inspectors via the Reference Library.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <h2>Projects</h2>
            {isSuperAdmin && (
              <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Add New Project</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <select value={newProject.organizationId} onChange={(e) => setNewProject({ ...newProject, organizationId: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '200px' }}>
                    <option value="">Select Organization</option>
                    {organizations.map(org => (<option key={org.id} value={org.id}>{org.name}</option>))}
                  </select>
                  <input type="text" placeholder="Project Name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', flex: 1, minWidth: '200px' }} />
                  <input type="text" placeholder="Short Code (e.g., EGP)" value={newProject.shortCode} onChange={(e) => setNewProject({ ...newProject, shortCode: e.target.value })} style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '150px' }} />
                  <button onClick={createProject} style={{ padding: '10px 25px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Project</button>
                </div>
              </div>
            )}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Project Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Code</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Organization</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(project => (
                    <tr key={project.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.name}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.short_code}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{project.organizations?.name || 'N/A'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{new Date(project.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0 }}>Users</h2>
                <p style={{ color: '#666', margin: '8px 0 0 0' }}>Manage user accounts. Click the role dropdown to change a user's role, or use the Delete button to remove a user.</p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600'
                }}
              >
                📧 Invite User
              </button>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Role</th>
                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Organization</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Profile</th>
                    <th style={{ padding: '15px', textAlign: 'center', borderBottom: '1px solid #ddd', width: '120px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.full_name || '-'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.email}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                        <select 
                          value={user.role} 
                          onChange={(e) => updateUserRole(user.id, e.target.value)}
                          style={{ 
                            padding: '8px 12px', 
                            border: '1px solid #ced4da', 
                            borderRadius: '4px', 
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {roleOptions.map(role => (
                            <option key={role} value={role} style={{ textTransform: 'capitalize' }}>
                              {role.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee' }}>{user.organizations?.name || 'N/A'}</td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                        {(() => {
                          const profile = inspectorProfiles.find(p => p.user_id === user.id)
                          if (profile) {
                            return (
                              <button
                                onClick={() => openProfileModal(profile.id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: profile.cleared_to_work ? '#28a745' : profile.profile_complete ? '#ffc107' : '#6c757d',
                                  color: profile.cleared_to_work ? 'white' : profile.profile_complete ? '#212529' : 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '500'
                                }}
                                title={profile.company_name || 'View Profile'}
                              >
                                {profile.cleared_to_work ? '✓ View' : profile.profile_complete ? '⏳ Review' : '📝 Incomplete'}
                              </button>
                            )
                          }
                          return <span style={{ color: '#999', fontSize: '12px' }}>No profile</span>
                        })()}
                      </td>
                      <td style={{ padding: '15px', borderBottom: '1px solid #eee', textAlign: 'center', width: '120px' }}>
                        <button
                          onClick={() => deleteUser(user.id, user.email)}
                          disabled={user.email === userProfile?.email}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: user.email === userProfile?.email ? '#ccc' : '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: user.email === userProfile?.email ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500',
                            minWidth: '100px',
                            display: 'inline-block'
                          }}
                          title={user.email === userProfile?.email ? 'Cannot delete yourself' : `Delete ${user.email}`}
                        >
                          🗑️ Delete User
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div>
            <h2>Inspector Reports</h2>
            <p style={{ color: '#666' }}>View and edit all inspector reports. Click Edit to modify any report.</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px', marginBottom: '20px' }}>
              <button onClick={() => navigate('/reports')} style={{ padding: '15px 30px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>View Reports Page</button>
              <button onClick={() => exportMasterProduction()} style={{ padding: '15px 30px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>📋 Master Production Spreadsheet</button>
            </div>

            {loadingReports ? (
              <p>Loading reports...</p>
            ) : allReports.length === 0 ? (
              <p style={{ color: '#666' }}>No reports found</p>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Inspector</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Spread</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Activities</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>PDF Archive</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allReports.map(report => (
                      <tr key={report.id}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{report.date}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{report.inspector_name}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{report.spread || '-'}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                          {(report.activity_blocks || []).map(b => b.activityType).filter(Boolean).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor:
                              report.status === 'approved' ? '#28a745' :
                              report.status === 'submitted' ? '#ffc107' :
                              report.status === 'revision_requested' ? '#dc3545' : '#6c757d',
                            color: report.status === 'submitted' ? '#000' : '#fff'
                          }}>
                            {report.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          {report.pdf_storage_url ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <a
                                href={report.pdf_storage_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#7c3aed',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  fontSize: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                📄 Download PDF
                              </a>
                              <div style={{ fontSize: '10px', color: '#666' }}>
                                <span title={`SHA-256: ${report.pdf_hash}`}>
                                  🔒 Hash: {report.pdf_hash?.substring(0, 8)}...
                                </span>
                              </div>
                              <div style={{ fontSize: '9px', color: '#999' }}>
                                {report.pdf_generated_at ? new Date(report.pdf_generated_at).toLocaleDateString() : ''}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#999', fontSize: '12px' }}>No PDF archived</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                          <button
                            onClick={() => navigate(`/report?id=${report.id}`)}
                            style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', fontSize: '12px' }}
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => navigate(`/inspector?edit=${report.id}`)}
                            style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            ✏️ Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Fleet Onboarding Tab - Super Admin Only */}
        {activeTab === 'fleet' && isSuperAdmin && (
          <div>
            <h2>🚀 Fleet Onboarding</h2>
            <p style={{ color: '#666', marginBottom: '30px' }}>Provision new organizations and their admin users for the Pipe-Up platform.</p>

            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', maxWidth: '600px' }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#003366' }}>New Organization</h3>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  value={fleetForm.organizationName}
                  onChange={(e) => {
                    const name = e.target.value
                    setFleetForm({
                      ...fleetForm,
                      organizationName: name,
                      slug: generateSlug(name)
                    })
                  }}
                  placeholder="Acme Pipeline Services"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  URL Slug *
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>app.pipe-up.ca/</span>
                  <input
                    type="text"
                    value={fleetForm.slug}
                    onChange={(e) => setFleetForm({ ...fleetForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    placeholder="acme-pipeline"
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>Auto-generated from name. Edit if needed.</p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }} />

              <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>Admin User</h4>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Admin Full Name *
                </label>
                <input
                  type="text"
                  value={fleetForm.adminFullName}
                  onChange={(e) => setFleetForm({ ...fleetForm, adminFullName: e.target.value })}
                  placeholder="John Smith"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Admin Email *
                </label>
                <input
                  type="email"
                  value={fleetForm.adminEmail}
                  onChange={(e) => setFleetForm({ ...fleetForm, adminEmail: e.target.value })}
                  placeholder="admin@acme-pipeline.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {provisionResult && (
                <div style={{
                  padding: '16px',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  backgroundColor: provisionResult.success ? '#d4edda' : '#f8d7da',
                  color: provisionResult.success ? '#155724' : '#721c24',
                  border: `1px solid ${provisionResult.success ? '#c3e6cb' : '#f5c6cb'}`
                }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>{provisionResult.message}</p>
                  {provisionResult.details && (
                    <div style={{ marginTop: '10px', fontSize: '13px' }}>
                      <p style={{ margin: '4px 0' }}>Organization ID: <code>{provisionResult.details.organizationId}</code></p>
                      <p style={{ margin: '4px 0' }}>Slug: <code>{provisionResult.details.slug}</code></p>
                      <p style={{ margin: '4px 0' }}>Admin Email: {provisionResult.details.adminEmail}</p>
                      <p style={{ margin: '4px 0', fontStyle: 'italic' }}>{provisionResult.details.note}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={provisionOrganization}
                disabled={provisioning || !fleetForm.organizationName || !fleetForm.slug || !fleetForm.adminEmail || !fleetForm.adminFullName}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  backgroundColor: provisioning ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: provisioning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {provisioning ? '⏳ Provisioning...' : '🚀 Provision Organization'}
              </button>
            </div>
          </div>
        )}

        {/* Usage Statistics Tab - Super Admin Only */}
        {activeTab === 'stats' && isSuperAdmin && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2>📊 Usage Statistics</h2>
                <p style={{ color: '#666', margin: 0 }}>Activity summary across all organizations.</p>
              </div>
              <button
                onClick={fetchUsageStats}
                disabled={loadingStats}
                style={{
                  padding: '10px 20px',
                  backgroundColor: loadingStats ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingStats ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {loadingStats ? '⏳ Loading...' : '🔄 Refresh Statistics'}
              </button>
            </div>

            {loadingStats ? (
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <p style={{ color: '#666', fontSize: '18px' }}>Loading statistics...</p>
              </div>
            ) : usageStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', backgroundColor: 'white', borderRadius: '8px' }}>
                <p style={{ color: '#666' }}>No organizations found. Click "Refresh Statistics" to load data.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Status</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Company Name</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Slug</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Total Tickets</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Total Reports</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: '600' }}>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageStats.map(org => (
                      <tr key={org.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: org.isActiveRecently ? '#10b981' : '#d1d5db',
                              boxShadow: org.isActiveRecently ? '0 0 6px rgba(16, 185, 129, 0.5)' : 'none'
                            }}
                            title={org.isActiveRecently ? 'Active in last 24 hours' : 'No recent activity'}
                          />
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: '500' }}>{org.name}</td>
                        <td style={{ padding: '14px 16px', color: '#666', fontFamily: 'monospace', fontSize: '13px' }}>{org.slug}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>{org.ticketCount.toLocaleString()}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: '#8b5cf6' }}>{org.reportCount.toLocaleString()}</td>
                        <td style={{ padding: '14px 16px', color: '#666', fontSize: '13px' }}>
                          {org.lastActive
                            ? new Date(org.lastActive).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                      <td style={{ padding: '14px 16px' }}></td>
                      <td style={{ padding: '14px 16px' }}>Totals ({usageStats.length} orgs)</td>
                      <td style={{ padding: '14px 16px' }}></td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#3b82f6' }}>
                        {usageStats.reduce((sum, org) => sum + org.ticketCount, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#8b5cf6' }}>
                        {usageStats.reduce((sum, org) => sum + org.reportCount, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 16px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Project Handover & Closeout Tab - Super Admin Only */}
        {activeTab === 'handover' && isSuperAdmin && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2>📦 Project Handover & Closeout</h2>
              <p style={{ color: '#666', margin: 0 }}>Generate final handover packages for project completion.</p>
            </div>

            {/* Organization Selector */}
            <div style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              marginBottom: '20px'
            }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                Select Project / Organization
              </label>
              <select
                value={selectedOrgForHandover}
                onChange={(e) => {
                  setSelectedOrgForHandover(e.target.value)
                  setHandoverAudit(null)
                  setHandoverProgress('')
                  if (e.target.value) {
                    runHandoverAudit(e.target.value).then(setHandoverAudit)
                    fetchHandoverHistory(e.target.value)
                  }
                }}
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px'
                }}
              >
                <option value="">-- Select Organization --</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>

            {selectedOrgForHandover && (
              <>
                {/* Handover Readiness Audit */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  marginBottom: '20px'
                }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#374151' }}>
                    🔍 Handover Readiness Audit
                  </h3>

                  {!handoverAudit ? (
                    <p style={{ color: '#666' }}>Loading audit...</p>
                  ) : (
                    <>
                      {/* Status Banner */}
                      <div style={{
                        padding: '15px 20px',
                        borderRadius: '6px',
                        backgroundColor: handoverAudit.ready ? '#d4edda' : '#f8d7da',
                        border: `2px solid ${handoverAudit.ready ? '#28a745' : '#dc3545'}`,
                        marginBottom: '20px'
                      }}>
                        <div style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: handoverAudit.ready ? '#155724' : '#721c24'
                        }}>
                          {handoverAudit.ready ? '✅ READY FOR HANDOVER' : '❌ NOT READY - BLOCKERS FOUND'}
                        </div>
                        <div style={{ fontSize: '12px', color: handoverAudit.ready ? '#155724' : '#721c24', marginTop: '5px' }}>
                          {handoverAudit.stats.totalDocuments} documents • {handoverAudit.stats.totalReports} field reports
                        </div>
                      </div>

                      {/* Blockers */}
                      {handoverAudit.blockers.length > 0 && (
                        <div style={{
                          marginBottom: '15px',
                          padding: '15px',
                          backgroundColor: '#fef2f2',
                          borderRadius: '6px',
                          border: '1px solid #fecaca'
                        }}>
                          <div style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: '8px' }}>
                            🚫 Blockers ({handoverAudit.blockers.length})
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#991b1b' }}>
                            {handoverAudit.blockers.map((b, i) => (
                              <li key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Warnings */}
                      {handoverAudit.warnings.length > 0 && (
                        <div style={{
                          marginBottom: '15px',
                          padding: '15px',
                          backgroundColor: '#fffbeb',
                          borderRadius: '6px',
                          border: '1px solid #fde68a'
                        }}>
                          <div style={{ fontWeight: 'bold', color: '#d97706', marginBottom: '8px' }}>
                            ⚠️ Warnings ({handoverAudit.warnings.length})
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e' }}>
                            {handoverAudit.warnings.map((w, i) => (
                              <li key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Documents Summary */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>
                            {handoverAudit.documents.governance.length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#166534' }}>Governance Docs</div>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>
                            {handoverAudit.documents.engineering.length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#1e40af' }}>Engineering Docs</div>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: '#fdf4ff', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7' }}>
                            {handoverAudit.documents.compliance.length}
                          </div>
                          <div style={{ fontSize: '11px', color: '#7e22ce' }}>Compliance Docs</div>
                        </div>
                        <div style={{ padding: '12px', backgroundColor: '#fefce8', borderRadius: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ca8a04' }}>
                            {handoverAudit.stats.totalReports}
                          </div>
                          <div style={{ fontSize: '11px', color: '#a16207' }}>Field Reports</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Generate Package Button */}
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  marginBottom: '20px'
                }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#374151' }}>
                    📁 Generate Final Package
                  </h3>

                  <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>
                    This will bundle all project documents and field reports into a single ZIP archive
                    organized by category. A copy will be saved to permanent storage for legal records.
                  </p>

                  <div style={{
                    padding: '15px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '6px',
                    marginBottom: '15px',
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}>
                    <div style={{ color: '#374151', marginBottom: '8px', fontWeight: 'bold' }}>Folder Structure:</div>
                    <div style={{ color: '#6b7280' }}>
                      /Handover_Package_[OrgName]<br />
                      &nbsp;&nbsp;├── 01_Governance/ (Contract, SOW, Signed ITP)<br />
                      &nbsp;&nbsp;├── 02_Engineering/ (IFC Drawings, Typicals, Specs)<br />
                      &nbsp;&nbsp;├── 03_Field_Reports/ (Daily Tickets, Completion Records)<br />
                      &nbsp;&nbsp;├── 04_Compliance/ (ERP, EMP)<br />
                      &nbsp;&nbsp;├── Project_Manifest.csv (with SHA-256 hashes)<br />
                      &nbsp;&nbsp;└── MANIFEST.json
                    </div>
                  </div>

                  {/* Manifest Preview Section - shows even with blockers for testing */}
                  {handoverAudit && (
                    <div style={{
                      marginBottom: '15px',
                      padding: '15px',
                      backgroundColor: '#fefce8',
                      borderRadius: '6px',
                      border: '1px solid #fde68a'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 'bold', color: '#a16207' }}>
                          📋 Manifest Preview
                        </div>
                        <button
                          onClick={generateManifestPreview}
                          disabled={generatingManifest}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: generatingManifest ? '#9ca3af' : '#d97706',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: generatingManifest ? 'not-allowed' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          {generatingManifest ? '⏳ Computing hashes...' : '🔍 Preview Manifest'}
                        </button>
                      </div>

                      {manifestPreview && manifestPreview.length > 0 && (
                        <div style={{ overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#fef9c3', position: 'sticky', top: 0 }}>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>Category</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>Folder</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>Filename</th>
                                <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #fde68a' }}>Rev</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>Uploaded</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>Owner Metadata</th>
                                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #fde68a' }}>SHA256 Hash</th>
                              </tr>
                            </thead>
                            <tbody>
                              {manifestPreview.map((entry, idx) => (
                                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fffef0' : 'white' }}>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a' }}>{entry.category}</td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a', fontFamily: 'monospace' }}>{entry.folder}</td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.filename}>{entry.filename}</td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a', textAlign: 'center' }}>{entry.rev}</td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a' }}>{entry.uploadedAt}</td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a', fontSize: '9px', color: '#d97706' }}>
                                    {entry.metadata && Object.keys(entry.metadata).length > 0
                                      ? Object.entries(entry.metadata).map(([k, v]) => v ? `${v}` : null).filter(Boolean).join(', ')
                                      : '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #fde68a', fontFamily: 'monospace', fontSize: '9px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.hash}>{entry.hash.substring(0, 12)}...</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#a16207', fontWeight: 'bold' }}>
                            Total Files: {manifestPreview.length}
                          </div>
                        </div>
                      )}

                      {!manifestPreview && !generatingManifest && (
                        <p style={{ color: '#92400e', fontSize: '12px', margin: 0 }}>
                          {handoverAudit.stats?.totalDocuments > 0
                            ? 'Click "Preview Manifest" to compute SHA-256 hashes for all files before generating the package.'
                            : 'No documents uploaded yet. Upload documents in the Project Governance tab to see them here.'}
                        </p>
                      )}
                    </div>
                  )}

                  {handoverProgress && (
                    <div style={{
                      padding: '10px 15px',
                      backgroundColor: generatingPackage ? '#eff6ff' : (handoverProgress.includes('Error') ? '#fef2f2' : '#f0fdf4'),
                      borderRadius: '4px',
                      marginBottom: '15px',
                      fontSize: '13px',
                      color: generatingPackage ? '#1e40af' : (handoverProgress.includes('Error') ? '#dc2626' : '#16a34a')
                    }}>
                      {generatingPackage && '⏳ '}{handoverProgress}
                    </div>
                  )}

                  <button
                    onClick={generateHandoverPackage}
                    disabled={generatingPackage || !handoverAudit?.ready}
                    style={{
                      padding: '14px 28px',
                      backgroundColor: generatingPackage ? '#9ca3af' : (!handoverAudit?.ready ? '#d1d5db' : '#10b981'),
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: generatingPackage || !handoverAudit?.ready ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {generatingPackage ? '⏳ Generating...' : '📦 Generate Final Package'}
                  </button>

                  {!handoverAudit?.ready && handoverAudit && (
                    <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#dc2626' }}>
                      Resolve all blockers before generating the handover package.
                    </p>
                  )}
                </div>

                {/* Handover History */}
                {handoverHistory.length > 0 && (
                  <div style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#374151' }}>
                      📜 Previous Handover Packages
                    </h3>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>File</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Created</th>
                            <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {handoverHistory.map(file => (
                            <tr key={file.name} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '10px', fontSize: '13px' }}>{file.name}</td>
                              <td style={{ padding: '10px', fontSize: '12px', color: '#666' }}>
                                {file.created_at ? new Date(file.created_at).toLocaleString() : '—'}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right' }}>
                                <button
                                  onClick={async () => {
                                    const { data } = await supabase.storage
                                      .from('handovers')
                                      .download(`handovers/${selectedOrgForHandover}/${file.name}`)
                                    if (data) saveAs(data, file.name)
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Download
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Invite User Modal */}
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
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '450px',
              width: '95%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#003366' }}>📧 Invite New User</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="John Smith"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="inspector">Inspector</option>
                  <option value="chief_inspector">Chief Inspector</option>
                  <option value="assistant_chief_inspector">Assistant Chief Inspector</option>
                  <option value="admin">Admin</option>
                  <option value="pm">Project Manager</option>
                  <option value="cm">Construction Manager</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowInviteModal(false)
                    setInviteEmail('')
                    setInviteName('')
                    setInviteRole('inspector')
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={inviteUser}
                  disabled={inviting || !inviteEmail || !inviteName}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: (inviting || !inviteEmail || !inviteName) ? '#d1d5db' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (inviting || !inviteEmail || !inviteName) ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  {inviting ? 'Sending...' : '📧 Send Invite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TIMESHEET DETAIL MODAL ==================== */}
        {showTimesheetModal && selectedTimesheet && (
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
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '900px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#003366' }}>💰 Timesheet Review</h3>
                <button 
                  onClick={() => { setShowTimesheetModal(false); setSelectedTimesheet(null); setTimesheetItems([]); }}
                  style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}
                >
                  ×
                </button>
              </div>

              {/* Inspector Info */}
              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <strong style={{ color: '#666', fontSize: '12px' }}>INSPECTOR</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '16px' }}>{selectedTimesheet.user_profiles?.full_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <strong style={{ color: '#666', fontSize: '12px' }}>COMPANY</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '16px' }}>{selectedTimesheet.inspector_profiles?.company_name || '-'}</p>
                  </div>
                  <div>
                    <strong style={{ color: '#666', fontSize: '12px' }}>PERIOD</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '16px' }}>{selectedTimesheet.period_start} to {selectedTimesheet.period_end}</p>
                  </div>
                  <div>
                    <strong style={{ color: '#666', fontSize: '12px' }}>SUBMITTED</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '16px' }}>{formatDate(selectedTimesheet.submitted_at)}</p>
                  </div>
                </div>
              </div>

              {/* Summary Totals */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#e7f3ff', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <strong style={{ color: '#004085', fontSize: '12px' }}>TOTAL HOURS</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#004085' }}>{selectedTimesheet.total_hours || 0}</p>
                </div>
                <div style={{ backgroundColor: '#d4edda', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <strong style={{ color: '#155724', fontSize: '12px' }}>PER DIEM DAYS</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>{selectedTimesheet.total_per_diem_days || 0}</p>
                </div>
                <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <strong style={{ color: '#856404', fontSize: '12px' }}>MILEAGE (KM)</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#856404' }}>{selectedTimesheet.total_mileage || 0}</p>
                </div>
                <div style={{ backgroundColor: '#d1ecf1', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                  <strong style={{ color: '#0c5460', fontSize: '12px' }}>TOTAL AMOUNT</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#0c5460' }}>{formatCurrency(selectedTimesheet.total_amount)}</p>
                </div>
              </div>

              {/* Line Items Table */}
              <h4 style={{ marginBottom: '10px' }}>Daily Line Items</h4>
              {timesheetItems.length === 0 ? (
                <p style={{ color: '#666' }}>Loading line items...</p>
              ) : (
                <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                      <tr>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Date</th>
                        <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Hours</th>
                        <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Rate</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Per Diem</th>
                        <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Mileage</th>
                        <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Line Total</th>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timesheetItems.map((item, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px' }}>{item.work_date}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right' }}>{item.hours || 0}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right' }}>{formatCurrency(item.hourly_rate)}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'center' }}>
                            {item.per_diem ? '✓' : '-'}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right' }}>{item.mileage || 0}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>
                            {formatCurrency(item.line_total)}
                          </td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>{item.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Inspector Notes */}
              {selectedTimesheet.notes && (
                <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
                  <strong style={{ color: '#856404' }}>Inspector Notes:</strong>
                  <p style={{ margin: '10px 0 0 0', color: '#856404' }}>{selectedTimesheet.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
                <button
                  onClick={() => { setShowTimesheetModal(false); setSelectedTimesheet(null); setTimesheetItems([]); }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Close
                </button>
                <button
                  onClick={() => openRejectModal(selectedTimesheet)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  ↩ Request Revision
                </button>
                <button
                  onClick={() => approveTimesheet(selectedTimesheet.id)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  ✓ Approve for Payment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TIMESHEET REJECT MODAL ==================== */}
        {showRejectModal && timesheetToReject && (
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
            zIndex: 1001
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '500px',
              width: '95%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#dc3545' }}>↩ Request Revision</h3>
              
              <p style={{ color: '#666', marginBottom: '15px' }}>
                Please provide notes explaining what needs to be corrected on this timesheet.
                The inspector will be notified and can resubmit after making changes.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                  Revision Notes *
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Please correct the hours for January 15th - should be 8 hours not 10..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowRejectModal(false); setTimesheetToReject(null); setRejectNotes(''); }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={rejectTimesheet}
                  disabled={!rejectNotes.trim()}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: !rejectNotes.trim() ? '#d1d5db' : '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: !rejectNotes.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Send Revision Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inspector Profile Modal */}
        {showProfileModal && (
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
            zIndex: 1001
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '800px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
              {/* Header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                backgroundColor: 'white',
                zIndex: 1
              }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Inspector Profile</h2>
                <button
                  onClick={() => { setShowProfileModal(false); setSelectedProfile(null); setProfileDocuments([]); }}
                  style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}
                >
                  ×
                </button>
              </div>

              {loadingProfile ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading profile...</div>
              ) : selectedProfile ? (
                <div style={{ padding: '24px' }}>
                  {/* Status Banner */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    backgroundColor: selectedProfile.cleared_to_work ? '#d1fae5' : selectedProfile.profile_complete ? '#fef3c7' : '#fee2e2',
                    color: selectedProfile.cleared_to_work ? '#065f46' : selectedProfile.profile_complete ? '#92400e' : '#991b1b',
                    fontWeight: '600'
                  }}>
                    {selectedProfile.cleared_to_work ? '✓ Cleared to Work' : selectedProfile.profile_complete ? '⏳ Pending Clearance' : '📝 Profile Incomplete'}
                  </div>

                  {/* Company Information */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>Company Information</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Company Name</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.company_name || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Email</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.company_email || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Phone</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.company_phone || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Address</div>
                        <div style={{ fontWeight: '500' }}>
                          {selectedProfile.company_address || '-'}
                          {selectedProfile.company_city && `, ${selectedProfile.company_city}`}
                          {selectedProfile.company_province && `, ${selectedProfile.company_province}`}
                          {selectedProfile.company_postal_code && ` ${selectedProfile.company_postal_code}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>Primary Contact</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Name</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.primary_contact_name || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Phone</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.primary_contact_phone || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Email</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.primary_contact_email || '-'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Banking Information */}
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>Banking Information</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Bank Name</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.bank_name || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Transit #</div>
                        <div style={{ fontWeight: '500' }}>{selectedProfile.bank_transit || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Account #</div>
                        <div style={{ fontWeight: '500' }}>
                          {selectedProfile.bank_account ? `****${selectedProfile.bank_account.slice(-4)}` : '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Documents */}
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>
                      Documents ({profileDocuments.length})
                    </h3>
                    {profileDocuments.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        No documents uploaded
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f9fafb' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Document</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Expiry</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileDocuments.map(doc => {
                            const expiry = getExpiryStatus(doc.expiry_date)
                            return (
                              <tr key={doc.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '10px' }}>
                                  {doc.document_url ? (
                                    <a href={doc.document_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>
                                      {doc.document_name || 'View Document'}
                                    </a>
                                  ) : (
                                    doc.document_name || '-'
                                  )}
                                </td>
                                <td style={{ padding: '10px' }}>{doc.document_type || '-'}</td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    backgroundColor: expiry.bg,
                                    color: expiry.color
                                  }}>
                                    {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'No Expiry'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                  <span style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    backgroundColor: doc.verified ? '#d1fae5' : '#fef3c7',
                                    color: doc.verified ? '#065f46' : '#92400e'
                                  }}>
                                    {doc.verified ? '✓ Verified' : '⏳ Pending'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    {!selectedProfile.cleared_to_work && selectedProfile.profile_complete && (
                      <button
                        onClick={async () => {
                          if (confirm('Clear this inspector to work?')) {
                            await supabase
                              .from('inspector_profiles')
                              .update({ cleared_to_work: true })
                              .eq('id', selectedProfile.id)
                            alert('Inspector cleared to work!')
                            setShowProfileModal(false)
                            fetchData()
                          }
                        }}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        ✓ Clear to Work
                      </button>
                    )}
                    <button
                      onClick={() => { setShowProfileModal(false); setSelectedProfile(null); setProfileDocuments([]); }}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Profile not found</div>
              )}
            </div>
          </div>
        )}

        {/* Metric Integrity Info Modal */}
        <MetricIntegrityModal isOpen={metricInfoModal.isOpen} onClose={metricInfoModal.close} />

        {/* ITP Digital Signature Modal */}
        {showSignaturePad && signingRole && (
          <SignaturePad
            onSave={handleSignatureSave}
            onCancel={cancelSignature}
            signerName={userProfile?.full_name || userProfile?.email || 'Unknown'}
            signerRole={signingRole.label}
          />
        )}

        {/* ITP Revision Signature Reset Prompt */}
        {showITPResetPrompt && (
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
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#dc3545' }}>
                ⚠️ ITP Revision Detected
              </h3>
              <p style={{ margin: '0 0 20px 0', color: '#374151', fontSize: '14px', lineHeight: '1.5' }}>
                The current ITP has existing signatures. Uploading a new revision may require collecting new approvals.
              </p>
              <p style={{ margin: '0 0 25px 0', color: '#6b7280', fontSize: '13px', fontWeight: 'bold' }}>
                Does this revision require new signatures?
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowITPResetPrompt(false)
                    setPendingITPUpload(null)
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleITPResetResponse(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  No, Keep Signatures
                </button>
                <button
                  onClick={() => handleITPResetResponse(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  Yes, Reset Signatures
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Version History Modal */}
        {showHistoryModal && selectedCategoryForHistory && (
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
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '550px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#1f2937' }}>
                  📜 Version History
                </h3>
                <button
                  onClick={() => {
                    setShowHistoryModal(false)
                    setSelectedCategoryForHistory(null)
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Close
                </button>
              </div>

              <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#6b7280' }}>
                {documentVaultCategories.find(c => c.key === selectedCategoryForHistory)?.label}
              </p>

              <div style={{ borderTop: '1px solid #e5e7eb' }}>
                {getDocumentHistory(selectedCategoryForHistory).map((doc, idx) => (
                  <div
                    key={doc.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: doc.is_current !== false ? '#f0fdf4' : 'transparent'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: doc.is_current !== false ? 'bold' : 'normal' }}>
                        Rev {(doc.version_number || 1) - 1}
                        {doc.is_current !== false && (
                          <span style={{
                            marginLeft: '8px',
                            padding: '2px 6px',
                            backgroundColor: '#22c55e',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '9px'
                          }}>
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                        {doc.file_name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                        Uploaded: {new Date(doc.created_at).toLocaleString()}
                      </div>
                    </div>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '11px',
                        textDecoration: 'none'
                      }}
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>

              <p style={{ margin: '15px 0 0 0', fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
                Previous versions are retained for audit purposes and are not deleted.
              </p>
            </div>
          </div>
        )}

        {/* Transmittal Modal */}
        {showTransmittalModal && (
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
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '700px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#7c3aed' }}>
                  📨 Create Document Transmittal
                </h3>
                <button
                  onClick={() => setShowTransmittalModal(false)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>From Name</label>
                  <input
                    type="text"
                    value={transmittalForm.from_name}
                    onChange={(e) => setTransmittalForm(f => ({ ...f, from_name: e.target.value }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>From Title</label>
                  <input
                    type="text"
                    value={transmittalForm.from_title}
                    onChange={(e) => setTransmittalForm(f => ({ ...f, from_title: e.target.value }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>To (Recipient Name)</label>
                  <input
                    type="text"
                    value={transmittalForm.to_name}
                    onChange={(e) => setTransmittalForm(f => ({ ...f, to_name: e.target.value }))}
                    placeholder="e.g., Document Control Manager"
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>To (Company)</label>
                  <input
                    type="text"
                    value={transmittalForm.to_company}
                    onChange={(e) => setTransmittalForm(f => ({ ...f, to_company: e.target.value }))}
                    placeholder="e.g., Pipeline Owner Inc."
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>Subject</label>
                <input
                  type="text"
                  value={transmittalForm.subject}
                  onChange={(e) => setTransmittalForm(f => ({ ...f, subject: e.target.value }))}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>Notes (optional)</label>
                <textarea
                  value={transmittalForm.notes}
                  onChange={(e) => setTransmittalForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Any additional notes for the transmittal..."
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                  Select Documents to Include ({transmittalForm.selectedDocIds.length} selected)
                </label>
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '10px'
                }}>
                  {projectDocuments.filter(d => d.is_current !== false && !d.is_addendum && !d.is_global).map(doc => (
                    <label
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                        backgroundColor: transmittalForm.selectedDocIds.includes(doc.id) ? '#f5f3ff' : 'transparent',
                        borderRadius: '4px',
                        marginBottom: '4px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={transmittalForm.selectedDocIds.includes(doc.id)}
                        onChange={() => toggleDocForTransmittal(doc.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500' }}>{doc.file_name}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {doc.category} • Rev {doc.version_number || 1}
                          {doc.metadata?.owner_doc_num && ` • Owner: ${doc.metadata.owner_doc_num}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setShowTransmittalModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={generateTransmittal}
                  disabled={generatingTransmittal || transmittalForm.selectedDocIds.length === 0 || !transmittalForm.to_name}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: generatingTransmittal || transmittalForm.selectedDocIds.length === 0 ? '#9ca3af' : '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: generatingTransmittal || transmittalForm.selectedDocIds.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  {generatingTransmittal ? '⏳ Generating...' : `📄 Generate Transmittal (${transmittalForm.selectedDocIds.length} docs)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Modal */}
        {showSyncModal && selectedDocForSync && (
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
            zIndex: 10000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: '#374151' }}>
                  🔄 Update Sync Status
                </h3>
                <button
                  onClick={() => { setShowSyncModal(false); setSelectedDocForSync(null) }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel
                </button>
              </div>

              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151' }}>{selectedDocForSync.file_name}</div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {documentVaultCategories.find(c => c.key === selectedDocForSync.category)?.label} • Rev {selectedDocForSync.version_number || 1}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Status</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['internal', 'transmitted', 'acknowledged', 'rejected'].map(status => {
                    const badge = getSyncStatusBadge(status)
                    return (
                      <button
                        key={status}
                        onClick={() => setSyncForm(f => ({ ...f, sync_status: status }))}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: syncForm.sync_status === status ? badge.color : badge.bg,
                          color: syncForm.sync_status === status ? 'white' : badge.color,
                          border: `2px solid ${badge.color}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      >
                        {badge.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>
                  Owner's Transmittal/Receipt #
                </label>
                <input
                  type="text"
                  value={syncForm.owner_transmittal_id}
                  onChange={(e) => setSyncForm(f => ({ ...f, owner_transmittal_id: e.target.value }))}
                  placeholder="e.g., OWN-TR-0042"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}>
                  Owner Comments/Feedback
                </label>
                <textarea
                  value={syncForm.owner_comments}
                  onChange={(e) => setSyncForm(f => ({ ...f, owner_comments: e.target.value }))}
                  rows={3}
                  placeholder="Any feedback from the Owner's Document Control..."
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              {syncForm.sync_status === 'rejected' && (
                <div style={{
                  marginBottom: '15px',
                  padding: '10px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '6px',
                  border: '1px solid #fecaca'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626' }}>
                    ⚠️ Marking as Rejected
                  </div>
                  <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '4px' }}>
                    This will flag the document category in red, indicating a new revision is required immediately.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => { setShowSyncModal(false); setSelectedDocForSync(null) }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={updateSyncStatus}
                  disabled={updatingSyncStatus}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: updatingSyncStatus ? '#9ca3af' : getSyncStatusBadge(syncForm.sync_status).color,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: updatingSyncStatus ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  {updatingSyncStatus ? '⏳ Updating...' : '✓ Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ==================== AI AGENT AUDIT FINDINGS PANEL ==================== */}
      <AgentAuditFindingsPanel
        isOpen={!!auditPanelData}
        onClose={() => setAuditPanelData(null)}
        ticket={auditPanelData?.ticket}
        flag={auditPanelData?.flag}
        onFlagAction={async (actionData) => {
          // Save flag action to localStorage for persistence
          // In future, this could be saved to a database table
          const storageKey = `flag_action_${actionData.ticketId}_${actionData.flagType}`
          localStorage.setItem(storageKey, JSON.stringify(actionData))
          console.log('Flag action saved:', actionData)
        }}
      />

    </div>
  )
}

export default AdminPortal
