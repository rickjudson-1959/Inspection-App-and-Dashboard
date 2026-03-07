/**
 * Ticket Number Normalization & Matching
 *
 * Handles the many formats contractors and inspectors use for ticket numbers:
 *   "2330-0227-014", "#014", "Ticket 014", "DT-014", "FL-014", "014"
 */

export function normalizeTicketNumber(raw) {
  if (!raw) return null
  let normalized = raw.toString().trim()
    .replace(/^(ticket|tkt|dt|fl|#|no\.?)\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase()
  return normalized || null
}

export function ticketNumbersMatch(lemTicket, inspectorTicket) {
  const a = normalizeTicketNumber(lemTicket)
  const b = normalizeTicketNumber(inspectorTicket)
  if (!a || !b) return false

  // Exact match after normalization
  if (a === b) return true

  // One contains the other (handles "2330-0227-014" vs "014")
  if (a.includes(b) || b.includes(a)) return true

  // Match on last segment (handles different prefix formats)
  const aLast = a.split(/[-_]/).pop()
  const bLast = b.split(/[-_]/).pop()
  if (aLast && bLast && aLast === bLast && aLast.length >= 3) return true

  return false
}
