// mentor-nlq/index.ts - Edge function for natural language queries
// Phase 4: "Ask the Agent" - queries technical knowledge via RAG

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { question, activity_type, organization_id } = await req.json()

    if (!question || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'question and organization_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    // Step 1: Generate embedding for the question
    const embedding = await generateEmbedding(question, openaiKey)
    if (!embedding) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate embedding' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2a: Search organization-specific documents (Project Document Vault)
    const { data: orgMatches, error: orgMatchError } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: 5,
      filter_org_id: organization_id,
      filter_category: null
    })

    if (orgMatchError) {
      console.error('match_documents (org) error:', orgMatchError)
    }

    // Step 2b: Search global documents (Technical Resource Library)
    const GLOBAL_ORG_ID = '00000000-0000-0000-0000-000000000001'
    const { data: globalMatches, error: globalMatchError} = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.6,
      match_count: 5,
      filter_org_id: GLOBAL_ORG_ID,
      filter_category: null
    })

    if (globalMatchError) {
      console.error('match_documents (global) error:', globalMatchError)
    }

    // Merge and deduplicate results, prioritizing org-specific documents
    const allMatches = [
      ...(orgMatches || []),
      ...(globalMatches || [])
    ]
    const seenIds = new Set()
    const documentChunks = allMatches.filter((doc: any) => {
      if (seenIds.has(doc.id)) return false
      seenIds.add(doc.id)
      return true
    }).slice(0, 8) // Total limit of 8 chunks

    // Step 3: Build prompt with retrieved chunks
    const contextText = documentChunks.length > 0
      ? documentChunks.map((doc: any, i: number) =>
          `[Source ${i + 1}: ${doc.document_name || 'Document'}]\n${doc.chunk_text}`
        ).join('\n\n---\n\n')
      : 'No relevant documents found in the knowledge base.'

    const systemPrompt = `You are an experienced pipeline construction inspector mentor. You answer questions about pipeline inspection, construction quality, and regulatory requirements using the provided reference documents.

Rules:
- Answer concisely and practically, as if speaking to a field inspector
- Always cite the source document when referencing specific requirements
- If the answer isn't in the provided documents, say so clearly and provide general industry knowledge
- Use specific values, measurements, and standards where available
- Keep answers under 300 words
${activity_type ? `- The inspector is currently working on: ${activity_type}` : ''}`

    const userPrompt = `Question: ${question}

Reference Documents:
${contextText}`

    // Step 4: Call Claude for the answer
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text()
      console.error('Claude API error:', errBody)
      return new Response(
        JSON.stringify({ error: 'AI processing failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeResponse.json()
    const answer = claudeData.content?.[0]?.text || 'Unable to generate an answer.'

    // Step 5: Format sources
    const sources = documentChunks.map((doc: any) => ({
      document: doc.document_name || 'Unknown',
      section: doc.document_category || '',
      similarity: Math.round((doc.similarity || 0) * 100)
    }))

    // Step 6: Log to ai_agent_logs
    await supabase.from('ai_agent_logs').insert({
      organization_id,
      query_type: 'nlq_query',
      query_text: question,
      result_summary: answer.substring(0, 500),
      documents_searched: documentChunks.length,
      metadata: {
        activity_type,
        sources: sources.slice(0, 5),
        model: 'claude-sonnet-4-20250514'
      }
    })

    return new Response(
      JSON.stringify({
        answer,
        sources,
        question,
        documentsSearched: documentChunks.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('mentor-nlq error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000)
      })
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.data?.[0]?.embedding || null
  } catch {
    return null
  }
}
