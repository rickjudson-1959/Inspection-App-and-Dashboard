#!/usr/bin/env node
// =============================================================================
// cleanup-orphan-photos.cjs — manual orphan cleanup for photo storage buckets
//
// Why: photoManager uploads photos the moment a user selects them. If the
// user later removes a photo or abandons a draft, the file in Storage is
// no longer referenced by any daily_reports.activity_blocks entry. This
// script scans both buckets and deletes unreferenced files older than the
// configured grace period (default 7 days, to avoid racing with in-flight
// drafts).
//
// Usage:
//   node scripts/cleanup-orphan-photos.cjs                   # dry-run
//   node scripts/cleanup-orphan-photos.cjs --confirm         # actually delete
//   node scripts/cleanup-orphan-photos.cjs --age-days 14     # only files older than N days
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env / .env.local.
// =============================================================================

const fs = require('fs')
const path = require('path')

// Tiny .env loader so we don't have to add dotenv as a dep
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const fp = path.join(__dirname, '..', f)
    if (!fs.existsSync(fp)) continue
    const text = fs.readFileSync(fp, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
}
loadEnv()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const args = process.argv.slice(2)
const CONFIRM = args.includes('--confirm')
const ageDaysIdx = args.indexOf('--age-days')
const AGE_DAYS = ageDaysIdx >= 0 ? Number(args[ageDaysIdx + 1] || 7) : 7
const ageMs = AGE_DAYS * 24 * 60 * 60 * 1000

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json'
}

async function listBucket(bucket) {
  // Storage list endpoint, paginated. Returns up to 1000 objects per call.
  const out = []
  let offset = 0
  const limit = 1000
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ limit, offset, prefix: '', sortBy: { column: 'name', order: 'asc' } })
    })
    if (!res.ok) {
      throw new Error(`list ${bucket} failed: ${res.status} ${await res.text()}`)
    }
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < limit) break
    offset += rows.length
  }
  return out
}

async function deleteFiles(bucket, names) {
  if (!names.length) return
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: names })
  })
  if (!res.ok) {
    throw new Error(`delete ${bucket} failed: ${res.status} ${await res.text()}`)
  }
}

async function fetchReferencedFilenames() {
  // Pull every activity_blocks JSONB and walk it to collect referenced filenames.
  // 1000-row pages until exhausted.
  const referenced = new Set()
  let from = 0
  const pageSize = 1000
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/daily_reports?select=activity_blocks&offset=${from}&limit=${pageSize}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`daily_reports fetch failed: ${res.status} ${await res.text()}`)
    }
    const rows = await res.json()
    for (const row of rows) {
      const blocks = row.activity_blocks || []
      for (const b of blocks) {
        if (!b) continue
        if (b.ticketPhoto && typeof b.ticketPhoto === 'string') referenced.add(b.ticketPhoto)
        for (const f of b.ticketPhotos || []) {
          if (typeof f === 'string') referenced.add(f)
          else if (f?.filename) referenced.add(f.filename)
        }
        for (const wp of b.workPhotos || []) {
          if (typeof wp === 'string') referenced.add(wp)
          else if (wp?.filename) referenced.add(wp.filename)
        }
      }
    }
    if (rows.length < pageSize) break
    from += rows.length
  }
  return referenced
}

async function processBucket(bucket, referenced) {
  console.log(`\n=== bucket: ${bucket} ===`)
  const objects = await listBucket(bucket)
  console.log(`  total objects: ${objects.length}`)

  const cutoff = Date.now() - ageMs
  const orphans = []
  for (const obj of objects) {
    if (!obj.name) continue
    if (referenced.has(obj.name)) continue
    const created = obj.created_at ? new Date(obj.created_at).getTime() : 0
    if (created > cutoff) {
      // Too new — might still belong to an in-flight draft.
      continue
    }
    orphans.push(obj.name)
  }
  console.log(`  orphans (not referenced & older than ${AGE_DAYS}d): ${orphans.length}`)
  if (orphans.length === 0) return

  if (!CONFIRM) {
    console.log('  --confirm not passed; would delete:')
    for (const n of orphans.slice(0, 20)) console.log('    -', n)
    if (orphans.length > 20) console.log(`    ... and ${orphans.length - 20} more`)
    return
  }

  // Delete in batches of 100
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100)
    await deleteFiles(bucket, batch)
    console.log(`  deleted ${i + batch.length} / ${orphans.length}`)
  }
}

async function main() {
  console.log(`[cleanup-orphan-photos] dry-run=${!CONFIRM}, age threshold=${AGE_DAYS}d`)
  const referenced = await fetchReferencedFilenames()
  console.log(`Referenced filenames in daily_reports.activity_blocks: ${referenced.size}`)

  await processBucket('work-photos', referenced)
  await processBucket('ticket-photos', referenced)

  console.log('\nDone.')
  if (!CONFIRM) console.log('(re-run with --confirm to actually delete)')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
