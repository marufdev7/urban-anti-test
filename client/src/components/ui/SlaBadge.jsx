import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getSlaInfo } from '../../lib/sla'

/**
 * Visual SLA status badge indicating deadline countdown or overdue status.
 */
export default function SlaBadge({ issue, showIcon = true, className = '' }) {
  const sla = getSlaInfo(issue)
  if (!sla) return null

  const IconComponent = sla.isResolved
    ? CheckCircle2
    : sla.isOverdue
    ? AlertTriangle
    : Clock

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tracking-tight shadow-3xs ${sla.badgeClass} ${className}`}
      title={`Target Deadline: ${sla.deadlineFormatted} (${sla.allowedDurationLabel})`}
    >
      {showIcon && <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{sla.label}</span>
    </span>
  )
}
