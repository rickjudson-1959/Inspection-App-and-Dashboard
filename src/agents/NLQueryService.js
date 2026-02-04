// NLQueryService.js - Browser-side client for "Ask the Agent" NLQ
// Calls the mentor-nlq edge function

import { supabase } from '../supabase'

/**
 * Ask the agent a natural language question about pipeline construction.
 *
 * @param {string} question - The inspector's question
 * @param {Object} context - { activityType, blockId }
 * @param {string} organizationId - Organization UUID
 * @returns {Promise<Object>} { answer, sources, suggestedActions, error }
 */
async function askAgent(question, context, organizationId) {
  if (!question?.trim() || !organizationId) {
    return { answer: null, sources: [], error: 'Question and organization are required' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('mentor-nlq', {
      body: {
        question: question.trim(),
        activity_type: context?.activityType || null,
        organization_id: organizationId
      }
    })

    if (error) {
      console.error('[NLQueryService] Edge function error:', error)
      return {
        answer: null,
        sources: [],
        error: 'Failed to reach the knowledge base. Please try again.'
      }
    }

    return {
      answer: data.answer,
      sources: data.sources || [],
      documentsSearched: data.documentsSearched || 0,
      error: null
    }
  } catch (err) {
    console.error('[NLQueryService] Request error:', err)
    return {
      answer: null,
      sources: [],
      error: 'Network error. Please check your connection.'
    }
  }
}

/**
 * Save a question to localStorage history (last 5 questions).
 */
function saveToHistory(question, answer) {
  try {
    const key = 'mentor_nlq_history'
    const history = JSON.parse(localStorage.getItem(key) || '[]')
    history.unshift({
      question,
      answer: answer?.substring(0, 200),
      timestamp: new Date().toISOString()
    })
    // Keep last 5
    localStorage.setItem(key, JSON.stringify(history.slice(0, 5)))
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get question history from localStorage.
 */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('mentor_nlq_history') || '[]')
  } catch {
    return []
  }
}

export { askAgent, saveToHistory, getHistory }

export default { askAgent, saveToHistory, getHistory }
