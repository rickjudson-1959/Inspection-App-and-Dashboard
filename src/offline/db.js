import { openDB } from 'idb'

const DB_NAME = 'egp-inspector-offline'
const DB_VERSION = 1

// Initialize and upgrade the IndexedDB database
export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // pendingReports store - Full report data waiting to sync
      if (!db.objectStoreNames.contains('pendingReports')) {
        const reportStore = db.createObjectStore('pendingReports', { keyPath: 'id' })
        reportStore.createIndex('status', 'status')
        reportStore.createIndex('createdAt', 'createdAt')
        reportStore.createIndex('date', 'reportData.date')
      }

      // photos store - Photo blobs stored separately for performance
      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' })
        photoStore.createIndex('reportId', 'reportId')
        photoStore.createIndex('blockId', 'blockId')
        photoStore.createIndex('type', 'type')
        photoStore.createIndex('syncStatus', 'syncStatus')
      }

      // chainageCache store - Historical KP ranges for overlap checking
      if (!db.objectStoreNames.contains('chainageCache')) {
        const chainageStore = db.createObjectStore('chainageCache', { keyPath: 'id' })
        chainageStore.createIndex('activityType', 'activityType')
        chainageStore.createIndex('updatedAt', 'updatedAt')
      }

      // userSession store - Cached auth for offline validation
      if (!db.objectStoreNames.contains('userSession')) {
        db.createObjectStore('userSession', { keyPath: 'id' })
      }
    }
  })
}

// Get the database instance
let dbInstance = null
export async function getDB() {
  if (!dbInstance) {
    dbInstance = await initDB()
  }
  return dbInstance
}

// =====================
// Pending Reports CRUD
// =====================

export async function savePendingReport(report) {
  const db = await getDB()
  const pendingReport = {
    id: report.id || crypto.randomUUID(),
    status: 'pending_sync',
    createdAt: Date.now(),
    syncAttempts: 0,
    lastSyncAttempt: null,
    reportData: report
  }
  await db.put('pendingReports', pendingReport)
  return pendingReport.id
}

export async function getPendingReports() {
  const db = await getDB()
  return db.getAll('pendingReports')
}

export async function getPendingReportsByStatus(status) {
  const db = await getDB()
  return db.getAllFromIndex('pendingReports', 'status', status)
}

export async function getPendingReport(id) {
  const db = await getDB()
  return db.get('pendingReports', id)
}

export async function updatePendingReportStatus(id, status, syncAttempts = null) {
  const db = await getDB()
  const report = await db.get('pendingReports', id)
  if (report) {
    report.status = status
    report.lastSyncAttempt = Date.now()
    if (syncAttempts !== null) {
      report.syncAttempts = syncAttempts
    }
    await db.put('pendingReports', report)
  }
  return report
}

export async function deletePendingReport(id) {
  const db = await getDB()
  await db.delete('pendingReports', id)
}

export async function getPendingReportCount() {
  const db = await getDB()
  return db.count('pendingReports')
}

// =====================
// Photos CRUD
// =====================

export async function savePhoto(photo) {
  const db = await getDB()
  const photoRecord = {
    id: photo.id || crypto.randomUUID(),
    reportId: photo.reportId,
    blockId: photo.blockId,
    type: photo.type, // 'ticket' or 'work'
    blob: photo.blob,
    metadata: photo.metadata || {},
    syncStatus: 'pending',
    createdAt: Date.now()
  }
  await db.put('photos', photoRecord)
  return photoRecord.id
}

export async function getPhotosByReportId(reportId) {
  const db = await getDB()
  return db.getAllFromIndex('photos', 'reportId', reportId)
}

export async function getPhotosByBlockId(blockId) {
  const db = await getDB()
  return db.getAllFromIndex('photos', 'blockId', blockId)
}

export async function getPhoto(id) {
  const db = await getDB()
  return db.get('photos', id)
}

export async function updatePhotoSyncStatus(id, syncStatus, uploadedFilename = null) {
  const db = await getDB()
  const photo = await db.get('photos', id)
  if (photo) {
    photo.syncStatus = syncStatus
    if (uploadedFilename) {
      photo.uploadedFilename = uploadedFilename
    }
    await db.put('photos', photo)
  }
  return photo
}

export async function deletePhoto(id) {
  const db = await getDB()
  await db.delete('photos', id)
}

export async function deletePhotosByReportId(reportId) {
  const db = await getDB()
  const photos = await db.getAllFromIndex('photos', 'reportId', reportId)
  for (const photo of photos) {
    await db.delete('photos', photo.id)
  }
}

// =====================
// Chainage Cache CRUD
// =====================

export async function saveChainageCache(chainageData) {
  const db = await getDB()
  const record = {
    id: chainageData.activityType,
    activityType: chainageData.activityType,
    ranges: chainageData.ranges,
    updatedAt: Date.now()
  }
  await db.put('chainageCache', record)
  return record.id
}

export async function getChainageCacheByActivity(activityType) {
  const db = await getDB()
  return db.get('chainageCache', activityType)
}

export async function getAllChainageCache() {
  const db = await getDB()
  return db.getAll('chainageCache')
}

export async function clearChainageCache() {
  const db = await getDB()
  const allCache = await db.getAll('chainageCache')
  for (const cache of allCache) {
    await db.delete('chainageCache', cache.id)
  }
}

// =====================
// User Session CRUD
// =====================

export async function saveUserSession(session) {
  const db = await getDB()
  const record = {
    id: 'current',
    ...session,
    savedAt: Date.now()
  }
  await db.put('userSession', record)
  return record
}

export async function getUserSession() {
  const db = await getDB()
  return db.get('userSession', 'current')
}

export async function clearUserSession() {
  const db = await getDB()
  await db.delete('userSession', 'current')
}

// =====================
// Utility Functions
// =====================

export async function clearAllData() {
  const db = await getDB()
  const tx = db.transaction(['pendingReports', 'photos', 'chainageCache', 'userSession'], 'readwrite')
  await Promise.all([
    tx.objectStore('pendingReports').clear(),
    tx.objectStore('photos').clear(),
    tx.objectStore('chainageCache').clear(),
    tx.objectStore('userSession').clear(),
    tx.done
  ])
}

export { DB_NAME, DB_VERSION }
