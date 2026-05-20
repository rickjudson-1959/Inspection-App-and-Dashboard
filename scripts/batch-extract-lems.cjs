const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://aatvckalnvojlykfgnmz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdHZja2FsbnZvamx5a2Znbm16Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI4MzczOSwiZXhwIjoyMDc5ODU5NzM5fQ.RvL9s8UpoKIof6D8AA2e81QL7ENVQi6LELhDj3n1Ryw'
);
// Anthropic API key — read from env, never hardcode (GitHub push
// protection blocks committed sk-ant- keys, and a leaked key is a
// real liability). Run with: ANTHROPIC_API_KEY=sk-ant-... node scripts/batch-extract-lems.cjs
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY env var. Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/batch-extract-lems.cjs');
  process.exit(1);
}
// Anthropic model — ANTHROPIC_MODEL env var overrides; default kept
// in sync with frontend src/constants.js ANTHROPIC_MODEL.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ORG = '00000000-0000-0000-0000-000000000001';

function toTitleCase(s) {
  if (!s) return s;
  return s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function extractLEM(pdfUrl) {
  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) return { error: 'PDF fetch ' + pdfResp.status };
  const pdfBuf = await pdfResp.arrayBuffer();
  const pdfB64 = Buffer.from(pdfBuf).toString('base64');

  const prompt = `You are extracting billing data from a contractor's Labour & Equipment Manifest (LEM) for pipeline construction.
Extract ALL line items. Return ONLY valid JSON (no markdown, no code fences):
{"labour":[{"employee_name":"full name","classification":"job title exactly as printed","rt_hours":number,"ot_hours":number,"rt_rate":number,"ot_rate":number,"line_total":number,"count":1}],"equipment":[{"equipment_type":"type exactly as printed","unit_number":"unit ID or empty string","hours":number,"rate":number,"line_total":number,"count":1}],"totals":{"total_labour_hours":number,"total_labour_cost":number,"total_equipment_hours":number,"total_equipment_cost":number,"grand_total":number}}
Rules: Extract every person and equipment listed, even if hours are 0. RT=regular time, OT=overtime. If only total hours shown, put all in rt_hours. Keep classifications EXACTLY as printed.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    if (resp.status === 429) {
      console.log('    Rate limited, waiting 15s...');
      await new Promise(r => setTimeout(r, 15000));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text();
      return { error: 'API ' + resp.status + ': ' + t.substring(0, 150) };
    }
    const result = await resp.json();
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'No JSON in response' };
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.labour) parsed.labour = parsed.labour.map(l => ({ ...l, employee_name: toTitleCase(l.employee_name || '') }));
    return { labour: parsed.labour || [], equipment: parsed.equipment || [], totals: parsed.totals || {} };
  }
  return { error: 'Max retries' };
}

(async () => {
  const tickets = [
    '18201','18205','18206','18207','18210','18211','18212','18213',
    '18214','18215','18216','18217','18218','18219','18220','18222',
    '18226','18229','18234','18238','18240','18241','18246'
  ];

  const results = [];
  for (let idx = 0; idx < tickets.length; idx++) {
    const t = tickets[idx];
    const pdfUrl = `https://aatvckalnvojlykfgnmz.supabase.co/storage/v1/object/public/reconciliation-docs/${ORG}/${t}/contractor_lem/${t}-L.pdf`;
    process.stdout.write(`[${idx+1}/${tickets.length}] Ticket ${t}... `);

    const result = await extractLEM(pdfUrl);
    if (result.error) {
      console.log('ERROR: ' + result.error);
      results.push({ ticket: t, labour: 0, equipment: 0, total: 0, error: result.error });
      continue;
    }

    const labourCount = result.labour.length;
    const equipCount = result.equipment.length;
    const grandTotal = result.totals?.grand_total || 0;
    console.log(labourCount + ' labour, ' + equipCount + ' equip, $' + grandTotal.toLocaleString());

    // Save
    const { data: existing } = await supabase.from('contractor_lems')
      .select('id').eq('field_log_id', t).eq('organization_id', ORG).maybeSingle();
    const record = {
      organization_id: ORG, field_log_id: t, date: '2014-01-20',
      labour_entries: result.labour, equipment_entries: result.equipment,
      total_labour_cost: result.totals?.total_labour_cost || 0,
      total_equipment_cost: result.totals?.total_equipment_cost || 0,
      reconciliation_status: 'pending', billing_status: 'open',
    };
    const { error: saveErr } = existing?.id
      ? await supabase.from('contractor_lems').update(record).eq('id', existing.id)
      : await supabase.from('contractor_lems').insert(record);
    if (saveErr) console.log('  SAVE ERROR: ' + saveErr.message);

    results.push({ ticket: t, labour: labourCount, equipment: equipCount, total: grandTotal, error: null });

    // Delay between requests to avoid rate limits
    if (idx < tickets.length - 1) await new Promise(r => setTimeout(r, 2500));
  }

  // Summary table
  console.log('\n' + '='.repeat(65));
  console.log('  BATCH EXTRACTION SUMMARY');
  console.log('='.repeat(65));
  console.log('Ticket  | Labour | Equip | Grand Total    | Status');
  console.log('-'.repeat(65));
  let totalL = 0, totalE = 0, totalG = 0, ok = 0, fail = 0;
  for (const r of results) {
    if (r.error) {
      console.log(r.ticket + '   |      - |     - |              - | X ' + r.error);
      fail++;
    } else {
      const fmtTotal = '$' + r.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      console.log(r.ticket + '   | ' + String(r.labour).padStart(6) + ' | ' + String(r.equipment).padStart(5) + ' | ' + fmtTotal.padStart(14) + ' | OK');
      totalL += r.labour; totalE += r.equipment; totalG += r.total; ok++;
    }
  }
  console.log('-'.repeat(65));
  const fmtGrand = '$' + totalG.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  console.log('TOTAL   | ' + String(totalL).padStart(6) + ' | ' + String(totalE).padStart(5) + ' | ' + fmtGrand.padStart(14) + ' | ' + ok + ' ok, ' + fail + ' failed');
  console.log('='.repeat(65));
})();
