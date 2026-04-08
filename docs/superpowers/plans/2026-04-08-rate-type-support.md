# Rate Type Support (Weekly/Hourly/Daily) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `rate_type` column to labour and equipment rate tables so the system correctly handles weekly-rate salaried workers, hourly Red Book workers, and daily equipment rates — then update the Rate Import prompts, preview UI, import logic, and cost calculation.

**Architecture:** Add `rate_type` TEXT column (values: `'weekly'`, `'hourly'`, `'daily'`) to both `labour_rates` and `equipment_rates` tables. Update Claude Vision extraction prompts to detect and output rate_type. Update RateImport.jsx preview table to show/edit rate_type. Update InspectorReportPanel.jsx cost calculation: weekly workers = rate_st/6 per day + OT hours × rate_ot; hourly workers = RT×rate_st + OT×rate_ot; equipment = daily rate per day (not multiplied by hours).

**Tech Stack:** Supabase (PostgreSQL), React 18, Vercel serverless `/api/rates`, Claude Vision API

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `supabase/migrations/20260408_add_rate_type_column.sql` | Add rate_type column to both tables, backfill existing data | Create |
| `src/RateImport.jsx` | Update extraction prompts, preview table, import logic for rate_type | Modify |
| `src/Components/Reconciliation/InspectorReportPanel.jsx` | Update cost calculation for weekly/hourly/daily rate types | Modify |

---

## Task 1: Add rate_type column to database

**Files:**
- Create: `supabase/migrations/20260408_add_rate_type_column.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add rate_type column to labour_rates and equipment_rates
-- Values: 'weekly' (salaried/office/foremen), 'hourly' (Red Book field workers), 'daily' (equipment)

ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'hourly';
ALTER TABLE equipment_rates ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'daily';

-- Backfill existing labour rates: anything with ST rate >= 100 is weekly (salaried)
UPDATE labour_rates SET rate_type = 'weekly' WHERE rate_st >= 100;
UPDATE labour_rates SET rate_type = 'hourly' WHERE rate_st < 100;

-- All equipment is daily
UPDATE equipment_rates SET rate_type = 'daily';
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Paste the SQL into the Supabase SQL Editor and run it. Verify:

```sql
SELECT rate_type, count(*) FROM labour_rates GROUP BY rate_type;
SELECT rate_type, count(*) FROM equipment_rates GROUP BY rate_type;
```

Expected: labour_rates shows both 'weekly' and 'hourly' counts. equipment_rates shows all 'daily'.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408_add_rate_type_column.sql
git commit -m "feat: add rate_type column to labour_rates and equipment_rates"
```

---

## Task 2: Update RateImport.jsx — extraction prompts, preview, and import

**Files:**
- Modify: `src/RateImport.jsx`

This task updates 5 things in RateImport.jsx:
1. The text extraction prompt for labour rates (lines 117-131)
2. The Vision extraction prompt for labour rates (lines 190-195)
3. The preview table headers and columns (lines 727-784)
4. The addRow function (line 340)
5. The handleImport record builder (lines 371-375)

- [ ] **Step 1: Update the text extraction prompt for labour**

Replace the labour prompt in `extractRatesFromText` (lines 117-131). Find:

```javascript
    const prompt = rateType === 'labour'
      ? `You are extracting labour/personnel rate data from a contractor's rate sheet. The data below is from their file — column names and format will vary by contractor.

Extract every labour classification and its rates. Return ONLY a JSON array.
Each object must have: classification (string), rate_st (number — straight time hourly rate), rate_ot (number — overtime rate), rate_dt (number — double time rate).
If overtime is not shown, calculate as 1.5x straight time. If double time is not shown, calculate as 2x straight time.
If the rates appear to be daily rates (e.g., $700+), divide by 8 to get hourly.
Skip any header rows, subtotal rows, or blank rows. Only include actual worker classifications with rates.

Example: [{"classification": "Foreman", "rate_st": 95.00, "rate_ot": 142.50, "rate_dt": 190.00}]

Return ONLY the JSON array, no explanation.

DATA:
${textContent}`
```

Replace with:

```javascript
    const prompt = rateType === 'labour'
      ? `You are extracting labour/personnel rate data from a contractor's rate sheet for a pipeline construction project. The data below is from their file — column names and format will vary by contractor.

This rate sheet has TWO sections with different rate types:
1. SALARIED/OFFICE STAFF (managers, foremen, supervisors, office clerks, coordinators, engineers, etc.) — these have WEEKLY rates (typically $1,000+). Set rate_type to "weekly".
2. HOURLY FIELD WORKERS (labourers, operators, welders, drivers, helpers, etc.) — these have HOURLY rates (typically $40-$90/hr). Set rate_type to "hourly".

Extract every labour classification and its rates. Return ONLY a JSON array.
Each object must have: classification (string), rate_type (string — "weekly" or "hourly"), rate_st (number — the weekly rate OR straight time hourly rate as-is from the sheet, do NOT convert), rate_ot (number — overtime 1.5x hourly rate), rate_dt (number — overtime 2.0x hourly rate).
If OT is not shown, calculate as 1.5x the hourly rate. If DT is not shown, calculate as 2x the hourly rate.
For weekly-rate workers: rate_st is the weekly rate as-is (do NOT divide). OT and DT are still hourly rates for hours beyond the standard week.
Skip any header rows, subtotal rows, or blank rows. Only include actual worker classifications with rates.

Example: [{"classification": "General Foreman", "rate_type": "weekly", "rate_st": 5871.00, "rate_ot": 273.63, "rate_dt": 364.84}, {"classification": "General Labourer", "rate_type": "hourly", "rate_st": 48.10, "rate_ot": 72.15, "rate_dt": 96.20}]

Return ONLY the JSON array, no explanation.

DATA:
${textContent}`
```

- [ ] **Step 2: Update the Vision extraction prompt for labour**

Find the labour Vision prompt in `extractRatesFromVision` (lines 190-195):

```javascript
    const prompt = rateType === 'labour'
      ? `Extract ALL labour/personnel rates from this rate sheet. Column names and format will vary by contractor.
Return ONLY a JSON array. Each object: classification (string), rate_st (number — straight time hourly), rate_ot (number — overtime, 1.5x if not shown), rate_dt (number — double time, 2x if not shown).
If rates appear to be daily ($700+), divide by 8 for hourly. Skip headers/subtotals/blanks.
Example: [{"classification": "Foreman", "rate_st": 95.00, "rate_ot": 142.50, "rate_dt": 190.00}]
Return ONLY the JSON array.`
```

Replace with:

```javascript
    const prompt = rateType === 'labour'
      ? `Extract ALL labour/personnel rates from this pipeline construction rate sheet.
This sheet has TWO sections: (1) SALARIED staff with WEEKLY rates ($1,000+) — managers, foremen, supervisors, office, coordinators, engineers; (2) HOURLY field workers ($40-$90/hr) — labourers, operators, welders, drivers, helpers.
Return ONLY a JSON array. Each object: classification (string), rate_type (string — "weekly" or "hourly"), rate_st (number — weekly rate OR hourly ST rate as-is, do NOT convert), rate_ot (number — OT 1.5x hourly rate), rate_dt (number — DT 2.0x hourly rate).
For weekly workers: rate_st is the full weekly amount. OT/DT are still hourly for hours beyond standard.
Skip headers/subtotals/blanks.
Example: [{"classification": "General Foreman", "rate_type": "weekly", "rate_st": 5871.00, "rate_ot": 273.63, "rate_dt": 364.84}]
Return ONLY the JSON array.`
```

- [ ] **Step 3: Update the updateRow function to handle rate_type**

Find (line 324):

```javascript
    if (['rate_st', 'rate_ot', 'rate_dt', 'rate_hourly', 'rate_daily'].includes(field)) {
```

Replace with:

```javascript
    if (['rate_st', 'rate_ot', 'rate_dt', 'rate_hourly', 'rate_daily'].includes(field)) {
```

No change needed here — rate_type is a string field and will fall through to the else branch. But we DO need to update `addRow` (line 340):

Find:

```javascript
      setPreviewData([...previewData, { classification: '', rate_st: 0, rate_ot: 0, rate_dt: 0, valid: true }])
```

Replace with:

```javascript
      setPreviewData([...previewData, { classification: '', rate_type: 'hourly', rate_st: 0, rate_ot: 0, rate_dt: 0, valid: true }])
```

- [ ] **Step 4: Update the labour preview table to show rate_type column**

Find the labour preview table headers (lines 728-734):

```javascript
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Classification</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>ST Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>OT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>DT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}></th>
                        </>
```

Replace with:

```javascript
                        <>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'left' }}>Classification</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '90px' }}>Type</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>ST/Weekly Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>OT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'right' }}>DT Rate</th>
                          <th style={{ color: 'white', padding: '12px', textAlign: 'center', width: '60px' }}></th>
                        </>
```

- [ ] **Step 5: Update the labour preview table body to show rate_type dropdown**

Find the labour preview body cells (lines 750-785). After the classification `<td>` (line 756) and before the rate_st `<td>` (line 758), add a rate_type dropdown cell.

Find:

```javascript
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.classification || ''}
                                onChange={(e) => updateRow(idx, 'classification', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_st || ''}
                                onChange={(e) => updateRow(idx, 'rate_st', e.target.value)}
```

Replace with:

```javascript
                            <td style={{ padding: '8px' }}>
                              <input
                                type="text"
                                value={row.classification || ''}
                                onChange={(e) => updateRow(idx, 'classification', e.target.value)}
                                style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }}
                              />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <select
                                value={row.rate_type || 'hourly'}
                                onChange={(e) => updateRow(idx, 'rate_type', e.target.value)}
                                style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                              >
                                <option value="hourly">Hourly</option>
                                <option value="weekly">Weekly</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={row.rate_st || ''}
                                onChange={(e) => updateRow(idx, 'rate_st', e.target.value)}
```

- [ ] **Step 6: Update the import record builder to include rate_type**

Find (lines 372-375):

```javascript
          record.classification = row.classification
          record.rate_st = row.rate_st || 0
          record.rate_ot = row.rate_ot || 0
          record.rate_dt = row.rate_dt || 0
```

Replace with:

```javascript
          record.classification = row.classification
          record.rate_type = row.rate_type || 'hourly'
          record.rate_st = row.rate_st || 0
          record.rate_ot = row.rate_ot || 0
          record.rate_dt = row.rate_dt || 0
```

Also find the equipment record builder (lines 377-379):

```javascript
          record.equipment_type = row.equipment_type
          record.rate_hourly = row.rate_hourly || 0
          record.rate_daily = row.rate_daily || 0
```

Replace with:

```javascript
          record.equipment_type = row.equipment_type
          record.rate_type = 'daily'
          record.rate_hourly = row.rate_hourly || 0
          record.rate_daily = row.rate_daily || 0
```

- [ ] **Step 7: Update the existing rates display to show rate_type**

Find the existing rates table header for labour (lines 520-523):

```javascript
                      <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>ST Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>OT Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>DT Rate</th>
```

Replace with:

```javascript
                      <th style={{ padding: '8px', textAlign: 'left' }}>Classification</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Type</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>ST/Weekly Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>OT Rate</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>DT Rate</th>
```

Find the existing rates table body for labour (lines 541-544):

```javascript
                        <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_st?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_ot?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_dt?.toFixed(2)}</td>
```

Replace with:

```javascript
                        <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: r.rate_type === 'weekly' ? '#dbeafe' : '#dcfce7', color: r.rate_type === 'weekly' ? '#1e40af' : '#166534', fontWeight: '600' }}>
                            {r.rate_type === 'weekly' ? 'Weekly' : 'Hourly'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_st?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_ot?.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>${r.rate_dt?.toFixed(2)}</td>
```

- [ ] **Step 8: Commit**

```bash
git add src/RateImport.jsx
git commit -m "feat: rate import supports weekly/hourly rate types with Claude detection"
```

---

## Task 3: Update InspectorReportPanel cost calculation

**Files:**
- Modify: `src/Components/Reconciliation/InspectorReportPanel.jsx`

- [ ] **Step 1: Update calcLabourCost to handle weekly vs hourly**

Find (lines 87-96):

```javascript
  function calcLabourCost(entry) {
    const rate = findLabourRate(entry.classification)
    if (!rate) return { rate: null, cost: 0 }
    const rt = parseFloat(entry.rt || entry.hours || 0)
    const ot = parseFloat(entry.ot || 0)
    const qty = parseInt(entry.count || 1)
    const stRate = parseFloat(rate.rate_st || rate.rate || 0)
    const otRate = parseFloat(rate.rate_ot || stRate * 1.5)
    const cost = ((rt * stRate) + (ot * otRate)) * qty
    return { rate: stRate, cost }
  }
```

Replace with:

```javascript
  function calcLabourCost(entry) {
    const rate = findLabourRate(entry.classification)
    if (!rate) return { rate: null, rateType: null, cost: 0 }
    const rt = parseFloat(entry.rt || entry.hours || 0)
    const ot = parseFloat(entry.ot || 0)
    const qty = parseInt(entry.count || 1)
    const rateType = rate.rate_type || (parseFloat(rate.rate_st || 0) >= 100 ? 'weekly' : 'hourly')

    if (rateType === 'weekly') {
      // Weekly rate: daily cost = weekly / 6, plus OT hours at OT rate
      const weeklyRate = parseFloat(rate.rate_st || 0)
      const dailyRate = weeklyRate / 6
      const otRate = parseFloat(rate.rate_ot || 0)
      const dtRate = parseFloat(rate.rate_dt || 0)
      // Standard day = 1 day rate. OT hours beyond 8 at OT rate.
      const otHours = Math.max(0, rt - 8) + ot  // hours beyond 8 RT + any explicit OT
      const cost = (dailyRate + (otHours * otRate)) * qty
      return { rate: dailyRate, rateType: 'weekly', weeklyRate, cost }
    } else {
      // Hourly rate: RT hours × ST rate + OT hours × OT rate
      const stRate = parseFloat(rate.rate_st || 0)
      const otRate = parseFloat(rate.rate_ot || stRate * 1.5)
      const cost = ((rt * stRate) + (ot * otRate)) * qty
      return { rate: stRate, rateType: 'hourly', cost }
    }
  }
```

- [ ] **Step 2: Update calcEquipmentCost for daily rates**

Find (lines 99-106):

```javascript
  function calcEquipmentCost(entry) {
    const rate = findEquipmentRate(entry.type || entry.equipment_type)
    if (!rate) return { rate: null, cost: 0 }
    const hrs = parseFloat(entry.hours || 0)
    const qty = parseInt(entry.count || 1)
    const hrRate = parseFloat(rate.rate_hourly || rate.hourly_rate || rate.rate || 0)
    const cost = hrs * hrRate * qty
    return { rate: hrRate, cost }
  }
```

Replace with:

```javascript
  function calcEquipmentCost(entry) {
    const rate = findEquipmentRate(entry.type || entry.equipment_type)
    if (!rate) return { rate: null, cost: 0 }
    const qty = parseInt(entry.count || 1)
    // Equipment is a daily all-in rate — cost = daily rate per day, not multiplied by hours
    const dailyRate = parseFloat(rate.rate_daily || rate.rate_hourly || 0)
    const cost = dailyRate * qty
    return { rate: dailyRate, rateType: 'daily', cost }
  }
```

- [ ] **Step 3: Update the Rate column display to show rate context**

Find the labour Rate `<td>` in the manpower table (around line 370):

```javascript
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? fmt(rate) : 'No rate found'}
                    </td>
```

Replace with:

```javascript
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? `${fmt(rate)}${labourCosts[i].rateType === 'weekly' ? '/day' : '/hr'}` : 'No rate found'}
                    </td>
```

Find the equipment Rate `<td>` in the equipment table (similar pattern):

```javascript
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? fmt(rate) : 'No rate found'}
                    </td>
```

Replace with (for the equipment section — the second occurrence):

```javascript
                    <td style={{ ...cellStyle, textAlign: 'right', fontSize: 11, color: rate != null ? '#166534' : '#9ca3af', fontStyle: rate != null ? 'normal' : 'italic' }}>
                      {rate != null ? `${fmt(rate)}/day` : 'No rate found'}
                    </td>
```

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/Components/Reconciliation/InspectorReportPanel.jsx
git commit -m "feat: cost calculation handles weekly labour rates and daily equipment rates"
```

---

## Task 4: Push and verify

- [ ] **Step 1: Push to origin**

```bash
git push origin main
```

- [ ] **Step 2: Run migration in Supabase**

Run the SQL from Task 1 in the Supabase SQL Editor.

- [ ] **Step 3: Verify**

1. Open Admin Portal > Rate Import
2. Verify existing rates show the Type column (Weekly/Hourly badges)
3. Upload the rate sheet — verify Claude detects weekly vs hourly correctly
4. Open a reconciliation ticket — verify costs calculate correctly:
   - Weekly-rate workers: daily rate (weekly÷6) + OT shown
   - Hourly workers: RT×rate + OT×rate
   - Equipment: daily rate per unit, not multiplied by hours
