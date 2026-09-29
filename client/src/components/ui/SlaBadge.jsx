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
    : !sla.isSet
    ? Clock
    : sla.isOverdue
    ? AlertTriangle
    : Clock

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tracking-tight shadow-3xs ${sla.badgeClass} ${className}`}
      title={
        sla.isSet
          ? `Target Deadline: ${sla.deadlineFormatted} (${sla.allowedDurationLabel})`
          : 'Resolution deadline has not been set by authority yet'
      }
    >
      {showIcon && <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{sla.label}</span>
    </span>
  )
}
