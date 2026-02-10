// process-document/index.ts - Process uploaded documents for AI Agent search
// Extracts text, chunks, generates embeddings, stores in document_embeddings

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { document_id, organization_id } = await req.json()

    if (!document_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'document_id and organization_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    // Step 1: Fetch document metadata
    const { data: doc, error: docError } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      console.error('Document fetch error:', docError)
      return new Response(
        JSON.stringify({ error: 'Document not found', details: docError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing document: ${doc.file_name} (${doc.category})`)

    // Step 2: Download file content
    const fileUrl = doc.file_url
    let textContent = ''
    const fileName = doc.file_name.toLowerCase()

    try {
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || ''
      console.log(`File content-type: ${contentType}`)

      if (fileName.endsWith('.txt') || contentType.includes('text/plain')) {
        // Plain text files
        textContent = await response.text()
      } else if (fileName.endsWith('.pdf') || contentType.includes('pdf')) {
        // For PDFs, extract what text we can
        const arrayBuffer = await response.arrayBuffer()
        textContent = extractTextFromPdf(arrayBuffer)

        if (!textContent || textContent.length < 100) {
          // If basic extraction failed, try to get any readable strings
          textContent = extractReadableStrings(arrayBuffer)
        }

        console.log(`PDF extraction result: ${textContent.length} chars`)
      } else if (fileName.endsWith('.docx') || contentType.includes('officedocument')) {
        // For DOCX, extract XML text content
        const arrayBuffer = await response.arrayBuffer()
        textContent = extractTextFromDocx(arrayBuffer)
        console.log(`DOCX extraction result: ${textContent.length} chars`)
      } else {
        // Try to read as text for other formats
        const rawText = await response.text()
        // Filter out binary garbage
        textContent = rawText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ')
      }
    } catch (fetchError) {
      console.error('Error fetching document:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch document content', details: String(fetchError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clean up extracted text
    textContent = textContent.replace(/\s+/g, ' ').trim()

    if (!textContent || textContent.length < 20) {
      return new Response(
        JSON.stringify({
          error: 'Could not extract text from document',
          details: `Only extracted ${textContent.length} characters. Try uploading a text-based file (.txt, .csv) or a different format.`,
          extracted_sample: textContent.substring(0, 200)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Extracted ${textContent.length} characters from document`)
    console.log(`Sample: ${textContent.substring(0, 200)}...`)

    // Step 3: Chunk the text (larger chunks = fewer API calls = faster)
    const chunks = chunkText(textContent, 2000, 300)
    console.log(`Created ${chunks.length} chunks from ${textContent.length} chars`)

    // Step 4: Delete existing embeddings for this document
    const { error: deleteError } = await supabase
      .from('document_embeddings')
      .delete()
      .eq('source_id', document_id)

    if (deleteError) {
      console.error('Error deleting old embeddings:', deleteError)
    }

    // Step 5: Generate embeddings in parallel batches for speed
    const embeddings = []
    let embeddingErrors = 0
    const startTime = Date.now()
    const MAX_TIME_MS = 50000 // Leave 10s buffer before 60s timeout

    // Process in parallel batches of 5
    const BATCH_SIZE = 5
    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_TIME_MS) {
        console.log(`Time limit approaching, stopping at ${embeddings.length} embeddings`)
        break
      }

      const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE)
      const batchPromises = batch.map((chunk, idx) =>
        generateEmbedding(chunk, openaiKey).then(embedding => ({
          embedding,
          chunk,
          index: batchStart + idx
        })).catch(err => {
          console.error(`Error embedding chunk ${batchStart + idx}:`, err)
          return { embedding: null, chunk, index: batchStart + idx }
        })
      )

      const results = await Promise.all(batchPromises)

      for (const result of results) {
        if (result.embedding) {
          embeddings.push({
            organization_id,
            source_type: 'project_document',
            source_id: document_id,
            source_url: fileUrl,
            document_name: doc.file_name,
            document_category: doc.category,
            chunk_index: result.index,
            chunk_text: result.chunk,
            embedding: result.embedding,
            metadata: {
              version: doc.version_number,
              category_label: getCategoryLabel(doc.category)
            }
          })
        } else {
          embeddingErrors++
        }
      }

      // Small delay between batches to avoid rate limits
      if (batchStart + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }

    console.log(`Generated ${embeddings.length} embeddings (${embeddingErrors} errors) in ${Date.now() - startTime}ms`)

    // Step 6: Batch insert embeddings
    if (embeddings.length > 0) {
      // Insert in batches of 20 to avoid payload limits
      for (let i = 0; i < embeddings.length; i += 20) {
        const batch = embeddings.slice(i, i + 20)
        const { error: insertError } = await supabase
          .from('document_embeddings')
          .insert(batch)

        if (insertError) {
          console.error(`Error inserting batch ${i}:`, insertError)
          return new Response(
            JSON.stringify({ error: 'Failed to store embeddings', details: insertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
    }

    console.log(`Successfully processed ${embeddings.length} chunks for ${doc.file_name}`)

    return new Response(
      JSON.stringify({
        success: true,
        document: doc.file_name,
        category: doc.category,
        chunks_processed: embeddings.length,
        text_length: textContent.length,
        embedding_errors: embeddingErrors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('process-document error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Extract text from PDF - looks for text in various PDF structures
function extractTextFromPdf(arrayBuffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(arrayBuffer)
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const rawText = decoder.decode(bytes)

    const textChunks: string[] = []

    // Method 1: Extract text from PDF text streams (BT...ET blocks)
    const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g
    let match
    while ((match = btEtRegex.exec(rawText)) !== null) {
      const block = match[1]

      // Look for Tj (show text) operators
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g)
      if (tjMatches) {
        for (const tj of tjMatches) {
          const content = tj.match(/\(([^)]*)\)/)?.[1]
          if (content && content.length > 0) {
            // Decode PDF escape sequences
            const decoded = content
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r')
              .replace(/\\t/g, '\t')
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\\\/g, '\\')
            textChunks.push(decoded)
          }
        }
      }

      // Look for TJ (show text with positioning) operators
      const tjArrayMatches = block.match(/\[(.*?)\]\s*TJ/g)
      if (tjArrayMatches) {
        for (const tjArr of tjArrayMatches) {
          const innerMatches = tjArr.match(/\(([^)]*)\)/g)
          if (innerMatches) {
            for (const inner of innerMatches) {
              const content = inner.slice(1, -1)
              if (content && content.length > 0) {
                textChunks.push(content)
              }
            }
          }
        }
      }
    }

    // Method 2: Look for /Contents streams
    const contentMatches = rawText.match(/stream\s*([\s\S]*?)\s*endstream/g)
    if (contentMatches && textChunks.length < 50) {
      for (const stream of contentMatches) {
        // Try to find readable text in streams
        const readable = stream.match(/[A-Za-z][A-Za-z0-9\s.,;:!?'-]{10,}/g)
        if (readable) {
          textChunks.push(...readable)
        }
      }
    }

    return textChunks.join(' ').replace(/\s+/g, ' ').trim()
  } catch (e) {
    console.error('PDF extraction error:', e)
    return ''
  }
}

// Extract any readable ASCII strings from binary data
function extractReadableStrings(arrayBuffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(arrayBuffer)
    const chunks: string[] = []
    let currentChunk = ''

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i]
      // Printable ASCII range (32-126) plus newlines and tabs
      if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
        currentChunk += String.fromCharCode(byte)
      } else {
        if (currentChunk.length >= 20) { // Only keep strings of meaningful length
          // Filter out obvious binary patterns
          if (/[a-zA-Z]{3,}/.test(currentChunk)) {
            chunks.push(currentChunk.trim())
          }
        }
        currentChunk = ''
      }
    }

    if (currentChunk.length >= 20 && /[a-zA-Z]{3,}/.test(currentChunk)) {
      chunks.push(currentChunk.trim())
    }

    return chunks.join(' ').replace(/\s+/g, ' ').trim()
  } catch (e) {
    console.error('String extraction error:', e)
    return ''
  }
}

// Extract text from DOCX (ZIP containing XML)
// DOCX is a ZIP file - we look for document.xml content patterns
function extractTextFromDocx(arrayBuffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(arrayBuffer)
    const textChunks: string[] = []

    // DOCX is a ZIP, and the main content is in word/document.xml
    // We'll scan the binary for XML text patterns

    // Convert to string, handling binary data
    let rawText = ''
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i]
      if (byte >= 32 && byte <= 126) {
        rawText += String.fromCharCode(byte)
      } else if (byte === 10 || byte === 13 || byte === 9) {
        rawText += ' '
      }
    }

    // Look for <w:t> tags (Word text elements)
    const wtMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)
    if (wtMatches) {
      for (const match of wtMatches) {
        const content = match.replace(/<[^>]+>/g, '').trim()
        if (content.length > 0) {
          textChunks.push(content)
        }
      }
    }

    // Also look for plain text between tags
    const textBetweenTags = rawText.match(/>([A-Za-z][^<]{10,})</g)
    if (textBetweenTags && textChunks.length < 20) {
      for (const match of textBetweenTags) {
        const content = match.slice(1, -1).trim()
        if (content.length > 10 && /[a-zA-Z]{3,}/.test(content)) {
          textChunks.push(content)
        }
      }
    }

    // If still not enough, extract readable strings
    if (textChunks.length < 5) {
      const readable = rawText.match(/[A-Za-z][A-Za-z0-9\s.,;:!?'"-]{20,}/g)
      if (readable) {
        textChunks.push(...readable)
      }
    }

    const result = textChunks.join(' ').replace(/\s+/g, ' ').trim()
    console.log(`DOCX extraction: found ${textChunks.length} text chunks, ${result.length} chars`)
    return result
  } catch (e) {
    console.error('DOCX extraction error:', e)
    return ''
  }
}

// Chunk text with overlap for better context
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/)

  let currentChunk = ''

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      // Keep some overlap for context
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 6))
      currentChunk = overlapWords.join(' ') + ' ' + sentence
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  // If no sentences were found, chunk by character count
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize).trim())
    }
  }

  return chunks.filter(c => c.length >= 50) // Filter out tiny chunks
}

// Generate embedding using OpenAI
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

    if (!response.ok) {
      const errText = await response.text()
      console.error('OpenAI embedding error:', response.status, errText)
      return null
    }

    const data = await response.json()
    return data.data?.[0]?.embedding || null
  } catch (err) {
    console.error('Embedding generation error:', err)
    return null
  }
}

// Category label mapping
function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'prime_contract': 'Prime Contract',
    'scope_of_work': 'Scope of Work',
    'ifc_drawings': 'IFC Drawings',
    'typical_drawings': 'Typical Drawings',
    'project_specs': 'Project Specifications',
    'weld_procedures': 'Weld Procedures (WPS)',
    'contractor_schedule': 'Contractor Schedule',
    'erp': 'Emergency Response Plan',
    'emp': 'Environmental Management Plan',
    'itp': 'Inspection & Test Plan'
  }
  return labels[category] || category
}
