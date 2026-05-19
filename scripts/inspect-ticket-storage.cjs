/**
 * Discovery: list every table/column that stores a ticket_number-like
 * value, plus a sample row count per table. Used to scope what needs
 * updating when an admin corrects an OCR misread of a ticket number.
 */
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const SAMPLE = '18288'

// Candidate tables × columns to check. The script runs each query
// defensively (any 404/permission error is logged but doesn't abort).
const probes = [
  { table: 'reconciliation_documents', col: 'ticket_number' },
  { table: 'contractor_lems',          col: 'field_log_id' },
  { table: 'contractor_lem_uploads',   col: 'ticket_number' },
  { table: 'contractor_lem_uploads',   col: 'field_log_id' },
  { table: 'lem_line_items',           col: 'ticket_number' },
  { table: 'document_matches',         col: 'match_key' },
  { table: 'reconciliation_line_items',col: 'ticket_number' },
  { table: 'lem_reconciliation_pairs', col: 'ticket_number' },
  { table: 'contractor_tickets',       col: 'ticket_number' },
]

async function probe(table, col) {
  // Probe 1: does the table exist and does the column? `.select(col)` will
  // fail with PGRST204 / 42703 if the column is missing.
  const { count, error: countErr } = await supabase.from(table)
    .select(col, { count: 'exact', head: true })
  if (countErr) {
    return { exists: false, count: 0, sample_match: null, error: countErr.message }
  }

  // Probe 2: any rows containing the sample ticket number?
  const { data: matches } = await supabase.from(table).select('*').ilike(col, `%${SAMPLE}%`).limit(1)
  return {
    exists: true,
    count: count ?? '?',
    sample_match: matches && matches.length > 0 ? Object.keys(matches[0]) : null,
  }
}

;(async () => {
  console.log(`Discovery — every table storing ticket-number-like values (sample = "${SAMPLE}"):\n`)
  console.log('| Table                        | Column         | Exists | Total rows | Has 18288? | All columns on a matched row |')
  console.log('|------------------------------|----------------|--------|------------|------------|------------------------------|')
  for (const { table, col } of probes) {
    const r = await probe(table, col)
    const exists = r.exists ? 'yes' : 'no'
    const matched = r.sample_match ? 'yes' : (r.exists ? 'no' : '—')
    const cols = r.sample_match ? r.sample_match.join(', ') : (r.error || '—')
    console.log(`| ${table.padEnd(28)} | ${col.padEnd(14)} | ${exists.padEnd(6)} | ${String(r.count).padEnd(10)} | ${matched.padEnd(10)} | ${cols}`)
  }
})()
