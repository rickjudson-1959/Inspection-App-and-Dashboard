/**
 * One-off: find every trace of ticket 18288 (Kerry Untinen, 2014-01-21).
 * TK column on the package list shows missing; this dumps every row
 * across reconciliation_documents + contractor_lems + the
 * recon_package_status view, plus that view's definition, so we can
 * see exactly what the list is checking.
 */
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://aatvckalnvojlykfgnmz.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TARGET = '18288'

async function dumpRows(table, column, exactValue) {
  // ilike with % bookends so leading/trailing whitespace shows up too.
  const { data, error } = await supabase.from(table)
    .select('*')
    .ilike(column, `%${exactValue}%`)
  if (error) { console.error(`  ${table}.${column} query error:`, error.message); return [] }
  return data || []
}

;(async () => {
  console.log(`\n=== reconciliation_documents — anything containing "${TARGET}" ===`)
  const recDocs = await dumpRows('reconciliation_documents', 'ticket_number', TARGET)
  console.log(`  ${recDocs.length} row(s)`)
  for (const r of recDocs) {
    console.log({
      id: r.id,
      ticket_number: JSON.stringify(r.ticket_number),
      doc_type: r.doc_type,
      date: r.date,
      foreman: r.foreman,
      file_urls_len: (r.file_urls || []).length,
      bulk_upload_id: r.bulk_upload_id,
      organization_id: r.organization_id,
      reconciled: r.reconciled,
    })
  }

  console.log(`\n=== contractor_lems — anything containing "${TARGET}" in field_log_id ===`)
  // contractor_lems uses field_log_id as the ticket key (per
  // ReconFourPanelView.jsx:94).
  const lemRows = await dumpRows('contractor_lems', 'field_log_id', TARGET)
  console.log(`  ${lemRows.length} row(s)`)
  for (const r of lemRows) {
    console.log({
      id: r.id,
      field_log_id: JSON.stringify(r.field_log_id),
      date: r.date,
      foreman: r.foreman,
      organization_id: r.organization_id,
      labour_entries_len: (r.labour_entries || []).length,
      equipment_entries_len: (r.equipment_entries || []).length,
    })
  }

  console.log(`\n=== recon_package_status (the view the list reads) — row for "${TARGET}" ===`)
  const { data: viewRow, error: vErr } = await supabase.from('recon_package_status')
    .select('*')
    .eq('ticket_number', TARGET)
  if (vErr) console.error('  view query error:', vErr.message)
  console.log(JSON.stringify(viewRow, null, 2))

  console.log(`\n=== recon_package_status — view DEFINITION ===`)
  // pg_views is in the system catalog — use raw SQL via the rpc helper.
  // Supabase client doesn't expose pg_views directly; try the easier
  // information_schema.views route first.
  const { data: viewDef, error: defErr } = await supabase
    .from('pg_catalog.pg_views')
    .select('*')
    .eq('viewname', 'recon_package_status')
  if (defErr) {
    console.log('  (pg_catalog.pg_views not accessible via PostgREST)')
    console.log('  Run this manually in Supabase SQL Editor to see the view body:')
    console.log(`    SELECT definition FROM pg_views WHERE viewname = 'recon_package_status';`)
  } else if (viewDef && viewDef.length > 0) {
    console.log(viewDef[0].definition)
  } else {
    console.log('  No view named recon_package_status found in pg_views.')
  }

  console.log(`\n=== Inspector report blocks referencing "${TARGET}" ===`)
  // daily_reports.activity_blocks is JSONB — pull all reports for the
  // date and grep block.ticketNumber to confirm what the inspector entered.
  const { data: reports } = await supabase.from('daily_reports')
    .select('id, date, inspector_name, activity_blocks')
    .eq('date', '2014-01-21')
  for (const rep of (reports || [])) {
    for (const block of (rep.activity_blocks || [])) {
      const tn = String(block.ticketNumber || '').trim()
      if (tn.includes(TARGET)) {
        console.log({
          report_id: rep.id,
          date: rep.date,
          inspector: rep.inspector_name,
          block_ticketNumber: JSON.stringify(block.ticketNumber),
          activity: block.activityType,
          foreman: block.foreman,
          ticketPhotos: block.ticketPhotos?.length || 0,
        })
      }
    }
  }
})()
