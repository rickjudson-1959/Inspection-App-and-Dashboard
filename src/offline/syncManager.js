import { supabase } from '../supabase'
import {
  savePendingReport,
  getPendingReports,
  getPendingReport,
  updatePendingReportStatus,
  deletePendingReport,
  savePhoto,
  getPhotosByReportId,
  updatePhotoSyncStatus,
  deletePhotosByReportId
} from './db'

const MAX_SYNC_ATTEMPTS = 5
const SYNC_RETRY_DELAY = 5000 // 5 seconds

class SyncManager {
  constructor() {
    this.isSyncing = false
    this.syncQueue = []
    this.initOnlineListener()
  }

  // Initialize listener for online/offline events
  initOnlineListener() {
    window.addEventListener('online', () => {
      console.log('[SyncManager] Back online, attempting sync...')
      this.syncAllPending()
    })
  }

  // Save a report for offline storage
  async saveReportOffline(reportData, activityBlocks) {
    const reportId = crypto.randomUUID()

    // Extract and store photos separately for performance
    const photoIds = []

    for (const block of activityBlocks) {
      // Store ticket photo
      if (block.ticketPhoto && block.ticketPhoto instanceof File) {
        const photoId = await this.storePhotoBlob({
          reportId,
          blockId: block.id,
          type: 'ticket',
          file: block.ticketPhoto
        })
        photoIds.push({ blockId: block.id, type: 'ticket', photoId })
      }

      // Store work photos
      if (block.workPhotos && block.workPhotos.length > 0) {
        for (let i = 0; i < block.workPhotos.length; i++) {
          const photo = block.workPhotos[i]
          if (photo.file && photo.file instanceof File) {
            const photoId = await this.storePhotoBlob({
              reportId,
              blockId: block.id,
              type: 'work',
              file: photo.file,
              metadata: {
                location: photo.location,
                description: photo.description,
                index: i
              }
            })
            photoIds.push({ blockId: block.id, type: 'work', photoId, index: i })
          }
        }
      }
    }

    // Build processed blocks without File objects (store photo references instead)
    const processedBlocks = activityBlocks.map(block => {
      const blockPhotoIds = photoIds.filter(p => p.blockId === block.id)
      const ticketPhotoRef = blockPhotoIds.find(p => p.type === 'ticket')
      const workPhotoRefs = blockPhotoIds.filter(p => p.type === 'work')

      return {
        id: block.id,
        activityType: block.activityType,
        contractor: block.contractor,
        foreman: block.foreman,
        ticketPhotoId: ticketPhotoRef?.photoId || null,
        ticketPhotoOriginalName: block.ticketPhoto?.name || null,
        startKP: block.startKP,
        endKP: block.endKP,
        workDescription: block.workDescription,
        labourEntries: block.labourEntries,
        equipmentEntries: block.equipmentEntries,
        qualityData: block.qualityData,
        workPhotoRefs: workPhotoRefs.map(ref => ({
          photoId: ref.photoId,
          index: ref.index
        })),
        workPhotoMetadata: block.workPhotos?.map(p => ({
          originalName: p.file?.name,
          location: p.location,
          description: p.description
        })) || [],
        timeLostReason: block.timeLostReason,
        timeLostHours: block.timeLostHours,
        timeLostDetails: block.timeLostDetails,
        chainageOverlapReason: block.chainageOverlapReason || null,
        chainageGapReason: block.chainageGapReason || null,
        weldData: block.weldData || null,
        bendingData: block.bendingData || null,
        stringingData: block.stringingData || null,
        coatingData: block.coatingData || null,
        clearingData: block.clearingData || null,
        counterboreData: block.counterboreData || null,
        ditchData: block.ditchData || null,
        hddData: block.hddData || null,
        pilingData: block.pilingData || null,
        hydrovacData: block.hydrovacData || null,
        welderTestingData: block.welderTestingData || null,
        hydrotestData: block.hydrotestData || null,
        tieInCompletionData: block.tieInCompletionData || null,
        gradingData: block.gradingData || null,
        cleaningLogData: block.cleaningLogData || null,
        machineCleanupData: block.machineCleanupData || null,
        finalCleanupData: block.finalCleanupData || null
      }
    })

    // Store report data
    const fullReportData = {
      ...reportData,
      activity_blocks: processedBlocks,
      offlineId: reportId,
      savedOfflineAt: Date.now()
    }

    await savePendingReport({
      id: reportId,
      ...fullReportData
    })

    // Dispatch event to notify UI
    window.dispatchEvent(new CustomEvent('offline-report-saved', {
      detail: { reportId, reportData: fullReportData }
    }))

    console.log(`[SyncManager] Report saved offline with ID: ${reportId}`)

    // Try to sync immediately if online
    if (navigator.onLine) {
      setTimeout(() => this.syncAllPending(), 1000)
    }

    return reportId
  }

  // Store a photo as a blob in IndexedDB
  async storePhotoBlob({ reportId, blockId, type, file, metadata = {} }) {
    const blob = await this.fileToBlob(file)
    const photoId = await savePhoto({
      reportId,
      blockId,
      type,
      blob,
      metadata: {
        ...metadata,
        originalName: file.name,
        mimeType: file.type,
        size: file.size
      }
    })
    return photoId
  }

  // Convert File to Blob
  async fileToBlob(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const arrayBuffer = reader.result
        resolve(new Blob([arrayBuffer], { type: file.type }))
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  // Sync all pending reports
  async syncAllPending() {
    if (this.isSyncing) {
      console.log('[SyncManager] Sync already in progress')
      return
    }

    if (!navigator.onLine) {
      console.log('[SyncManager] Offline, cannot sync')
      return
    }

    this.isSyncing = true
    window.dispatchEvent(new CustomEvent('sync-start'))

    try {
      const pendingReports = await getPendingReports()
      console.log(`[SyncManager] Found ${pendingReports.length} pending reports`)

      for (const report of pendingReports) {
        if (report.status === 'syncing') {
          // Already being synced, skip
          continue
        }

        if (report.syncAttempts >= MAX_SYNC_ATTEMPTS) {
          console.log(`[SyncManager] Report ${report.id} exceeded max attempts, marking as failed`)
          await updatePendingReportStatus(report.id, 'failed', report.syncAttempts)
          continue
        }

        await this.syncReport(report)
      }

      window.dispatchEvent(new CustomEvent('sync-complete'))
    } catch (error) {
      console.error('[SyncManager] Sync error:', error)
      window.dispatchEvent(new CustomEvent('sync-error', { detail: { error } }))
    } finally {
      this.isSyncing = false
    }
  }

  // Sync a single report
  async syncReport(report) {
    console.log(`[SyncManager] Syncing report ${report.id}...`)
    console.log(`[SyncManager] Report data:`, report.reportData)
    await updatePendingReportStatus(report.id, 'syncing', report.syncAttempts + 1)

    try {
      // Check for conflicts first
      console.log(`[SyncManager] Checking for conflicts...`)
      const conflict = await this.checkForConflict(report.reportData)
      console.log(`[SyncManager] Conflict check result:`, conflict)
      if (conflict) {
        console.log(`[SyncManager] Conflict detected for report ${report.id}`)
        await updatePendingReportStatus(report.id, 'conflict', report.syncAttempts + 1)

        // Dispatch conflict event for UI to handle
        window.dispatchEvent(new CustomEvent('sync-conflict', {
          detail: { report, existingReport: conflict }
        }))
        return
      }

      // Get photos for this report
      console.log(`[SyncManager] Getting photos...`)
      const photos = await getPhotosByReportId(report.id)
      console.log(`[SyncManager] Found ${photos.length} photos`)

      // Upload photos first
      const uploadedPhotos = await this.uploadPhotos(photos, report.reportData)

      // Build final activity blocks with uploaded photo filenames
      const finalBlocks = await this.buildFinalBlocks(report.reportData.activity_blocks, uploadedPhotos)

      // Insert report to database (with organization_id from saved report data)
      const { data, error } = await supabase
        .from('daily_tickets')
        .insert({
          date: report.reportData.date,
          spread: report.reportData.spread,
          afe: report.reportData.afe,
          inspector_name: report.reportData.inspector_name,
          pipeline: report.reportData.pipeline,
          weather: report.reportData.weather,
          precipitation: report.reportData.precipitation,
          temp_high: report.reportData.temp_high,
          temp_low: report.reportData.temp_low,
          wind_speed: report.reportData.wind_speed,
          row_condition: report.reportData.row_condition,
          start_time: report.reportData.start_time,
          stop_time: report.reportData.stop_time,
          activity_blocks: finalBlocks,
          safety_notes: report.reportData.safety_notes,
          safety_recognition: report.reportData.safety_recognition,
          land_environment: report.reportData.land_environment,
          wildlife_sighting: report.reportData.wildlife_sighting,
          general_comments: report.reportData.general_comments,
          visitors: report.reportData.visitors,
          inspector_mileage: report.reportData.inspector_mileage,
          inspector_equipment: report.reportData.inspector_equipment,
          unit_price_items_enabled: report.reportData.unit_price_items_enabled,
          unit_price_data: report.reportData.unit_price_data,
          created_by: report.reportData.created_by,
          organization_id: report.reportData.organization_id
        })
        .select()
        .single()

      if (error) throw error

      console.log(`[SyncManager] Report synced successfully. DB ID: ${data.id}`)

      // Create report_status entry (with organization_id)
      await supabase.from('report_status').insert({
        report_id: data.id,
        status: 'submitted',
        changed_by: report.reportData.created_by,
        reason: 'Synced from offline',
        organization_id: report.reportData.organization_id
      })

      // Clean up local data
      await deletePhotosByReportId(report.id)
      await deletePendingReport(report.id)

      console.log(`[SyncManager] Cleaned up local data for report ${report.id}`)
      return data

    } catch (error) {
      console.error(`[SyncManager] Failed to sync report ${report.id}:`, error)
      await updatePendingReportStatus(report.id, 'pending_sync', report.syncAttempts + 1)

      // Retry after delay if not at max attempts
      if (report.syncAttempts + 1 < MAX_SYNC_ATTEMPTS) {
        setTimeout(() => this.syncReport(report), SYNC_RETRY_DELAY)
      }
    }
  }

  // Check for existing report with same date/inspector/spread (within same org)
  async checkForConflict(reportData) {
    let query = supabase
      .from('daily_tickets')
      .select('id, date, spread, inspector_name, created_at')
      .eq('date', reportData.date)
      .eq('spread', reportData.spread)
      .eq('inspector_name', reportData.inspector_name)

    // Only check within the same organization
    if (reportData.organization_id) {
      query = query.eq('organization_id', reportData.organization_id)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      console.error('[SyncManager] Conflict check error:', error)
      return null
    }

    return data // Returns null if no conflict
  }

  // Upload photos to Supabase Storage
  async uploadPhotos(photos, reportData) {
    const uploaded = {}

    for (const photo of photos) {
      try {
        const bucket = photo.type === 'ticket' ? 'ticket-photos' : 'work-photos'
        const fileExt = photo.metadata.originalName?.split('.').pop() || 'jpg'
        const fileName = `${photo.type}_${Date.now()}_${photo.blockId}_${photo.id}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, photo.blob, {
            contentType: photo.metadata.mimeType || 'image/jpeg'
          })

        if (uploadError) {
          console.error(`[SyncManager] Failed to upload photo ${photo.id}:`, uploadError)
          continue
        }

        await updatePhotoSyncStatus(photo.id, 'uploaded', fileName)

        if (!uploaded[photo.blockId]) {
          uploaded[photo.blockId] = { ticket: null, work: [] }
        }

        if (photo.type === 'ticket') {
          uploaded[photo.blockId].ticket = fileName
        } else {
          uploaded[photo.blockId].work.push({
            filename: fileName,
            index: photo.metadata.index,
            originalName: photo.metadata.originalName,
            location: photo.metadata.location,
            description: photo.metadata.description,
            inspector: reportData.inspector_name,
            date: reportData.date,
            spread: reportData.spread,
            afe: reportData.afe
          })
        }

        console.log(`[SyncManager] Uploaded photo: ${fileName}`)
      } catch (error) {
        console.error(`[SyncManager] Photo upload error:`, error)
      }
    }

    return uploaded
  }

  // Build final activity blocks with uploaded photo filenames
  async buildFinalBlocks(blocks, uploadedPhotos) {
    return blocks.map(block => {
      const blockPhotos = uploadedPhotos[block.id] || { ticket: null, work: [] }

      return {
        id: block.id,
        activityType: block.activityType,
        contractor: block.contractor,
        foreman: block.foreman,
        ticketPhoto: blockPhotos.ticket,
        startKP: block.startKP,
        endKP: block.endKP,
        workDescription: block.workDescription,
        labourEntries: block.labourEntries,
        equipmentEntries: block.equipmentEntries,
        qualityData: block.qualityData,
        workPhotos: blockPhotos.work.sort((a, b) => a.index - b.index),
        timeLostReason: block.timeLostReason,
        timeLostHours: block.timeLostHours,
        timeLostDetails: block.timeLostDetails,
        chainageOverlapReason: block.chainageOverlapReason,
        chainageGapReason: block.chainageGapReason,
        weldData: block.weldData,
        bendingData: block.bendingData,
        stringingData: block.stringingData,
        coatingData: block.coatingData,
        clearingData: block.clearingData,
        counterboreData: block.counterboreData,
        ditchData: block.ditchData,
        hddData: block.hddData,
        pilingData: block.pilingData,
        hydrovacData: block.hydrovacData,
        welderTestingData: block.welderTestingData,
        hydrotestData: block.hydrotestData,
        tieInCompletionData: block.tieInCompletionData,
        gradingData: block.gradingData,
        cleaningLogData: block.cleaningLogData,
        machineCleanupData: block.machineCleanupData,
        finalCleanupData: block.finalCleanupData
      }
    })
  }

  // Resolve conflict - keep local, keep server, or cancel
  async resolveConflict(reportId, resolution) {
    const report = await getPendingReport(reportId)
    if (!report) return

    if (resolution === 'keep_local') {
      // Update the existing server record (with org filter for security)
      let findQuery = supabase
        .from('daily_tickets')
        .select('id')
        .eq('date', report.reportData.date)
        .eq('spread', report.reportData.spread)
        .eq('inspector_name', report.reportData.inspector_name)

      // Only match within the same organization
      if (report.reportData.organization_id) {
        findQuery = findQuery.eq('organization_id', report.reportData.organization_id)
      }

      const { data: existing } = await findQuery.single()

      if (existing) {
        // Delete existing and insert new (scoped to same org via the query above)
        await supabase.from('daily_tickets').delete().eq('id', existing.id)
      }

      // Reset status and retry sync
      await updatePendingReportStatus(reportId, 'pending_sync', 0)
      await this.syncReport(report)

    } else if (resolution === 'keep_server') {
      // Just delete local copy
      await deletePhotosByReportId(reportId)
      await deletePendingReport(reportId)
      console.log(`[SyncManager] Discarded local report ${reportId}`)

    } else if (resolution === 'cancel') {
      // Keep as conflict for later resolution
      await updatePendingReportStatus(reportId, 'conflict')
    }

    window.dispatchEvent(new CustomEvent('offline-report-saved'))
  }

  // Get failed reports for manual retry
  async getFailedReports() {
    const all = await getPendingReports()
    return all.filter(r => r.status === 'failed' || r.status === 'conflict')
  }

  // Retry a failed report
  async retryReport(reportId) {
    const report = await getPendingReport(reportId)
    if (report) {
      await updatePendingReportStatus(reportId, 'pending_sync', 0)
      await this.syncReport(report)
    }
  }
}

// Export singleton instance
export const syncManager = new SyncManager()
