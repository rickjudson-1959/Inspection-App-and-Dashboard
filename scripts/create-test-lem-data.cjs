/**
 * Create complete test data for CLX2 four-panel view.
 *
 * For the first 5 LEM pairs:
 *   1. Uploads a fake LEM page image + ticket page image to lem-uploads bucket
 *   2. Updates each pair with crew_name + image URLs
 *   3. Creates a matching daily_report with activity_blocks (labour, equipment, ticket photo)
 *   4. Uploads a ticket photo to ticket-photos bucket for Panel 3
 *
 * Usage: node scripts/create-test-lem-data.cjs
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
// Service role key from Supabase CLI
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'
const ORG_ID = '00000000-0000-0000-0000-000000000001'
const LEM_UPLOAD_ID = 'f7be8e4d-2f40-4d7d-bb41-633276f315d7'

// ── Test crew data ──────────────────────────────────────────────────────────

const testCrews = [
  {
    crewName: 'Thompson Welding Crew',
    contractor: 'CLX Construction',
    foreman: 'Mike Thompson',
    activityType: 'Welding',
    ticketNumber: 'CLX-2014-0120-01',
    labour: [
      { name: 'John Rivera', classification: 'Journeyman Welder', rt: 8, ot: 2 },
      { name: 'Dave Chen', classification: 'Journeyman Welder', rt: 8, ot: 1.5 },
      { name: 'Steve Baker', classification: 'Welder Helper', rt: 8, ot: 2 },
      { name: 'Tom Williams', classification: 'Labourer', rt: 8, ot: 0 },
    ],
    equipment: [
      { type: 'Welding Rig', unitNumber: 'WR-101', hours: 10 },
      { type: 'Sideboom', unitNumber: 'SB-45', hours: 6 },
      { type: 'Pickup Truck', unitNumber: 'PU-22', hours: 10 },
    ],
  },
  {
    crewName: 'Parsons Stringing Crew',
    contractor: 'CLX Construction',
    foreman: 'Ray Parsons',
    activityType: 'Stringing',
    ticketNumber: 'CLX-2014-0120-02',
    labour: [
      { name: 'Bill Martinez', classification: 'Pipelayer', rt: 8, ot: 1 },
      { name: 'Kevin Jones', classification: 'Pipelayer', rt: 8, ot: 1 },
      { name: 'Mark Davis', classification: 'Equipment Operator', rt: 8, ot: 0.5 },
    ],
    equipment: [
      { type: 'Sideboom', unitNumber: 'SB-12', hours: 8.5 },
      { type: 'Stringing Truck', unitNumber: 'ST-03', hours: 9 },
    ],
  },
  {
    crewName: 'Henderson Coating Crew',
    contractor: 'CLX Construction',
    foreman: 'Paul Henderson',
    activityType: 'Coating',
    ticketNumber: 'CLX-2014-0127-03',
    labour: [
      { name: 'Frank Wilson', classification: 'Coating Applicator', rt: 8, ot: 2 },
      { name: 'Greg Taylor', classification: 'Coating Helper', rt: 8, ot: 2 },
      { name: 'Chris Brown', classification: 'Labourer', rt: 8, ot: 1 },
      { name: 'Alex Moore', classification: 'Labourer', rt: 8, ot: 0 },
    ],
    equipment: [
      { type: 'Coating Machine', unitNumber: 'CM-07', hours: 10 },
      { type: 'Sandblaster', unitNumber: 'SB-02', hours: 8 },
      { type: 'Pickup Truck', unitNumber: 'PU-15', hours: 10 },
    ],
  },
  {
    crewName: "O'Brien Ditch Crew",
    contractor: 'CLX Construction',
    foreman: "Dan O'Brien",
    activityType: 'Ditch',
    ticketNumber: 'CLX-2014-0203-04',
    labour: [
      { name: 'James Lee', classification: 'Equipment Operator', rt: 10, ot: 0 },
      { name: 'Ryan Clark', classification: 'Equipment Operator', rt: 10, ot: 0 },
      { name: 'Nick Hall', classification: 'Labourer', rt: 10, ot: 0 },
    ],
    equipment: [
      { type: 'Excavator CAT 330', unitNumber: 'EX-18', hours: 10 },
      { type: 'Excavator CAT 320', unitNumber: 'EX-21', hours: 10 },
    ],
  },
  {
    crewName: 'Scott Grading Crew',
    contractor: 'CLX Construction',
    foreman: 'Brian Scott',
    activityType: 'Grading',
    ticketNumber: 'CLX-2014-0120-05',
    labour: [
      { name: 'Sam White', classification: 'Equipment Operator', rt: 8, ot: 3 },
      { name: 'Pete Young', classification: 'Equipment Operator', rt: 8, ot: 2 },
      { name: 'Joe King', classification: 'Labourer', rt: 8, ot: 1 },
      { name: 'Mike Adams', classification: 'Labourer', rt: 8, ot: 0 },
    ],
    equipment: [
      { type: 'D6 Dozer', unitNumber: 'DZ-09', hours: 11 },
      { type: 'Grader 14M', unitNumber: 'GR-04', hours: 10 },
      { type: 'Water Truck', unitNumber: 'WT-11', hours: 8 },
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function supaFetch(endpoint, opts = {}) {
  const key = opts.useAnon ? ANON_KEY : SRK
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function uploadToStorage(bucket, filePath, imageBuffer, contentType = 'image/jpeg') {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method: 'POST',
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: imageBuffer,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Storage upload ${res.status}: ${text}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`
}

/**
 * Generate a labeled test image using Python + Pillow or ImageMagick.
 * Returns a JPEG Buffer.
 */
function generateTestImage(lines, width = 600, height = 800, bgColor = '#FFF8E7') {
  const tmpPath = `/tmp/test-img-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const escapedLines = lines.map(l => l.replace(/'/g, "\\'"))

  // Try Python + Pillow
  const pyScript = `
import sys
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(1)

img = Image.new('RGB', (${width}, ${height}), '${bgColor}')
d = ImageDraw.Draw(img)

# Border
d.rectangle([5, 5, ${width}-6, ${height}-6], outline='#333333', width=2)

# Header bar
d.rectangle([5, 5, ${width}-6, 65], fill='#1a365d')

# Text
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
    fontSm = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 13)
    fontLg = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except:
    font = ImageFont.load_default()
    fontSm = font
    fontLg = font

lines = ${JSON.stringify(escapedLines)}
y = 15
for i, line in enumerate(lines):
    color = 'white' if i == 0 else '#333333'
    f = fontLg if i == 0 else (fontSm if i > 3 else font)
    if i == 1:
        y = 80
    d.text((20, y), line, fill=color, font=f)
    y += (35 if i == 0 else 28 if i <= 3 else 22)

img.save('${tmpPath}', 'JPEG', quality=85)
`
  try {
    execSync(`python3 -c '${pyScript.replace(/'/g, "'\"'\"'")}'`, { stdio: 'pipe' })
  } catch {
    // Fallback: try convert (ImageMagick)
    try {
      const textArgs = escapedLines.map((l, i) => {
        const y = i === 0 ? 40 : 80 + (i - 1) * 25
        return `-fill '${i === 0 ? 'white' : '#333'}' -pointsize ${i === 0 ? 20 : 14} -annotate +20+${y} '${l}'`
      }).join(' ')
      execSync(`convert -size ${width}x${height} -background '${bgColor}' xc:'${bgColor}' -fill '#1a365d' -draw 'rectangle 5,5,${width - 6},65' ${textArgs} ${tmpPath}`, { stdio: 'pipe' })
    } catch {
      // Last resort: tiny JPEG
      const buf = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM' +
        'DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU' +
        'FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUB' +
        'AQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFBABAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEQMRAD8AJQD/2Q==', 'base64')
      fs.writeFileSync(tmpPath, buf)
    }
  }

  if (fs.existsSync(tmpPath)) {
    const buf = fs.readFileSync(tmpPath)
    fs.unlinkSync(tmpPath)
    return buf
  }
  throw new Error('Failed to generate image')
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== CLX2 Four-Panel Test Data Generator ===\n')

  // Step 0: Delete old test reports
  console.log('Cleaning up old test reports...')
  await supaFetch('/rest/v1/daily_reports?inspector_name=eq.Test%20Inspector', { method: 'DELETE' })
  console.log('  Done.\n')

  // Step 1: Get first 5 pairs
  console.log('Loading first 5 pairs...')
  const pairs = await supaFetch(
    `/rest/v1/lem_reconciliation_pairs?lem_upload_id=eq.${LEM_UPLOAD_ID}&order=pair_index&limit=5&select=id,pair_index,work_date,crew_name,lem_page_indices,contractor_ticket_indices`
  )
  if (!pairs || pairs.length === 0) {
    console.error('No pairs found! Make sure the CLX2 LEM has been parsed.')
    process.exit(1)
  }
  console.log(`  Found ${pairs.length} pairs.\n`)

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const crew = testCrews[i]
    const pairDate = pair.work_date || '2014-01-20'

    console.log(`── Pair ${i} (${pairDate}) → ${crew.crewName} ──`)

    // Step 2: Generate and upload LEM page image
    const lemImageBuf = generateTestImage([
      'CONTRACTOR LEM',
      `Contractor: ${crew.contractor}`,
      `Date: ${pairDate}`,
      `Foreman: ${crew.foreman}  |  Activity: ${crew.activityType}`,
      '',
      '── LABOUR ──',
      ...crew.labour.map(l => `  ${l.name.padEnd(22)} ${l.classification.padEnd(22)} RT:${l.rt}  OT:${l.ot}`),
      '',
      '── EQUIPMENT ──',
      ...crew.equipment.map(e => `  ${e.type.padEnd(22)} Unit: ${e.unitNumber.padEnd(10)} Hrs: ${e.hours}`),
      '',
      `Ticket #: ${crew.ticketNumber}`,
    ])
    const lemPath = `${LEM_UPLOAD_ID}/lem_pages/pair${i}_p${(pair.lem_page_indices?.[0] || 0) + 1}.jpg`
    const lemUrl = await uploadToStorage('lem-uploads', lemPath, lemImageBuf)
    console.log(`  LEM image: ${lemPath}`)

    // Step 3: Generate and upload contractor ticket page image
    const ticketImageBuf = generateTestImage([
      'DAILY FIELD TICKET',
      `Ticket #: ${crew.ticketNumber}`,
      `Date: ${pairDate}`,
      `Contractor: ${crew.contractor}  |  Foreman: ${crew.foreman}`,
      '',
      '── LABOUR ──',
      ...crew.labour.map(l => `  ${l.name.padEnd(22)} ${l.classification.padEnd(22)} ${l.rt + l.ot} hrs`),
      '',
      '── EQUIPMENT ──',
      ...crew.equipment.map(e => `  ${e.type.padEnd(22)} ${e.unitNumber.padEnd(10)} ${e.hours} hrs`),
      '',
      'Foreman Signature: _______________     Inspector: _______________',
    ], 600, 800, '#FEF2F2')
    const ticketPath = `${LEM_UPLOAD_ID}/ticket_pages/pair${i}_p${(pair.contractor_ticket_indices?.[0] || 0) + 1}.jpg`
    const ticketUrl = await uploadToStorage('lem-uploads', ticketPath, ticketImageBuf)
    console.log(`  Ticket image: ${ticketPath}`)

    // Step 4: Generate and upload "our ticket photo" (inspector's photo of the paper ticket)
    const ourPhotoImageBuf = generateTestImage([
      'INSPECTOR TICKET PHOTO',
      `Photo taken by: Test Inspector`,
      `Date: ${pairDate}`,
      `Crew: ${crew.crewName}`,
      '',
      `Ticket #: ${crew.ticketNumber}`,
      `Activity: ${crew.activityType}`,
      '',
      `Workers on site: ${crew.labour.length}`,
      `Equipment on site: ${crew.equipment.length}`,
      '',
      '(This simulates a photo of the paper daily ticket)',
      '(taken by the inspector in the field)',
    ], 600, 800, '#F9FAFB')
    const ourPhotoPath = `test-clx2/inspector_photo_pair${i}_${Date.now()}.jpg`
    const ourPhotoUrl = await uploadToStorage('ticket-photos', ourPhotoPath, ourPhotoImageBuf)
    console.log(`  Inspector photo: ${ourPhotoPath}`)

    // Step 5: Update the pair record with crew_name + image URLs
    await supaFetch(`/rest/v1/lem_reconciliation_pairs?id=eq.${pair.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        crew_name: crew.crewName,
        lem_page_urls: [lemUrl],
        contractor_ticket_urls: [ticketUrl],
      }),
    })
    console.log(`  Updated pair: crew_name="${crew.crewName}", 1 LEM URL, 1 ticket URL`)

    // Step 6: Create matching daily_report with activity_blocks
    const activityBlock = {
      id: `test-block-${i + 1}`,
      contractor: crew.crewName,
      foreman: crew.foreman,
      activityType: crew.activityType,
      ticketNumber: crew.ticketNumber,
      workDescription: `${crew.activityType} operations on pipeline ROW`,
      labourEntries: crew.labour.map((l, idx) => ({
        id: `labour-${i}-${idx}`,
        employeeName: l.name,
        name: l.name,
        classification: l.classification,
        trade: l.classification,
        rt: l.rt,
        ot: l.ot,
        hours: l.rt,
      })),
      equipmentEntries: crew.equipment.map((e, idx) => ({
        id: `equip-${i}-${idx}`,
        equipmentType: e.type,
        type: e.type,
        unitNumber: e.unitNumber,
        unit_number: e.unitNumber,
        hours: e.hours,
      })),
      ticketPhoto: ourPhotoPath,
      ticketPhotos: [ourPhotoPath],
    }

    const reportData = {
      date: pairDate,
      inspector_name: 'Test Inspector',
      organization_id: ORG_ID,
      contractor: crew.contractor,
      foreman: crew.foreman,
      spread: 'Spread 1',
      start_time: '07:00',
      stop_time: '17:30',
      weather: 'Clear',
      temp_high: -5,
      temp_low: -15,
      activities: [crew.activityType],
      activity_blocks: [activityBlock],
      safety_notes: 'All personnel wore required PPE. Toolbox talk completed at 07:00.',
      general_comments: `${crew.activityType} operations proceeded as planned. No incidents.`,
    }

    const result = await supaFetch('/rest/v1/daily_reports', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(reportData),
      useAnon: true,
    })
    const reportId = Array.isArray(result) ? result[0].id : result.id
    console.log(`  Created report ID: ${reportId}`)
    console.log('')
  }

  console.log('=== Summary ===')
  console.log(`Updated ${pairs.length} pairs with crew names + image URLs`)
  console.log(`Created ${pairs.length} daily reports with activity blocks + ticket photos`)
  console.log(`Uploaded ${pairs.length * 3} images (LEM + ticket + inspector photo per pair)`)
  console.log('')
  console.log('All four panels should now populate:')
  console.log('  Panel 1 (Contractor LEM): lem_page_urls from lem-uploads bucket')
  console.log('  Panel 2 (Contractor Ticket): contractor_ticket_urls from lem-uploads bucket')
  console.log('  Panel 3 (Our Ticket Photo): ticketPhotos from ticket-photos bucket')
  console.log('  Panel 4 (Inspector Data): activity_blocks with labour + equipment')
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
