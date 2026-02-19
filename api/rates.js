const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server missing SUPABASE_URL or SERVICE_ROLE_KEY configuration' })
  }

  const { table, organization_id } = req.query

  if (!table || !['labour_rates', 'equipment_rates'].includes(table)) {
    return res.status(400).json({ error: 'Invalid or missing table parameter. Use labour_rates or equipment_rates.' })
  }

  if (!organization_id) {
    return res.status(400).json({ error: 'Missing organization_id parameter' })
  }

  const headers = {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'apikey': SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  }

  // GET — read existing rates
  if (req.method === 'GET') {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${table}?organization_id=eq.${organization_id}&order=created_at.desc`
      const response = await fetch(url, { headers })

      if (!response.ok) {
        const errText = await response.text()
        return res.status(response.status).json({ error: errText })
      }

      const data = await response.json()
      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // POST — import rates
  if (req.method === 'POST') {
    try {
      const records = req.body
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'Body must be a non-empty array of rate records' })
      }

      const url = `${SUPABASE_URL}/rest/v1/${table}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(records)
      })

      if (!response.ok) {
        const errText = await response.text()
        return res.status(response.status).json({ error: errText })
      }

      const inserted = await response.json()
      return res.status(201).json(inserted)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // DELETE — clear all rates for this org
  if (req.method === 'DELETE') {
    try {
      const url = `${SUPABASE_URL}/rest/v1/${table}?organization_id=eq.${organization_id}`
      const response = await fetch(url, {
        method: 'DELETE',
        headers
      })

      if (!response.ok) {
        const errText = await response.text()
        return res.status(response.status).json({ error: errText })
      }

      return res.status(200).json({ success: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
