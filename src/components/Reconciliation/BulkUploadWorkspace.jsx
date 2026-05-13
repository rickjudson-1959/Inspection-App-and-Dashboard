/**
 * BulkUploadWorkspace — semi-automated bulk PDF upload.
 *
 * Single full-screen modal that owns the entire flow:
 *   1. Upload PDF (or pick a separate index PDF)
 *   2. Split into thumbnails; index page auto-detected on page 1
 *   3. Optional: kick off background OCR suggestions on every page
 *   4. Admin sorts pages into groups via:
 *      - "Sequential assign" — fast index-driven walk
 *      - Drag-and-drop from the thumbnail grid into group slots
 *      - "+ New group from index" picker
 *      - Bulk classify selected pages
 *   5. Confirm and save — writes reconciliation_documents,
 *      document_matches, and runs LEM extraction.
 *
 * Replaces the fully-automatic BulkUploadModal.jsx from the previous
 * iterations.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import { useOrgQuery } from '../../utils/queryHelpers.js'
import {
  splitPdfToPages, classifyIndexPage, suggestPageMetadata,
  saveBulkUploadGroups, createDiagnosticsRecorder,
  saveWorkspace, loadWorkspace, workspaceIdFor
} from '../../utils/bulkUploadProcessor.js'

import ThumbnailGrid from './bulkUpload/ThumbnailGrid.jsx'
import PageLightbox from './bulkUpload/PageLightbox.jsx'
import IndexReview from './bulkUpload/IndexReview.jsx'
import GroupingArea from './bulkUpload/GroupingArea.jsx'
import QuickAssignToolbar from './bulkUpload/QuickAssignToolbar.jsx'
import { PreConfirmationSummary, ProcessingOverlay, CompletionScreen } from './bulkUpload/ProcessingProgress.jsx'

export default function BulkUploadWorkspace({ open, onClose, onComplete }) {
  const { user } = useAuth()
  const { getOrgId } = useOrgQuery()

  const [stage, setStage] = useState('idle')
  // idle | splitting | sorting | saving | done

  const [packageFile, setPackageFile] = useState(null)
  const [pages, setPages] = useState([])
  const [pageMetadata, setPageMetadata] = useState(() => new Map())

  // Index state
  const [indexEntries, setIndexEntries] = useState([])
  const [indexDate, setIndexDate] = useState('')
  const [indexSource, setIndexSource] = useState(null)  // 'page1' | 'separate' | null
  const [showIndexReview, setShowIndexReview] = useState(false)
  const [indexConfirmed, setIndexConfirmed] = useState(false)

  // Grouping state
  const [groups, setGroups] = useState([])
  const [skipPages, setSkipPages] = useState([])      // number[]
  const [selectedPageNumbers, setSelectedPageNumbers] = useState(() => new Set())
  const [lightboxPage, setLightboxPage] = useState(null)

  // Undo history — each entry is a snapshot of { groups, skipPages,
  // pageMetadata } captured BEFORE a mutating action. Capped at 50.
  const [history, setHistory] = useState([])

  // Sequential assign state machine. For each foreman the admin walks
  // through three steps (LEM -> Ticket -> Other), assigning pages to
  // the SAME group at each step before the toolbar advances to the
  // next foreman. seqWorkingGroupId is null when no foreman is in
  // progress; once "Start sequential" fires it points at the new
  // group's id and seqStep tracks which slot to fill next.
  const [seqWorkingGroupId, setSeqWorkingGroupId] = useState(null)
  const [seqStep, setSeqStep] = useState('lem') // 'lem' | 'ticket' | 'other'

  // OCR background state
  const [ocrStatus, setOcrStatus] = useState('idle')  // idle | running | done | failed
  const [ocrProgress, setOcrProgress] = useState({ done: 0, total: 0 })
  const ocrAbortRef = useRef(false)

  // Save state
  const [saveMsg, setSaveMsg] = useState('')
  const [saveCurrent, setSaveCurrent] = useState(0)
  const [saveTotal, setSaveTotal] = useState(0)
  const [saveSummary, setSaveSummary] = useState(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const [bulkUploadId] = useState(() => crypto.randomUUID())
  const [recorder] = useState(() => createDiagnosticsRecorder(bulkUploadId))
  const fileInputRef = useRef(null)
  const indexFileInputRef = useRef(null)

  // Derived: which pages are already assigned to a group or skip
  const pageGroupMap = useMemo(() => {
    const m = new Map()
    for (const g of groups) {
      for (const n of (g.lemPages || [])) m.set(n, { groupId: g.id, ticketNumber: g.ticket_number, foremanName: g.foreman_name, slot: 'LEM' })
      for (const n of (g.ticketPages || [])) m.set(n, { groupId: g.id, ticketNumber: g.ticket_number, foremanName: g.foreman_name, slot: 'Ticket' })
      for (const n of (g.otherPages || [])) m.set(n, { groupId: g.id, ticketNumber: g.ticket_number, foremanName: g.foreman_name, slot: 'Other' })
    }
    for (const n of skipPages) m.set(n, { slot: 'Skip' })
    return m
  }, [groups, skipPages])

  const usedTicketNumbers = useMemo(() => {
    const s = new Set()
    for (const g of groups) if (g.ticket_number) s.add(String(g.ticket_number))
    return s
  }, [groups])

  const ungroupedPageNumbers = useMemo(() => {
    return pages.map(p => p.pageNumber).filter(n => !pageGroupMap.has(n))
  }, [pages, pageGroupMap])

  // Persist workspace state on every meaningful change
  useEffect(() => {
    if (!packageFile || stage !== 'sorting') return
    const id = workspaceIdFor(packageFile)
    if (!id) return
    saveWorkspace(id, {
      fileName: packageFile.name,
      fileSize: packageFile.size,
      pageCount: pages.length,
      savedAt: new Date().toISOString(),
      indexEntries, indexDate, indexSource, indexConfirmed,
      groups, skipPages,
      pageMetadata: Array.from(pageMetadata.entries())
    })
  }, [groups, skipPages, indexEntries, indexConfirmed, packageFile, stage, pages.length])

  // Safety net: if undo (or any other action) deletes the group we're
  // sequentially editing, reset the state machine so the toolbar
  // doesn't end up pointing at a ghost. MUST stay above the `if
  // (!open) return null` below — React Rules of Hooks. Setters below
  // are referenced by id; they're declared above so this effect can
  // call them.
  useEffect(() => {
    if (seqWorkingGroupId && !groups.some(g => g.id === seqWorkingGroupId)) {
      setSeqWorkingGroupId(null)
      setSeqStep('lem')
    }
  }, [groups, seqWorkingGroupId])

  if (!open) return null

  const isBlocking = stage === 'splitting' || stage === 'saving'

  // ── File selection ─────────────────────────────────────────────────────
  const handleFilePicked = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF.')
      return
    }
    setError(''); setWarning('')
    setPackageFile(file)
    setStage('splitting')
    recorder?.setPackageMeta({ packageFilename: file.name })

    // Try to restore prior workspace
    const wsId = workspaceIdFor(file)
    const prior = wsId ? loadWorkspace(wsId) : null
    if (prior && prior.fileSize === file.size && (prior.groups?.length || prior.skipPages?.length)) {
      if (window.confirm(`Resume previous workspace for ${file.name}? Found ${prior.groups?.length || 0} groups and ${prior.skipPages?.length || 0} skipped pages.`)) {
        setIndexEntries(prior.indexEntries || [])
        setIndexDate(prior.indexDate || '')
        setIndexSource(prior.indexSource || null)
        setIndexConfirmed(!!prior.indexConfirmed)
        setGroups(prior.groups || [])
        setSkipPages(prior.skipPages || [])
        setPageMetadata(new Map(prior.pageMetadata || []))
      }
    }

    try {
      const rendered = await splitPdfToPages(file)
      setPages(rendered)
      recorder?.setPackageMeta({ pageCount: rendered.length })

      // Auto-detect index on page 1 (one OCR call)
      if (rendered.length > 0 && !indexConfirmed) {
        try {
          const idx = await classifyIndexPage(rendered[0].imageBase64)
          recorder?.setIndex(idx)
          if (idx.is_index && idx.entries.length >= 3) {
            setIndexEntries(idx.entries)
            setIndexDate(idx.date || '')
            setIndexSource('page1')
            setShowIndexReview(true)
            // mark page 1 as the index page in metadata so it's auto-routed
            // to Skip on confirm
            setPageMetadata(prev => {
              const next = new Map(prev)
              next.set(1, { doc_type: 'index', foreman_name: null, field_log_id: null, ocrStatus: 'done' })
              return next
            })
          }
        } catch (err) {
          if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
            setError('Anthropic API credit balance too low. Top up and re-run.')
            setStage('idle')
            return
          }
          console.warn('[BulkUploadWorkspace] index detection failed:', err.message)
        }
      }

      setStage('sorting')
    } catch (err) {
      console.error(err)
      setError(err.message || 'PDF split failed.')
      setStage('idle')
    }
  }

  const handleIndexFilePicked = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Index file must be a PDF.')
      return
    }
    try {
      const idxPages = await splitPdfToPages(file)
      const merged = { entries: [], date: null }
      for (let i = 0; i < idxPages.length; i++) {
        const r = await classifyIndexPage(idxPages[i].imageBase64)
        if (r.is_index) {
          if (!merged.date && r.date) merged.date = r.date
          for (const e of r.entries) {
            if (!merged.entries.some(x => x.ticket_number === e.ticket_number)) merged.entries.push(e)
          }
        }
      }
      recorder?.setIndex({ is_index: true, ...merged })
      if (merged.entries.length === 0) {
        setWarning('Could not extract any foreman entries from that file.')
        return
      }
      setIndexEntries(merged.entries)
      setIndexDate(merged.date || '')
      setIndexSource('separate')
      setShowIndexReview(true)
    } catch (err) {
      setError(err.message || 'Index OCR failed.')
    }
  }

  // ── Background OCR suggestions ─────────────────────────────────────────
  const runBackgroundOcr = async () => {
    if (ocrStatus !== 'idle') return
    setOcrStatus('running')
    ocrAbortRef.current = false
    const targets = pages.filter(p => !(pageMetadata.get(p.pageNumber)?.ocrStatus === 'done'))
    setOcrProgress({ done: 0, total: targets.length })
    let done = 0

    setPageMetadata(prev => {
      const next = new Map(prev)
      for (const p of targets) {
        if (!next.has(p.pageNumber)) next.set(p.pageNumber, { ocrStatus: 'running' })
        else next.set(p.pageNumber, { ...next.get(p.pageNumber), ocrStatus: 'running' })
      }
      return next
    })

    for (const p of targets) {
      if (ocrAbortRef.current) break
      try {
        const suggestion = await suggestPageMetadata(p.imageBase64)
        recorder?.addSuggestion({ pageNumber: p.pageNumber, suggestion, raw_response: suggestion.raw_response })
        setPageMetadata(prev => {
          const next = new Map(prev)
          next.set(p.pageNumber, {
            doc_type: suggestion.doc_type,
            has_signature: suggestion.has_signature,
            field_log_id: suggestion.field_log_id,
            foreman_name: suggestion.foreman_name,
            date: suggestion.date,
            ocrStatus: 'done',
            raw_response: suggestion.raw_response
          })
          return next
        })
      } catch (err) {
        recorder?.addSuggestion({ pageNumber: p.pageNumber, suggestion: null, error: err.message })
        setPageMetadata(prev => {
          const next = new Map(prev)
          next.set(p.pageNumber, { ...(next.get(p.pageNumber) || {}), ocrStatus: 'failed', error: err.message })
          return next
        })
        if (err.message === 'CREDIT_BALANCE_TOO_LOW') {
          setWarning('Anthropic API credit balance too low. Stopped OCR; you can still sort manually.')
          setOcrStatus('failed')
          return
        }
      }
      done++
      setOcrProgress({ done, total: targets.length })
    }
    setOcrStatus(prev => prev === 'failed' ? 'failed' : 'done')
  }

  // ── Index review handlers ──────────────────────────────────────────────
  const updateIndexEntry = (i, field, value) => {
    setIndexEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }
  const deleteIndexEntry = (i) => setIndexEntries(prev => prev.filter((_, idx) => idx !== i))
  const addIndexEntry = () => setIndexEntries(prev => [...prev, { first_name: '', last_name: '', role: '', ticket_number: '' }])
  const confirmIndex = () => {
    setIndexConfirmed(true)
    setShowIndexReview(false)
    // Auto-send page 1 to Skip if it's the index page
    if (indexSource === 'page1' && !skipPages.includes(1) && !pageGroupMap.has(1)) {
      setSkipPages(prev => prev.includes(1) ? prev : [...prev, 1])
    }
  }
  const dismissIndex = () => {
    setIndexConfirmed(false)
    setIndexEntries([])
    setShowIndexReview(false)
    setIndexSource(null)
  }

  // ── Page selection ─────────────────────────────────────────────────────
  const togglePage = (pageNumber) => {
    setSelectedPageNumbers(prev => {
      const next = new Set(prev)
      if (next.has(pageNumber)) next.delete(pageNumber)
      else next.add(pageNumber)
      return next
    })
  }
  const clearSelection = () => setSelectedPageNumbers(new Set())

  // ── Undo history ───────────────────────────────────────────────────────
  // Every mutating action calls pushHistory() at the START so a single
  // click of Undo reverses the most recent edit. Capped at 50 entries
  // to keep localStorage / memory bounded.
  const pushHistory = () => {
    setHistory(prev => {
      const snap = {
        groups: groups.map(g => ({ ...g })),
        skipPages: [...skipPages],
        pageMetadata: new Map(pageMetadata)
      }
      const next = [...prev, snap]
      return next.length > 50 ? next.slice(-50) : next
    })
  }
  const undo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev
      const snap = prev[prev.length - 1]
      setGroups(snap.groups)
      setSkipPages(snap.skipPages)
      setPageMetadata(snap.pageMetadata)
      return prev.slice(0, -1)
    })
  }

  // ── Page unassign / move helpers ───────────────────────────────────────
  const removePagesFromAll = (pageNumbers) => {
    const set = new Set(pageNumbers)
    setGroups(prev => prev.map(g => ({
      ...g,
      lemPages: (g.lemPages || []).filter(n => !set.has(n)),
      ticketPages: (g.ticketPages || []).filter(n => !set.has(n)),
      otherPages: (g.otherPages || []).filter(n => !set.has(n))
    })))
    setSkipPages(prev => prev.filter(n => !set.has(n)))
  }
  const assignPagesToGroupSlot = (groupId, slot, pageNumbers) => {
    removePagesFromAll(pageNumbers)
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const current = g[slot] || []
      const merged = Array.from(new Set([...current, ...pageNumbers])).sort((a, b) => a - b)
      return { ...g, [slot]: merged }
    }))
  }
  const sendPagesToSkip = (pageNumbers) => {
    removePagesFromAll(pageNumbers)
    setSkipPages(prev => Array.from(new Set([...prev, ...pageNumbers])).sort((a, b) => a - b))
  }

  // Public wrappers that record history before applying the change
  const unassignPagesUndoable = (pageNumbers) => {
    if (!pageNumbers?.length) return
    pushHistory()
    removePagesFromAll(pageNumbers)
  }

  // ── Group lifecycle ────────────────────────────────────────────────────
  const makeGroupId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? `g-${crypto.randomUUID().slice(0, 8)}`
      : `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const createGroupFromIndex = (entry) => {
    pushHistory()
    const id = makeGroupId()
    setGroups(prev => [...prev, {
      id,
      ticket_number: entry.ticket_number || '',
      foreman_name: [entry.first_name, entry.last_name].filter(Boolean).join(' '),
      role: entry.role || '',
      date: indexDate || '',
      lemPages: [], ticketPages: [], otherPages: []
    }])
  }
  const createEmptyGroup = () => {
    pushHistory()
    const id = makeGroupId()
    setGroups(prev => [...prev, {
      id, ticket_number: '', foreman_name: '', role: '', date: indexDate || '',
      lemPages: [], ticketPages: [], otherPages: []
    }])
  }
  const updateGroupField = (groupId, field, value) => {
    // Per-keystroke field edits are not pushed to history (too noisy).
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, [field]: value } : g))
  }
  const removeGroup = (groupId) => {
    if (!window.confirm('Remove this group? Pages will return to ungrouped.')) return
    pushHistory()
    setGroups(prev => prev.filter(g => g.id !== groupId))
  }

  // ── Drop handlers ──────────────────────────────────────────────────────
  const handleDropOnSlot = (groupId, slot, payload) => {
    if (!payload?.pageNumbers?.length) return
    pushHistory()
    assignPagesToGroupSlot(groupId, slot, payload.pageNumbers)
    clearSelection()
  }
  const handleDropOnNewGroup = (payload) => {
    if (!payload?.pageNumbers?.length) return
    pushHistory()
    const id = makeGroupId()
    // Default new pages into LEM unless meta says otherwise
    const lemPages = []
    const ticketPages = []
    const otherPages = []
    for (const n of payload.pageNumbers) {
      const meta = pageMetadata.get(n)
      if (meta?.doc_type === 'daily_ticket') ticketPages.push(n)
      else if (meta?.doc_type === 'signature') otherPages.push(n)
      else lemPages.push(n)
    }
    // Try to pre-fill foreman/ticket from the first page's metadata
    const first = pageMetadata.get(payload.pageNumbers[0])
    setGroups(prev => [...prev, {
      id,
      ticket_number: first?.field_log_id || '',
      foreman_name: first?.foreman_name || '',
      role: '',
      date: first?.date || indexDate || '',
      lemPages: lemPages.sort((a, b) => a - b),
      ticketPages: ticketPages.sort((a, b) => a - b),
      otherPages: otherPages.sort((a, b) => a - b)
    }])
    removePagesFromAll(payload.pageNumbers)
    clearSelection()
  }
  const handleDropOnSkip = (payload) => {
    if (!payload?.pageNumbers?.length) return
    pushHistory()
    sendPagesToSkip(payload.pageNumbers)
    clearSelection()
  }

  // ── Sequential assign (2-step state machine) ───────────────────────────
  //
  // Flow per foreman:
  //   Start  -> creates an empty group keyed to the index entry,
  //             enters step 'lem'.
  //   Assign N (LEM)    -> next N ungrouped pages go to the group's LEM
  //                        slot, step advances to 'ticket'. The last
  //                        page of a LEM (data + signature) belongs in
  //                        this slot — do NOT carve signatures into a
  //                        separate step.
  //   Assign N (Ticket) -> next N go to ticket slot, foreman is
  //                        finished, seqWorkingGroupId is cleared and
  //                        the toolbar's nextEntry auto-derives to the
  //                        next foreman.
  //   Skip step         -> advances step without assigning (used when
  //                        the foreman has no LEM or no ticket).
  //   Done with foreman -> finishes the foreman at any step.
  //
  // The group still has an "otherPages" slot for the rare edge case
  // where a standalone signature-only page or unrelated attachment
  // belongs to this foreman — the admin reaches it via drag-and-drop,
  // not via the sequential walk.

  const slotForStep = (step) => step === 'lem' ? 'lemPages' : 'ticketPages'
  const nextStep = (step) => step === 'lem' ? 'ticket' : 'done'
  const stepLabel = (step) => step === 'lem' ? 'LEM' : 'Ticket'

  const scrollToNextUngrouped = (justAssignedPages = []) => {
    const justAssigned = new Set(justAssignedPages)
    const nextUngrouped = ungroupedPageNumbers.find(n => !justAssigned.has(n))
    if (nextUngrouped) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`page-thumb-${nextUngrouped}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const startSequentialFor = (entry) => {
    pushHistory()
    const id = makeGroupId()
    setGroups(prev => [...prev, {
      id,
      ticket_number: entry.ticket_number || '',
      foreman_name: [entry.first_name, entry.last_name].filter(Boolean).join(' '),
      role: entry.role || '',
      date: indexDate || '',
      lemPages: [], ticketPages: [], otherPages: []
    }])
    setSeqWorkingGroupId(id)
    setSeqStep('lem')
    scrollToNextUngrouped()
  }

  const sequentialStep = ({ pageCount }) => {
    if (!seqWorkingGroupId) return
    const targetPages = (pageCount > 0)
      ? ungroupedPageNumbers.slice(0, pageCount)
      : []
    if (targetPages.length > 0) {
      pushHistory()
      assignPagesToGroupSlot(seqWorkingGroupId, slotForStep(seqStep), targetPages)
    }
    const after = nextStep(seqStep)
    if (after === 'done') {
      sequentialDone(targetPages)
    } else {
      setSeqStep(after)
      scrollToNextUngrouped(targetPages)
    }
  }

  const sequentialSkipStep = () => {
    if (!seqWorkingGroupId) return
    const after = nextStep(seqStep)
    if (after === 'done') {
      sequentialDone()
    } else {
      setSeqStep(after)
    }
  }

  const sequentialDone = (justAssignedPages = []) => {
    setSeqWorkingGroupId(null)
    setSeqStep('lem')
    scrollToNextUngrouped(justAssignedPages)
  }

  const bulkClassify = (docType) => {
    pushHistory()
    setPageMetadata(prev => {
      const next = new Map(prev)
      for (const n of selectedPageNumbers) {
        next.set(n, { ...(next.get(n) || {}), doc_type: docType, ocrStatus: 'done' })
      }
      return next
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setStage('saving'); setError(''); setSaveSummary(null)
    recorder?.setGroups(groups)
    try {
      const result = await saveBulkUploadGroups({
        sourceFile: packageFile,
        groups,
        orgId: getOrgId(),
        projectId: null,
        uploadedBy: user?.id || null,
        bulkUploadId,
        onProgress: (msg, cur, tot) => {
          setSaveMsg(msg)
          if (typeof cur === 'number') setSaveCurrent(cur)
          if (typeof tot === 'number') setSaveTotal(tot)
        }
      })
      recorder?.setSaveSummary(result)
      recorder?.finalize()
      setSaveSummary(result)
      setStage('done')
      onComplete?.()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Save failed.')
      setStage('sorting')
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  const reset = () => {
    setStage('idle')
    setPackageFile(null); setPages([]); setPageMetadata(new Map())
    setIndexEntries([]); setIndexDate(''); setIndexSource(null)
    setShowIndexReview(false); setIndexConfirmed(false)
    setGroups([]); setSkipPages([])
    setSelectedPageNumbers(new Set())
    setOcrStatus('idle'); setOcrProgress({ done: 0, total: 0 })
    setSaveSummary(null); setSaveMsg(''); setError(''); setWarning('')
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div onClick={() => { if (!isBlocking) onClose() }}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000,
        display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 10
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'white', borderRadius: 8, width: '100%', maxWidth: 1400,
          display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
              Bulk Upload {packageFile ? `— ${packageFile.name}` : ''}
            </h2>
            {pages.length > 0 && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {pages.length} pages · {groups.length} groups · <strong>{ungroupedPageNumbers.length}</strong> ungrouped · {skipPages.length} skipped
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => downloadDiagnostics(recorder, packageFile?.name)}
              title="Download raw OCR JSON"
              style={{ padding: '6px 12px', backgroundColor: 'white', color: '#6b21a8', border: '1px solid #c084fc', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              ⬇ Diagnostics
            </button>
            <button onClick={() => { if (!isBlocking) onClose() }} disabled={isBlocking}
              style={{ padding: '6px 12px', backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: isBlocking ? 'not-allowed' : 'pointer', fontSize: 13 }}>
              Close
            </button>
          </div>
        </div>

        {error && (
          <div style={{ margin: '10px 20px', padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}
        {warning && (
          <div style={{ margin: '10px 20px', padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
            {warning}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {/* IDLE — pick a file */}
          {stage === 'idle' && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #d1d5db', borderRadius: 8, padding: '60px 20px',
                textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9fafb', margin: 20
              }}>
              <div style={{ fontSize: 16, color: '#374151', marginBottom: 8 }}>
                Drop a PDF here or click to browse
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Page 1 will be auto-scanned for the foreman index. You'll sort the rest of the pages into LEM/Ticket groups with drag-and-drop.
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
                onChange={(e) => handleFilePicked(e.target.files?.[0])} />
            </div>
          )}

          {/* SPLITTING — spinner */}
          {stage === 'splitting' && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{
                width: 48, height: 48, margin: '0 auto 18px',
                border: '4px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ fontSize: 14, color: '#111827' }}>Rendering PDF pages…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* SORTING — main workspace */}
          {stage === 'sorting' && (
            <>
              {showIndexReview && (
                <IndexReview
                  indexEntries={indexEntries}
                  indexDate={indexDate}
                  onChangeDate={setIndexDate}
                  onUpdateEntry={updateIndexEntry}
                  onDeleteEntry={deleteIndexEntry}
                  onAddEntry={addIndexEntry}
                  onConfirm={confirmIndex}
                  onDismiss={dismissIndex}
                  source={indexSource}
                />
              )}

              <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!showIndexReview && indexEntries.length > 0 && (
                  <button onClick={() => setShowIndexReview(true)}
                    style={{ padding: '5px 10px', backgroundColor: 'white', color: '#5b21b6', border: '1px solid #c4b5fd', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    📋 Edit index ({indexEntries.length} foremen)
                  </button>
                )}
                {indexEntries.length === 0 && (
                  <button onClick={() => indexFileInputRef.current?.click()}
                    style={{ padding: '5px 10px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    📋 Upload Index Page (separate file)
                  </button>
                )}
                <input ref={indexFileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
                  onChange={(e) => handleIndexFilePicked(e.target.files?.[0])} />
              </div>

              <QuickAssignToolbar
                selectedCount={selectedPageNumbers.size}
                ungroupedCount={ungroupedPageNumbers.length}
                indexEntries={indexConfirmed ? indexEntries : []}
                usedTicketNumbers={usedTicketNumbers}
                onBulkClassify={bulkClassify}
                onSendSelectedToSkip={() => { pushHistory(); sendPagesToSkip(Array.from(selectedPageNumbers)); clearSelection() }}
                onStartOcr={runBackgroundOcr}
                onClearSelection={clearSelection}
                ocrStatus={ocrStatus}
                ocrProgress={ocrProgress}
                historyDepth={history.length}
                onUndo={undo}
                seqWorkingGroup={groups.find(g => g.id === seqWorkingGroupId) || null}
                seqStep={seqStep}
                onSequentialStart={startSequentialFor}
                onSequentialStep={sequentialStep}
                onSequentialSkipStep={sequentialSkipStep}
                onSequentialDone={() => sequentialDone()}
              />

              <ThumbnailGrid
                pages={pages}
                pageMetadata={pageMetadata}
                pageGroupMap={pageGroupMap}
                selectedPageNumbers={selectedPageNumbers}
                onTogglePage={togglePage}
                onOpenLightbox={setLightboxPage}
              />

              <GroupingArea
                groups={groups}
                indexEntries={indexConfirmed ? indexEntries : []}
                usedTicketNumbers={usedTicketNumbers}
                skipPages={skipPages}
                onCreateGroupFromIndex={createGroupFromIndex}
                onCreateEmptyGroup={createEmptyGroup}
                onUpdateGroupField={updateGroupField}
                onRemoveGroup={removeGroup}
                onDropOnSlot={handleDropOnSlot}
                onDropOnNewGroup={handleDropOnNewGroup}
                onDropOnSkip={handleDropOnSkip}
                onUnassignPages={unassignPagesUndoable}
              />

              {groups.length > 0 && (
                <PreConfirmationSummary
                  groups={groups}
                  skipCount={skipPages.length}
                  ungroupedCount={ungroupedPageNumbers.length}
                  onProcess={handleSave}
                  onClose={onClose}
                  disabled={isBlocking}
                />
              )}

              {lightboxPage && (
                <PageLightbox page={lightboxPage} onClose={() => setLightboxPage(null)} />
              )}
            </>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <CompletionScreen
              summary={saveSummary}
              onUploadAnother={() => reset()}
              onDone={() => { reset(); onClose() }}
            />
          )}
        </div>

        {/* SAVING — full-screen overlay */}
        {stage === 'saving' && (
          <ProcessingOverlay message={saveMsg} current={saveCurrent} total={saveTotal} />
        )}
      </div>
    </div>
  )
}

function downloadDiagnostics(recorder, packageFilename) {
  if (!recorder) { alert('No diagnostics yet — start a run first.'); return }
  const snap = recorder.snapshot()
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = (snap.startedAt || new Date().toISOString()).replace(/[:.]/g, '-')
  const base = (packageFilename || 'bulk_upload').replace(/\.pdf$/i, '')
  const a = document.createElement('a')
  a.href = url
  a.download = `${base}__diagnostics__${stamp}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
