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
  critical: 'bg-rose-50/95 text-rose-600 border-rose-200 shadow-xs backdrop-blur-xs',
  high: 'bg-amber-50/95 text-amber-600 border-amber-200 shadow-xs backdrop-blur-xs',
  medium: 'bg-sky-50/95 text-sky-600 border-sky-200 shadow-xs backdrop-blur-xs',
  low: 'bg-emerald-50/95 text-emerald-600 border-emerald-200 shadow-xs backdrop-blur-xs',
  resolved: 'bg-emerald-50/95 text-emerald-600 border-emerald-200 shadow-xs backdrop-blur-xs',
  processing: 'bg-slate-100/95 text-slate-600 border-slate-200 shadow-xs backdrop-blur-xs',
  neutral: 'bg-slate-100/95 text-slate-600 border-slate-200 shadow-xs backdrop-blur-xs',
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        pill ? 'font-medium normal-case' : 'font-semibold uppercase tracking-wide'
      } ${toneMap[tone] ?? toneMap.neutral} ${className}`}
    >
      {icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </span>
  )
}
