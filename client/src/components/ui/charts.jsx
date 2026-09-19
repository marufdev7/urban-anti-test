/** Lightweight presentational charts — no chart library dependency. */

// Severity band → color, reused by bars + donut + badges.
export const SEVERITY_COLORS = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#d97706',
  low: '#16a34a',
}

/** Horizontal bar rows, e.g. reports-by-category. */
export function BarList({ items, max }) {
  const cap = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-ink" title={item.label}>
            {item.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (item.value / cap) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-semibold text-ink">
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Donut chart with a legend, e.g. severity distribution. */
export function DonutChart({ items }) {
  const total = items.reduce((acc, i) => acc + i.value, 0)
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No data for this period.</p>
  }
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 110 110" className="h-32 w-32 shrink-0" role="img" aria-label="Severity distribution donut">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#eef2f7" strokeWidth="16" />
        {items.map((item) => {
          const length = (item.value / total) * circumference
          const el = (
            <circle
              key={item.label}
              cx="55"
              cy="55"
              r={radius}
              fill="none"
              stroke={SEVERITY_COLORS[item.key] ?? '#0e7c6d'}
              strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 55 55)"
            />
          )
          offset += length
          return el
        })}
        <text x="55" y="53" textAnchor="middle" className="fill-ink text-xl font-bold" fontSize="18">
          {total}
        </text>
        <text x="55" y="68" textAnchor="middle" className="fill-ink-muted text-xs" fontSize="8">
          issues
        </text>
      </svg>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SEVERITY_COLORS[item.key] ?? '#0e7c6d' }}
              aria-hidden="true"
            />
            <span className="text-ink">{item.label}</span>
            <span className="ml-auto pl-4 font-semibold text-ink">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
