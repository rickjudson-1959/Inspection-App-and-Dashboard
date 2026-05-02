// =============================================================================
// Draft Auto-Save — full-form durability for the inspector report
//
// Runs alongside photoManager. Photos are durable from the moment they're
// picked (instant IndexedDB + background Storage upload). Everything else
// (text, numbers, labour rows, equipment rows, KP values, weather, etc.)
// gets snapshotted to IndexedDB every 30 seconds while the user is editing.
//
// On page load: loadDraftFor(...) returns the most recent snapshot (if any)
// so the form can offer recovery. On successful Save: clearDraftFor(...)
// wipes the snapshot since the canonical copy is now in Supabase.
// =============================================================================

import {
  putDraftSnapshot,
  getDraftSnapshot,
  deleteDraftSnapshot
} from './db'

const DRAFT_KEY_PREFIX_REPORT = 'report:'
const DRAFT_KEY_PREFIX_DRAFT = 'draft:'

/**
 * Build the IndexedDB key for a draft snapshot. Edit-mode reports use
 * 'report:<id>'; brand-new drafts use 'draft:<email>:<date>'. Either may
 * be null if the form isn't ready yet.
 */
export function makeDraftId({ reportId, inspectorEmail, reportDate }) {
  if (reportId) return `${DRAFT_KEY_PREFIX_REPORT}${reportId}`
  if (inspectorEmail && reportDate) {
    return `${DRAFT_KEY_PREFIX_DRAFT}${inspectorEmail.toLowerCase().trim()}:${reportDate}`
  }
  return null
}

/**
 * Build a snapshot from the form state. Strips File/Blob refs so the
 * snapshot serializes cleanly into IndexedDB and stays small. Photos
 * themselves are durable via photoManager — this snapshot only needs to
 * remember WHICH photos exist (by photoId) plus their per-photo metadata
 * (location, description), not the bytes.
 */
export function buildSnapshot(formState) {
  const cleanedBlocks = (formState.activityBlocks || []).map(stripBlobsFromBlock)
  return {
    selectedDate: formState.selectedDate || null,
    inspectorName: formState.inspectorName || '',
    spread: formState.spread || '',
    afe: formState.afe || '',
    pipeline: formState.pipeline || '',
    weather: formState.weather || '',
    precipitation: formState.precipitation ?? '',
    tempHigh: formState.tempHigh ?? '',
    tempLow: formState.tempLow ?? '',
    windSpeed: formState.windSpeed ?? '',
    rowCondition: formState.rowCondition || '',
    startTime: formState.startTime || '',
    stopTime: formState.stopTime || '',
    safetyNotes: formState.safetyNotes || '',
    safetyRecognitionData: formState.safetyRecognitionData || null,
    landEnvironment: formState.landEnvironment || '',
    wildlifeSightingData: formState.wildlifeSightingData || null,
    generalComments: formState.generalComments || '',
    visitors: formState.visitors || [],
    inspectorMileage: formState.inspectorMileage ?? '',
    inspectorEquipment: formState.inspectorEquipment || '',
    unitPriceItemsEnabled: !!formState.unitPriceItemsEnabled,
    unitPriceData: formState.unitPriceData || null,
    activityBlocks: cleanedBlocks,
    chainageReasons: formState.chainageReasons || {}
  }
}

function stripBlobsFromBlock(block) {
  if (!block || typeof block !== 'object') return block
  // Shallow clone everything; replace photo wrappers' .file with null but
  // keep photoId, originalName, location, description, uploadStatus, filename.
  const cleaned = { ...block }
  if (Array.isArray(block.workPhotos)) {
    cleaned.workPhotos = block.workPhotos.map(p => stripPhotoBlob(p))
  }
  if (Array.isArray(block.ticketPhotos)) {
    cleaned.ticketPhotos = block.ticketPhotos.map(p => stripPhotoBlob(p))
  }
  if (block.ticketPhoto instanceof File) {
    cleaned.ticketPhoto = null
  }
  return cleaned
}

function stripPhotoBlob(photo) {
  if (!photo) return photo
  if (photo instanceof File) {
    // Legacy File-only entry (no photoManager wrapper). Without a photoId
    // we can't recover it from IndexedDB, so we drop it from the snapshot.
    return null
  }
  const { file, blob, ...rest } = photo
  return rest
}

/**
 * Persist a snapshot. id is the IndexedDB key built by makeDraftId.
 */
export async function saveDraft({ id, reportId, draftKey, organizationId, inspectorEmail, reportDate, formState }) {
  if (!id) return null
  const snapshot = buildSnapshot(formState)
  return putDraftSnapshot({
    id,
    reportId,
    draftKey,
    organizationId,
    inspectorEmail,
    reportDate,
    formState: snapshot
  })
}

/**
 * Load the most recent snapshot for an edit-mode report or a brand-new
 * draft. Tries the report key first, then falls back to the draft key.
 */
export async function loadDraftFor({ reportId, inspectorEmail, reportDate }) {
  // Saved-report snapshot takes priority
  if (reportId) {
    const r = await getDraftSnapshot(`${DRAFT_KEY_PREFIX_REPORT}${reportId}`)
    if (r) return r
  }
  if (inspectorEmail && reportDate) {
    const d = await getDraftSnapshot(`${DRAFT_KEY_PREFIX_DRAFT}${inspectorEmail.toLowerCase().trim()}:${reportDate}`)
    if (d) return d
  }
  return null
}

/**
 * Clear all snapshots for a report (called after a successful save). We
 * remove both possible keys to handle the case where a draft graduated to
 * a saved report and we want to wipe both bookkeeping records.
 */
export async function clearDraftFor({ reportId, inspectorEmail, reportDate }) {
  if (reportId) {
    await deleteDraftSnapshot(`${DRAFT_KEY_PREFIX_REPORT}${reportId}`)
  }
  if (inspectorEmail && reportDate) {
    await deleteDraftSnapshot(`${DRAFT_KEY_PREFIX_DRAFT}${inspectorEmail.toLowerCase().trim()}:${reportDate}`)
  }
}

/**
 * Format a snapshot timestamp for the recovery banner.
 */
export function formatRecoveredAt(updatedAt) {
  if (!updatedAt) return ''
  const ms = Date.now() - updatedAt
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const date = new Date(updatedAt)
  return date.toLocaleString()
}
