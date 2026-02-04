// MentorTipService.js - Proactive tips for activity types
// Checks mentor_tips table first, supplements via RAG if < 3 results

import { supabase } from '../supabase'

// In-memory cache: key = `${activityType}::${orgId}`
const tipCache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Get mentor tips for an activity type.
 * Checks mentor_tips table first. If fewer than 3 results,
 * supplements with RAG query using match_documents().
 *
 * @param {string} activityType - Activity type string
 * @param {string} orgId - Organization UUID
 * @returns {Promise<Array>} Array of tip objects { title, content, source, category }
 */
async function getTipsForActivity(activityType, orgId) {
  if (!activityType || !orgId) return []

  const cacheKey = `${activityType}::${orgId}`
  const cached = tipCache.get(cacheKey)

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tips
  }

  try {
    // Query the mentor_tips table
    const { data: dbTips, error } = await supabase
      .from('mentor_tips')
      .select('*')
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .eq('activity_type', activityType)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(10)

    if (error) {
      console.warn('[MentorTipService] DB query error:', error.message)
    }

    let tips = (dbTips || []).map(t => ({
      id: t.id,
      title: t.title,
      content: t.content,
      source: t.source_document,
      category: t.tip_category,
      priority: t.priority,
      fromRAG: false
    }))

    // If fewer than 3 tips, supplement with RAG
    if (tips.length < 3) {
      const ragTips = await generateTipsFromRAG(activityType, orgId)
      // Only add RAG tips that don't duplicate existing titles
      const existingTitles = new Set(tips.map(t => t.title.toLowerCase()))
      for (const ragTip of ragTips) {
        if (!existingTitles.has(ragTip.title.toLowerCase())) {
          tips.push(ragTip)
        }
        if (tips.length >= 5) break
      }
    }

    // Cache the result
    tipCache.set(cacheKey, { tips, fetchedAt: Date.now() })

    return tips
  } catch (err) {
    console.error('[MentorTipService] Error fetching tips:', err)
    return []
  }
}

/**
 * Generate tips from RAG by querying document embeddings.
 * Uses match_documents() RPC to find relevant document chunks.
 *
 * @param {string} activityType - Activity type string
 * @param {string} orgId - Organization UUID
 * @returns {Promise<Array>} Array of RAG-generated tip objects
 */
async function generateTipsFromRAG(activityType, orgId) {
  try {
    const queryText = `Key quality checks and inspection requirements for ${activityType} pipeline construction`

    // Generate embedding for the query
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: queryText
      })
    })

    if (!embeddingResponse.ok) {
      console.warn('[MentorTipService] Embedding API error, skipping RAG tips')
      return []
    }

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.data?.[0]?.embedding

    if (!embedding) return []

    // Query match_documents RPC
    const { data: matches, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: 5,
      filter_org_id: orgId,
      filter_category: null
    })

    if (error || !matches?.length) {
      return []
    }

    // Convert matches to tip format
    return matches.map((match, idx) => ({
      id: `rag_${match.id}`,
      title: `${activityType} - ${match.document_name || 'Reference Document'}`,
      content: truncateContent(match.chunk_text, 300),
      source: match.document_name || 'Project Documents',
      category: 'quality',
      priority: 50 + idx,
      fromRAG: true,
      similarity: match.similarity
    }))
  } catch (err) {
    console.warn('[MentorTipService] RAG query error:', err.message)
    return []
  }
}

/**
 * Truncate content to a maximum length, breaking at sentence boundaries.
 */
function truncateContent(text, maxLen) {
  if (!text || text.length <= maxLen) return text || ''
  const truncated = text.substring(0, maxLen)
  const lastSentence = truncated.lastIndexOf('.')
  if (lastSentence > maxLen * 0.5) {
    return truncated.substring(0, lastSentence + 1)
  }
  return truncated + '...'
}

/**
 * Clear the tip cache for a specific activity type or all.
 */
function clearTipCache(activityType, orgId) {
  if (activityType && orgId) {
    tipCache.delete(`${activityType}::${orgId}`)
  } else {
    tipCache.clear()
  }
}

export { getTipsForActivity, generateTipsFromRAG, clearTipCache }

export default { getTipsForActivity, generateTipsFromRAG, clearTipCache }
