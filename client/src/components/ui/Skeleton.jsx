/** Skeleton shimmer block used for loading states (Phase 5.2). */
export default function Skeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-panel bg-surface-sunken ${className}`}
    />
  )
}

/** A grid of report/queue card skeletons. */
export function SkeletonCards({ count = 6, className = '' }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-panel border border-line bg-surface-panel">
          <Skeleton className="h-36 w-full rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Table row skeletons. */
export function SkeletonRows({ cols = 6, rows = 5 }) {
  return (
    <tbody className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-3.5">
              <Skeleton className="h-4 w-full max-w-28" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

/** KPI card skeletons for dashboards. */
export function SkeletonKpis({ count = 3, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-panel border border-line bg-surface-panel p-5 shadow-panel">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

/** List-row skeletons with an optional thumbnail (moderation-style pages). */
export function SkeletonList({ count = 4, thumb = true, className = '' }) {
  return (
    <ul className={`divide-y divide-line rounded-panel border border-line bg-surface-panel shadow-panel ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-3.5">
          {thumb && <Skeleton className="h-12 w-12 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Table skeleton: card skeletons on mobile, real table shape from md up —
 * mirrors the md breakpoint where tables switch to stacked cards (§7).
 */
export function SkeletonTable({ cols = 4, rows = 5, className = '' }) {
  return (
    <div className={className}>
      <div className="md:hidden">
        <SkeletonCards count={3} />
      </div>
      <div className="hidden overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel md:block">
        <table className="w-full text-sm">
          <SkeletonRows cols={cols} rows={rows} />
        </table>
      </div>
    </div>
  )
}

/** Two-column detail-page skeleton (tracking / incident detail). */
export function SkeletonDetail({ className = '' }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
        <div className="space-y-5">
          <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      </div>
    </div>
  )
}
