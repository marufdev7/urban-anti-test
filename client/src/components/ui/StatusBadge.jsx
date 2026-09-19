import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Flag,
} from 'lucide-react'

// Severities (API severity enum) and workflow statuses share one map of
// colors. Text is always present so status never relies on color alone (§9).
const TONES = {
  critical: 'bg-status-critical-soft text-status-critical border-status-critical/30',
  high: 'bg-status-high-soft text-status-high border-status-high/30',
  medium: 'bg-status-medium-soft text-status-medium border-status-medium/30',
  low: 'bg-status-low-soft text-status-low border-status-low/30',
  resolved: 'bg-status-resolved-soft text-status-resolved border-status-resolved/30',
  processing: 'bg-status-processing-soft text-status-processing border-status-processing/30',
  neutral: 'bg-surface-sunken text-ink-muted border-line',
}

const PILL_TONES = {
  critical: 'bg-white/95 text-status-critical border-status-critical/40 shadow-xs backdrop-blur-xs',
  high: 'bg-white/95 text-status-high border-status-high/40 shadow-xs backdrop-blur-xs',
  medium: 'bg-white/95 text-status-medium border-status-medium/40 shadow-xs backdrop-blur-xs',
  low: 'bg-white/95 text-status-low border-status-low/40 shadow-xs backdrop-blur-xs',
  resolved: 'bg-white/95 text-status-resolved border-status-resolved/40 shadow-xs backdrop-blur-xs',
  processing: 'bg-white/95 text-ink-muted border-line shadow-xs backdrop-blur-xs',
  neutral: 'bg-white/95 text-ink-muted border-line shadow-xs backdrop-blur-xs',
}

const ICONS = {
  critical: AlertTriangle,
  high: Flag,
  medium: Clock3,
  low: CircleDashed,
  resolved: CheckCircle2,
  processing: Clock3,
  neutral: CircleDashed,
}

export default function StatusBadge({ tone = 'neutral', label, icon = true, pill = false, className = '' }) {
  const Icon = ICONS[tone] ?? ICONS.neutral
  const toneMap = pill ? PILL_TONES : TONES
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide
        ${toneMap[tone] ?? toneMap.neutral} ${className}`}
    >
      {icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  )
}
