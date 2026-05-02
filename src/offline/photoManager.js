// =============================================================================
// Photo Manager — belt-and-suspenders durability
//
// On selection:
//   1. Photo blob is written to IndexedDB instantly (durable on device).
//   2. Background upload to Supabase Storage starts immediately, fire-and-forget.
//   3. Caller can subscribe to status changes via getStatus() / awaitUpload().
//
// On save:
//   • If photo.syncStatus === 'uploaded': caller records the filename and moves on.
//   • If still pending/uploading/failed: caller calls awaitUpload(photoId) which
//     either resolves an in-flight upload or kicks off a fresh attempt.
//
// On page load:
//   • loadPhotosForReport(reportId) returns persisted photos so React state
//     can be restored for a saved report.
//   • loadPhotosForDraft(draftKey) does the same for unsaved drafts (the
//     draftKey is a deterministic string like `draft:<email>:<date>`).
// =============================================================================

import { supabase } from '../supabase'
import {
  getDB,
  savePhoto as savePhotoToDB,
  updatePhotoSyncStatus,
  getPhoto,
  deletePhoto,
  getPhotosByReportId
} from './db'

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 2000

// In-memory map of photoId → upload Promise, so callers can await an in-flight upload.
const pendingUploads = new Map()

// Optional listener so React components can re-render when a photo's status changes.
const statusListeners = new Set()

export function subscribeToPhotoStatus(listener) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function notifyStatusChange(photoId, status, extras = {}) {
  for (const fn of statusListeners) {
    try { fn({ photoId, status, ...extras }) } catch (e) { /* ignore */ }
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Persist a photo locally and start the background upload.
 *
 * @param {object} args
 * @param {File|Blob} args.blob              The image blob.
 * @param {'work'|'ticket'} args.type        Which Storage bucket to target.
 * @param {string} args.blockId              Activity block UUID.
 * @param {string|null} args.reportId        daily_reports.id, or null for unsaved drafts.
 * @param {string|null} args.draftKey        Stable draft id (`draft:<email>:<date>`), used when reportId is null.
 * @param {string|null} args.organizationId
 * @param {string|null} args.inspectorEmail  Used to user-scope IndexedDB recovery so two users on the same device don't see each other's pending photos.
 * @param {object} args.metadata             { location, description, originalName }
 * @returns {Promise<string>}                The generated photoId.
 */
export async function persistPhoto({
  blob,
  type,
  blockId,
  reportId = null,
  draftKey = null,
  organizationId = null,
  inspectorEmail = null,
  metadata = {}
}) {
  if (!blob) throw new Error('persistPhoto: blob is required')
  if (type !== 'work' && type !== 'ticket') {
    throw new Error(`persistPhoto: invalid type ${type}`)
  }

  const photoId = crypto.randomUUID()
  const originalName = blob.name || metadata.originalName || `${type}_${Date.now()}.jpg`

  await savePhotoToDB({
    id: photoId,
    reportId,
    draftKey,
    organizationId,
    inspectorEmail,
    blockId,
    type,
    blob,
    metadata: {
      originalName,
      location: metadata.location || '',
      description: metadata.description || ''
    },
    // syncStatus is initialized to 'pending' inside savePhotoToDB
  })

  // Kick off the background upload — do not await.
  startBackgroundUpload(photoId, type, blob, originalName).catch(err => {
    console.warn(`[photoManager] background upload kicker error for ${photoId}:`, err)
  })

  return photoId
}

/**
 * Wait for a photo's upload to complete. If no upload is in flight, restart
 * one from the persisted blob. Resolves with { success, filename, error }.
 */
export async function awaitUpload(photoId) {
  // In-flight upload? Just wait for it.
  if (pendingUploads.has(photoId)) {
    return pendingUploads.get(photoId)
  }
  // Persisted record check
  const photo = await getPhoto(photoId)
  if (!photo) return { success: false, error: 'photo not found in IndexedDB' }
  if (photo.syncStatus === 'uploaded' && photo.uploadedFilename) {
    return { success: true, filename: photo.uploadedFilename }
  }
  // Pending / uploading / failed → kick a fresh attempt
  return startBackgroundUpload(
    photoId,
    photo.type,
    photo.blob,
    photo.metadata?.originalName || `${photo.type}_${photoId}.jpg`
  )
}

/**
 * Look up the current sync status for a photo.
 * Returns null if not found.
 */
export async function getStatus(photoId) {
  const photo = await getPhoto(photoId)
  if (!photo) return null
  return {
    photoId,
    status: photo.syncStatus || 'pending',
    filename: photo.uploadedFilename || null,
    error: photo.error || null
  }
}

/**
 * Load all photos persisted against a saved report. Used to restore React
 * state on page load when editing an existing report. When inspectorEmail
 * is provided, only photos owned by that user are returned — prevents
 * cross-user leakage on a shared device.
 */
export async function loadPhotosForReport(reportId, inspectorEmail = null) {
  if (!reportId) return []
  const all = await getPhotosByReportId(reportId)
  if (!inspectorEmail) return all
  const email = inspectorEmail.toLowerCase().trim()
  // Backward-compat: include legacy records with no inspectorEmail field
  // (those were created before user-scoping landed).
  return all.filter(p => !p.inspectorEmail || p.inspectorEmail === email)
}

/**
 * Load all photos persisted against a draft (unsaved report). The draftKey
 * already encodes the user via `draft:<email>:<date>`, so user-scoping is
 * implicit. inspectorEmail kept as an optional second filter for symmetry.
 */
export async function loadPhotosForDraft(draftKey, inspectorEmail = null) {
  if (!draftKey) return []
  const db = await getDB()
  const all = await db.getAll('photos')
  let rows = all.filter(p => p.draftKey === draftKey)
  if (inspectorEmail) {
    const email = inspectorEmail.toLowerCase().trim()
    rows = rows.filter(p => !p.inspectorEmail || p.inspectorEmail === email)
  }
  return rows
}

/**
 * Once a draft is saved (the report finally has an id), promote its draft
 * photos onto the saved reportId so subsequent loads find them.
 */
export async function reassociatePhotos({ photoIds, reportId }) {
  if (!reportId) return
  const db = await getDB()
  for (const id of photoIds || []) {
    const photo = await db.get('photos', id)
    if (photo) {
      photo.reportId = reportId
      photo.draftKey = null
      await db.put('photos', photo)
    }
  }
}

/**
 * Update local photo metadata (location, description). Doesn't trigger upload.
 */
export async function updatePhotoMetadata(photoId, metadata) {
  const db = await getDB()
  const photo = await db.get('photos', photoId)
  if (!photo) return
  photo.metadata = { ...(photo.metadata || {}), ...metadata }
  await db.put('photos', photo)
}

/**
 * Remove a photo entirely (when user clicks the X next to it). Cancels any
 * in-flight upload reference and deletes the IndexedDB row. The Storage
 * file (if already uploaded) becomes an orphan and is cleaned up by the
 * cleanup script.
 */
export async function removePhoto(photoId) {
  pendingUploads.delete(photoId)
  await deletePhoto(photoId)
}

/**
 * Mark a photo as 'archived' once it has been successfully saved into
 * `daily_reports.activity_blocks` JSONB. We don't delete it because the
 * blob is useful for offline-edit recovery, but it should no longer appear
 * in draft recovery sweeps.
 */
export async function markPhotoArchived(photoId) {
  const db = await getDB()
  const photo = await db.get('photos', photoId)
  if (!photo) return
  photo.syncStatus = 'archived'
  await db.put('photos', photo)
}

/**
 * Generate a deterministic draft key from inspector email + date.
 * Used to associate photos with an unsaved report.
 */
export function makeDraftKey(inspectorEmail, date) {
  if (!inspectorEmail || !date) return null
  return `draft:${inspectorEmail.toLowerCase().trim()}:${date}`
}

/**
 * Build a thumbnail-displayable URL for a photo record. Prefers the local
 * blob (instant, no network) when available; falls back to Supabase public
 * URL once the upload has completed and the local blob may have been GC'd.
 */
export function getDisplayUrl(photo) {
  if (!photo) return null
  if (photo.blob instanceof Blob || photo.blob instanceof File) {
    return URL.createObjectURL(photo.blob)
  }
  if (photo.uploadedFilename) {
    const bucket = photo.type === 'ticket' ? 'ticket-photos' : 'work-photos'
    const { data } = supabase.storage.from(bucket).getPublicUrl(photo.uploadedFilename)
    return data?.publicUrl || null
  }
  return null
}

// =============================================================================
// Internal: upload with retry
// =============================================================================

async function startBackgroundUpload(photoId, type, blob, originalName, attempt = 1) {
  const work = (async () => {
    try {
      await updatePhotoSyncStatus(photoId, 'uploading')
      notifyStatusChange(photoId, 'uploading')

      const bucket = type === 'ticket' ? 'ticket-photos' : 'work-photos'
      const ext = (originalName.split('.').pop() || 'jpg').toLowerCase()
      const filename = `${type}_${Date.now()}_${photoId}.${ext}`

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filename, blob, {
          contentType: blob.type || `image/${ext}`,
          upsert: false
        })

      if (error) throw error

      await updatePhotoSyncStatus(photoId, 'uploaded', filename)
      notifyStatusChange(photoId, 'uploaded', { filename })
      pendingUploads.delete(photoId)
      console.log(`[photoManager] uploaded ${photoId} → ${bucket}/${filename}`)
      return { success: true, filename }
    } catch (err) {
      console.warn(`[photoManager] upload attempt ${attempt} failed for ${photoId}: ${err.message}`)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt
        await new Promise(r => setTimeout(r, delay))
        // remove this attempt's promise so the retry can be tracked
        pendingUploads.delete(photoId)
        return startBackgroundUpload(photoId, type, blob, originalName, attempt + 1)
      }
      // out of retries — record failure but keep the IndexedDB blob so we can
      // retry later (e.g. when Save fires and explicitly awaits).
      await updatePhotoSyncStatus(photoId, 'failed')
      // attach error message
      try {
        const db = await getDB()
        const p = await db.get('photos', photoId)
        if (p) {
          p.error = err.message
          await db.put('photos', p)
        }
      } catch (_) { /* ignore */ }
      notifyStatusChange(photoId, 'failed', { error: err.message })
      pendingUploads.delete(photoId)
      return { success: false, error: err.message }
    }
  })()
  pendingUploads.set(photoId, work)
  return work
}
