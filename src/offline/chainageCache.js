import { supabase } from '../supabase'
import {
  saveChainageCache,
  getChainageCacheByActivity,
  getAllChainageCache,
  clearChainageCache
} from './db'

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours
const MAX_REPORTS_TO_FETCH = 500

class ChainageCacheManager {
  constructor() {
    this.isRefreshing = false
  }

  // Initialize cache on app load
  async init() {
    const cache = await getAllChainageCache()
    const now = Date.now()

    // Check if cache is stale
    const isStale = cache.length === 0 || cache.some(c => now - c.updatedAt > CACHE_MAX_AGE)

    if (isStale && navigator.onLine) {
      await this.refreshCache()
    }
  }

  // Refresh cache from server
  async refreshCache() {
    if (this.isRefreshing || !navigator.onLine) {
      console.log('[ChainageCache] Skipping refresh - already refreshing or offline')
      return
    }

    this.isRefreshing = true
    console.log('[ChainageCache] Refreshing cache from server...')

    try {
      // Fetch last N reports with chainage data
      const { data: reports, error } = await supabase
        .from('daily_tickets')
        .select('date, spread, activity_blocks')
        .order('date', { ascending: false })
        .limit(MAX_REPORTS_TO_FETCH)

      if (error) {
        console.error('[ChainageCache] Error fetching reports:', error)
        return
      }

      // Group chainage data by activity type
      const chainageByActivity = {}

      for (const report of reports) {
        const blocks = report.activity_blocks || []
        for (const block of blocks) {
          if (!block.activityType || !block.startKP || !block.endKP) continue

          if (!chainageByActivity[block.activityType]) {
            chainageByActivity[block.activityType] = []
          }

          chainageByActivity[block.activityType].push({
            date: report.date,
            spread: report.spread,
            startKP: block.startKP,
            endKP: block.endKP
          })
        }
      }

      // Clear old cache and save new data
      await clearChainageCache()

      for (const [activityType, ranges] of Object.entries(chainageByActivity)) {
        await saveChainageCache({
          activityType,
          ranges
        })
      }

      console.log(`[ChainageCache] Cache refreshed with ${Object.keys(chainageByActivity).length} activity types`)
    } catch (error) {
      console.error('[ChainageCache] Refresh error:', error)
    } finally {
      this.isRefreshing = false
    }
  }

  // Check for overlaps using cached data (for offline use)
  async checkOverlapsOffline(activityBlocks, currentDate) {
    const warnings = []

    for (const block of activityBlocks) {
      if (!block.activityType || !block.startKP || !block.endKP) continue

      const cache = await getChainageCacheByActivity(block.activityType)
      if (!cache || !cache.ranges) continue

      const blockStart = this.parseKPToMetres(block.startKP)
      const blockEnd = this.parseKPToMetres(block.endKP)

      if (blockStart === null || blockEnd === null) continue

      const blockMin = Math.min(blockStart, blockEnd)
      const blockMax = Math.max(blockStart, blockEnd)

      for (const range of cache.ranges) {
        // Skip same date (current report)
        if (range.date === currentDate) continue

        const rangeStart = this.parseKPToMetres(range.startKP)
        const rangeEnd = this.parseKPToMetres(range.endKP)

        if (rangeStart === null || rangeEnd === null) continue

        const rangeMin = Math.min(rangeStart, rangeEnd)
        const rangeMax = Math.max(rangeStart, rangeEnd)

        // Check for overlap
        if (blockMin < rangeMax && rangeMin < blockMax) {
          warnings.push({
            type: 'historical_cached',
            activity: block.activityType,
            blockId: block.id,
            message: `${block.activityType}: KP ${block.startKP}-${block.endKP} overlaps with report from ${range.date} (${range.startKP}-${range.endKP})`
          })
        }
      }
    }

    return warnings
  }

  // Parse KP string to metres
  parseKPToMetres(kpString) {
    if (!kpString) return null

    // Handle formats like "KP 12+500" or "12.5" or "12+500"
    const str = String(kpString).toUpperCase().replace('KP', '').trim()

    // Format: "12+500" = 12.5 km = 12500m
    if (str.includes('+')) {
      const [km, m] = str.split('+')
      return (parseFloat(km) * 1000) + parseFloat(m)
    }

    // Format: "12.5" = 12.5 km = 12500m
    const value = parseFloat(str)
    if (!isNaN(value)) {
      // If value is less than 100, assume it's in km
      // If greater, assume it's already in metres
      return value < 100 ? value * 1000 : value
    }

    return null
  }

  // Get all cached activity types
  async getCachedActivityTypes() {
    const cache = await getAllChainageCache()
    return cache.map(c => c.activityType)
  }

  // Get cache age
  async getCacheAge() {
    const cache = await getAllChainageCache()
    if (cache.length === 0) return null

    const oldestUpdate = Math.min(...cache.map(c => c.updatedAt))
    return Date.now() - oldestUpdate
  }

  // Force refresh
  async forceRefresh() {
    await clearChainageCache()
    await this.refreshCache()
  }
}

// Export singleton instance
export const chainageCache = new ChainageCacheManager()
