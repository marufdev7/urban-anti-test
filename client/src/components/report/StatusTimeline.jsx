import { CheckCircle2, Circle } from 'lucide-react'

/**
 * Vertical "Status Timeline" card content (citizen-report-status-tracking.png).
 * items: [{ label, time, done }]
 */
export default function StatusTimeline({ items }) {
  return (
    <ol className="space-y-0">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const isDone = item.done
        const isActive = item.active || (!isDone && (index === 0 || items[index - 1]?.done))

        return (
          <li key={item.label} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[11px] top-6 h-full w-px ${
                  isDone ? 'bg-primary' : 'bg-line'
                }`}
                aria-hidden="true"
              />
            )}

            {isDone ? (
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                <CheckCircle2 className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
              </div>
            ) : isActive ? (
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface-panel shadow-sm">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
            ) : (
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface-panel">
                <Circle className="h-2 w-2 text-transparent" aria-hidden="true" />
              </div>
            )}

            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-medium ${
                  isDone || isActive ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                {item.label}
              </p>
              {item.time && <p className="text-xs text-ink-muted">{item.time}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
