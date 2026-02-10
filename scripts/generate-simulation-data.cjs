// generate-simulation-data.cjs - FortisBC EGP Project Simulation
// 41 days: Jan 1 - Feb 10, 2026
// Target: 33% completion, SPI 0.73, Welding bottleneck

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Check .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// ============================================================================
// PROJECT CONFIGURATION
// ============================================================================

const PROJECT_CONFIG = {
  name: 'FortisBC EGP Project',
  totalLengthKm: 47.0,              // 47.0 km
  totalLengthMetres: 47000,         // 47,000 metres
  startDate: '2026-01-01',
  endDate: '2026-02-10',            // 41 days
  targetOverallCompletion: 0.33,    // 33%
  targetPV: 0.45,                   // Planned 45% by Feb 10
  targetSPI: 0.73,                  // SPI = 33/45 = 0.733
  spreads: ['Spread 1', 'Spread 2', 'Spread 3', 'Spread 4'],
  inspectors: [
    { name: 'Mike Thompson', spread: 'Spread 1' },
    { name: 'Sarah Chen', spread: 'Spread 2' },
    { name: 'David Wilson', spread: 'Spread 3' },
    { name: 'Jennifer Adams', spread: 'Spread 4' }
  ]
}

// ============================================================================
// 15-ACTIVITY CONSTRUCTION SEQUENCE (NO Hydrostatic Test)
// ============================================================================

const CONSTRUCTION_SEQUENCE = [
  'Access',
  'Clearing',
  'Stripping',
  'Grading',
  'Stringing',
  'Bending',
  'Welding',
  'Tie-ins',
  'Tie-in Completion',
  'Coating',
  'Ditch',
  'Lower-in',
  'Backfill',
  'Cleanup - Machine',
  'Cleanup - Final'
]

// Target completion percentages (calibrated for ~33% overall with 15 activities)
// Sum of all percentages / 15 should ≈ 33%
// Total: 100+100+85+85+35+28+25+15+10+8+6+4+3+2+1 = 507 / 15 = 33.8%
const TARGET_COMPLETION = {
  'Access': 1.00,              // 100%
  'Clearing': 1.00,            // 100%
  'Stripping': 0.85,           // 85%
  'Grading': 0.85,             // 85%
  'Stringing': 0.35,           // 35%
  'Bending': 0.28,             // 28%
  'Welding': 0.25,             // 25% - BOTTLENECK (~11.75 km)
  'Tie-ins': 0.15,             // 15%
  'Tie-in Completion': 0.10,   // 10%
  'Coating': 0.08,             // 8%
  'Ditch': 0.06,               // 6%
  'Lower-in': 0.04,            // 4%
  'Backfill': 0.03,            // 3%
  'Cleanup - Machine': 0.02,   // 2% (~0.94 km)
  'Cleanup - Final': 0.01      // 1%
}

// Cost per metre
const COST_PER_METRE = {
  'Access': 35,
  'Clearing': 45,
  'Stripping': 40,
  'Grading': 85,
  'Stringing': 35,
  'Bending': 65,
  'Welding': 320,
  'Tie-ins': 350,
  'Tie-in Completion': 380,
  'Coating': 95,
  'Ditch': 75,
  'Lower-in': 145,
  'Backfill': 55,
  'Cleanup - Machine': 30,
  'Cleanup - Final': 25
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function formatKP(metres) {
  const km = Math.floor(metres / 1000)
  const m = Math.round(metres % 1000)
  return `${km}+${m.toString().padStart(3, '0')}`
}

// ============================================================================
// GENERATE GRADUAL DAILY PROGRESS - Smooth distribution across all days
// ============================================================================

function calculateDailyProgress(targetMetres, numDays) {
  const dailyProgress = []
  let remaining = targetMetres

  // Use a more even distribution to avoid spikes
  for (let day = 0; day < numDays; day++) {
    if (remaining <= 0) {
      dailyProgress.push(0)
      continue
    }

    // Calculate base daily rate with smoother variance
    const daysLeft = numDays - day
    const baseDaily = remaining / daysLeft

    // Smaller variance range for smoother progression
    const variance = randomFloat(0.85, 1.15)
    let todayProgress = baseDaily * variance

    // Weekend reduction (Sat=6, Sun=0)
    const date = new Date('2026-01-01')
    date.setDate(date.getDate() + day)
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      todayProgress *= 0.4
    }

    // Occasional weather delay (10% of days)
    if (Math.random() < 0.10) {
      todayProgress *= 0.3
    }

    todayProgress = Math.min(todayProgress, remaining)
    dailyProgress.push(Math.round(todayProgress))
    remaining -= todayProgress
  }

  return dailyProgress
}

// ============================================================================
// GENERATE ACTIVITY BLOCKS
// ============================================================================

function generateLabourEntries(activityType, isDelayDay) {
  const entries = []

  const classifications = activityType.includes('Weld') || activityType.includes('Tie')
    ? ['Welder', 'Pipeliner', 'Equipment Operator', 'Foreman']
    : ['Pipeliner', 'Equipment Operator', 'Labourer', 'Foreman']

  for (const classification of classifications) {
    const count = classification === 'Foreman' ? 1 : randomBetween(2, 4)
    let rt = isDelayDay ? randomBetween(4, 6) : randomBetween(8, 10)
    let ot = !isDelayDay && Math.random() < 0.3 ? randomBetween(1, 2) : 0

    entries.push({
      classification,
      count,
      rt,
      ot,
      rate: classification === 'Welder' ? 110 : classification === 'Foreman' ? 125 : 85,
      productionStatus: isDelayDay ? 'SYNC_DELAY' : 'ACTIVE'
    })
  }

  return entries
}

function generateEquipmentEntries(activityType, isDelayDay) {
  const equipmentMap = {
    'Access': ['Excavator', 'Dozer'],
    'Clearing': ['Excavator', 'Dozer', 'Mulcher'],
    'Stripping': ['Excavator', 'Dozer'],
    'Grading': ['Grader', 'Dozer', 'Excavator'],
    'Stringing': ['Sideboom', 'Lowbed'],
    'Bending': ['Pipe Bender', 'Sideboom'],
    'Welding': ['Welding Rig', 'Welding Rig', 'Sideboom'],
    'Tie-ins': ['Welding Rig', 'Sideboom', 'Excavator'],
    'Tie-in Completion': ['Welding Rig', 'Sideboom'],
    'Coating': ['Coating Shack', 'Sideboom'],
    'Ditch': ['Excavator', 'Excavator'],
    'Lower-in': ['Sideboom', 'Sideboom', 'Excavator'],
    'Backfill': ['Excavator', 'Dozer'],
    'Cleanup - Machine': ['Excavator', 'Dozer'],
    'Cleanup - Final': ['Excavator']
  }

  const equipment = equipmentMap[activityType] || ['Excavator']
  const entries = []

  for (const type of equipment) {
    entries.push({
      type,
      count: 1,
      hours: isDelayDay ? randomBetween(4, 6) : randomBetween(8, 10),
      rate: type === 'Sideboom' ? 250 : type === 'Pipe Bender' ? 300 : 180,
      productionStatus: isDelayDay ? 'SYNC_DELAY' : 'ACTIVE'
    })
  }

  return entries
}

function generateShadowAudit(labourEntries, equipmentEntries, isDelayDay) {
  let totalBilledHours = 0
  let labourCost = 0
  let equipmentCost = 0

  for (const entry of labourEntries) {
    const hours = ((entry.rt || 0) + (entry.ot || 0)) * (entry.count || 1)
    totalBilledHours += hours
    labourCost += hours * entry.rate
  }

  for (const entry of equipmentEntries) {
    const hours = entry.hours * (entry.count || 1)
    totalBilledHours += hours
    equipmentCost += hours * entry.rate
  }

  const productivityFactor = isDelayDay ? randomFloat(0.4, 0.6) : randomFloat(0.80, 0.95)
  const totalShadowHours = totalBilledHours * productivityFactor
  const hoursLost = totalBilledHours - totalShadowHours
  const blendedRate = (labourCost + equipmentCost) / Math.max(totalBilledHours, 1)

  return {
    totalBilledHours: Math.round(totalBilledHours * 10) / 10,
    totalShadowHours: Math.round(totalShadowHours * 10) / 10,
    inertiaRatio: Math.round(productivityFactor * 1000) / 10,
    totalValueLost: Math.round(hoursLost * blendedRate),
    hoursLost: Math.round(hoursLost * 10) / 10,
    delayType: isDelayDay ? 'SYSTEMIC' : 'NONE',
    blockBurnRate: Math.round(blendedRate)
  }
}

// ============================================================================
// MAIN SIMULATION
// ============================================================================

async function main() {
  console.log('🚀 FortisBC EGP Project - COMPLETE DATA RESET')
  console.log('='.repeat(60))
  console.log('Configuration:')
  console.log(`   Total Length: ${PROJECT_CONFIG.totalLengthKm} km`)
  console.log(`   Date Range: ${PROJECT_CONFIG.startDate} to ${PROJECT_CONFIG.endDate}`)
  console.log(`   Target Completion: ${PROJECT_CONFIG.targetOverallCompletion * 100}%`)
  console.log(`   Target SPI: ${PROJECT_CONFIG.targetSPI}`)
  console.log(`   Activities: ${CONSTRUCTION_SEQUENCE.length} (no Hydrostatic Test)`)
  console.log('='.repeat(60))

  // Get organization ID
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(1)

  if (orgError || !orgs?.length) {
    console.error('❌ Failed to get organization:', orgError)
    process.exit(1)
  }

  const organizationId = orgs[0].id
  console.log(`\n📍 Organization: ${orgs[0].name}`)

  // =========================================================================
  // STEP 1: CLEAR ALL EXISTING DATA
  // =========================================================================
  console.log('\n🗑️  CLEARING ALL EXISTING DATA...')

  const { error: delReports } = await supabase
    .from('daily_reports')
    .delete()
    .eq('organization_id', organizationId)

  if (delReports) console.error('   Error deleting reports:', delReports.message)
  else console.log('   ✅ Cleared daily_reports')

  const { error: delBaselines } = await supabase
    .from('project_baselines')
    .delete()
    .eq('organization_id', organizationId)

  if (delBaselines) console.error('   Error deleting baselines:', delBaselines.message)
  else console.log('   ✅ Cleared project_baselines')

  // =========================================================================
  // STEP 2: CREATE PROJECT BASELINES
  // =========================================================================
  console.log('\n📊 Creating project baselines...')

  const baselines = []
  const spreadLengthMetres = PROJECT_CONFIG.totalLengthMetres / 4

  for (let spreadIdx = 0; spreadIdx < 4; spreadIdx++) {
    const spread = PROJECT_CONFIG.spreads[spreadIdx]
    const baseKP = spreadIdx * spreadLengthMetres

    for (const activity of CONSTRUCTION_SEQUENCE) {
      baselines.push({
        organization_id: organizationId,
        spread,
        activity_type: activity,
        planned_metres: spreadLengthMetres,
        start_kp: formatKP(baseKP),
        end_kp: formatKP(baseKP + spreadLengthMetres),
        budgeted_unit_cost: COST_PER_METRE[activity] || 50,
        planned_start_date: '2025-10-01',
        planned_end_date: '2026-06-30',
        labour_rate_per_hour: 85,
        equipment_rate_per_hour: 150,
        is_active: true,
        notes: `${activity} - ${spread}`
      })
    }
  }

  const { error: baselineError } = await supabase.from('project_baselines').insert(baselines)
  if (baselineError) console.error('   Baseline error:', baselineError.message)
  else console.log(`   ✅ Created ${baselines.length} baseline records`)

  // =========================================================================
  // STEP 3: GENERATE DAILY REPORTS (Jan 1 - Feb 10 = 41 days)
  // =========================================================================
  console.log('\n📝 Generating 41 days of daily reports...')

  const startDate = new Date(PROJECT_CONFIG.startDate)
  const endDate = new Date(PROJECT_CONFIG.endDate)
  const numDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

  console.log(`   Days: ${numDays}`)

  const reports = []
  const spreadLengthM = PROJECT_CONFIG.totalLengthMetres / 4

  // Pre-calculate daily progress for each activity per spread
  const activityProgress = {}

  for (const spread of PROJECT_CONFIG.spreads) {
    activityProgress[spread] = {}

    for (const activity of CONSTRUCTION_SEQUENCE) {
      const targetCompletion = TARGET_COMPLETION[activity]
      const targetMetres = spreadLengthM * targetCompletion

      activityProgress[spread][activity] = {
        dailyProgress: calculateDailyProgress(targetMetres, numDays),
        currentKP: PROJECT_CONFIG.spreads.indexOf(spread) * spreadLengthM
      }
    }
  }

  // Generate reports day by day
  for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
    const currentDate = new Date(startDate)
    currentDate.setDate(currentDate.getDate() + dayIdx)
    const dateStr = currentDate.toISOString().split('T')[0]

    // Generate 1 report per spread per day
    for (const spread of PROJECT_CONFIG.spreads) {
      const spreadIdx = PROJECT_CONFIG.spreads.indexOf(spread)
      const inspector = PROJECT_CONFIG.inspectors[spreadIdx]

      const activityBlocks = []

      // Add activity blocks for activities with progress today
      for (const activity of CONSTRUCTION_SEQUENCE) {
        const progressData = activityProgress[spread][activity]
        const todayProgress = progressData.dailyProgress[dayIdx]

        if (todayProgress <= 0) continue

        const startKP = progressData.currentKP
        const endKP = startKP + todayProgress
        progressData.currentKP = endKP

        const isDelayDay = Math.random() < 0.12
        const labourEntries = generateLabourEntries(activity, isDelayDay)
        const equipmentEntries = generateEquipmentEntries(activity, isDelayDay)
        const shadowAudit = generateShadowAudit(labourEntries, equipmentEntries, isDelayDay)

        activityBlocks.push({
          id: `block-${dateStr}-${spread}-${activity}`.replace(/\s+/g, '-'),
          activityType: activity,
          startKP: formatKP(Math.round(startKP)),
          endKP: formatKP(Math.round(endKP)),
          metresCompleted: todayProgress,
          labourEntries,
          equipmentEntries,
          shadowAuditSummary: shadowAudit,
          qualityData: {
            inspectionCompleted: true,
            passRate: randomBetween(88, 99),
            defectsFound: Math.random() < 0.1 ? randomBetween(1, 3) : 0
          },
          comments: isDelayDay
            ? `Reduced production - ${pickRandom(['weather hold', 'equipment maintenance', 'material delay'])}`
            : `Normal production for ${activity}`
        })
      }

      if (activityBlocks.length === 0) continue

      // Weather
      const weatherOptions = ['Clear', 'Partly Cloudy', 'Overcast', 'Light Snow', 'Snow']
      const weather = pickRandom(weatherOptions)
      const tempHigh = randomBetween(-12, 5)
      const tempLow = tempHigh - randomBetween(5, 10)

      reports.push({
        date: dateStr,
        organization_id: organizationId,
        spread,
        inspector_name: inspector.name,
        weather,
        temp_high: tempHigh,
        temp_low: tempLow,
        wind_speed: randomBetween(5, 35),
        precipitation: weather.includes('Snow') ? randomFloat(1, 10) : 0,
        row_condition: tempLow < -5 ? 'Frozen' : 'Good',
        activity_blocks: activityBlocks,
        safety_notes: Math.random() < 0.1 ? 'Safety meeting conducted.' : null,
        general_comments: `Daily report for ${spread}. ${activityBlocks.length} activities.`,
        created_at: new Date(dateStr + 'T17:00:00').toISOString()
      })
    }
  }

  // Insert reports in batches
  console.log(`   Inserting ${reports.length} reports...`)
  for (let i = 0; i < reports.length; i += 50) {
    const batch = reports.slice(i, i + 50)
    const { error } = await supabase.from('daily_reports').insert(batch)
    if (error) console.error(`   Batch ${i} error:`, error.message)
    process.stdout.write(`\r   Progress: ${Math.min(i + 50, reports.length)}/${reports.length}`)
  }
  console.log(`\n   ✅ Inserted ${reports.length} daily reports`)

  // =========================================================================
  // STEP 4: VERIFY AND DISPLAY METRICS
  // =========================================================================
  console.log('\n📈 SIMULATION VERIFICATION:')
  console.log('-'.repeat(60))

  // Calculate actual completion by activity
  const totalsByActivity = {}
  let grandTotal = 0

  for (const spread of PROJECT_CONFIG.spreads) {
    for (const activity of CONSTRUCTION_SEQUENCE) {
      const progressData = activityProgress[spread][activity]
      const completed = progressData.currentKP - (PROJECT_CONFIG.spreads.indexOf(spread) * spreadLengthM)

      if (!totalsByActivity[activity]) totalsByActivity[activity] = 0
      totalsByActivity[activity] += completed
      grandTotal += completed
    }
  }

  console.log('\n   ACTIVITY COMPLETION (15 Activities):')
  console.log('   ' + '-'.repeat(55))
  console.log('   ' + 'Activity'.padEnd(22) + 'Progress'.padEnd(25) + '%'.padStart(7) + '   km')
  console.log('   ' + '-'.repeat(55))

  for (const activity of CONSTRUCTION_SEQUENCE) {
    const completedMetres = totalsByActivity[activity]
    const completedKm = completedMetres / 1000
    const percent = (completedMetres / PROJECT_CONFIG.totalLengthMetres) * 100
    const bar = '█'.repeat(Math.round(percent / 5)) + '░'.repeat(20 - Math.round(percent / 5))
    console.log(`   ${activity.padEnd(22)} ${bar} ${percent.toFixed(1).padStart(6)}%  ${completedKm.toFixed(2).padStart(6)}`)
  }

  // Overall metrics
  const totalPossible = PROJECT_CONFIG.totalLengthMetres * CONSTRUCTION_SEQUENCE.length
  const overallPercent = (grandTotal / totalPossible) * 100
  const plannedPercent = PROJECT_CONFIG.targetPV * 100
  const spi = overallPercent / plannedPercent

  console.log('\n   ' + '-'.repeat(55))
  console.log(`   Overall Completion: ${overallPercent.toFixed(1)}% (Target: ${PROJECT_CONFIG.targetOverallCompletion * 100}%)`)
  console.log(`   Planned Value (PV): ${plannedPercent.toFixed(1)}%`)
  console.log(`   Earned Value (EV):  ${overallPercent.toFixed(1)}%`)
  console.log(`   SPI: ${spi.toFixed(2)} (Target: ${PROJECT_CONFIG.targetSPI})`)

  console.log('\n   KEY METRICS:')
  const accessClearingPct = ((totalsByActivity['Access'] + totalsByActivity['Clearing']) / (PROJECT_CONFIG.totalLengthMetres * 2) * 100)
  const weldingKm = totalsByActivity['Welding'] / 1000
  const weldingPct = (totalsByActivity['Welding'] / PROJECT_CONFIG.totalLengthMetres) * 100
  const cleanupKm = totalsByActivity['Cleanup - Machine'] / 1000
  const cleanupPct = (totalsByActivity['Cleanup - Machine'] / PROJECT_CONFIG.totalLengthMetres) * 100

  console.log(`   ✓ Access/Clearing: ${accessClearingPct.toFixed(0)}% complete`)
  console.log(`   ✓ Welding: ${weldingPct.toFixed(0)}% complete (${weldingKm.toFixed(2)} km)`)
  console.log(`   ✓ Machine Cleanup: ${cleanupPct.toFixed(0)}% complete (${cleanupKm.toFixed(2)} km)`)
  console.log(`   ✓ No Hydrostatic Test (excluded)`)

  console.log('\n✅ SIMULATION COMPLETE!')
  console.log('   Refresh dashboard to see corrected data.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
