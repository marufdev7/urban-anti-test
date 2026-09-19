// Display formatting helpers shared by all three workspaces.

export function timeAgo(iso) {
  if (!iso) return '—'
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return `${new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}, ${new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** UUID → friendly 4-char hex snippet (e.g. "8421" or "8F2A"). */
export function shortId(id) {
  if (!id) return '—'
  const clean = String(id).replace(/^(UM-|#UM-|REP-|#REP-)/i, '').replace(/-/g, '')
  return clean.slice(0, 4).toUpperCase()
}

export function truncate(text, length = 80) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= length ? clean : `${clean.slice(0, length).trimEnd()}…`
}

/** ageSeconds → "12m", "1h 45m", "3d" — the queue's Time Elapsed column. */
export function formatAge(seconds) {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

/** Median resolution seconds → "3.4h" for KPI cards. */
export function formatHours(seconds) {
  if (seconds == null) return '—'
  return `${(seconds / 3600).toFixed(1)}h`
}
