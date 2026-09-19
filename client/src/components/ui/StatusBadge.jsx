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
  critical: 'bg-status-critical-soft text-black border-status-critical/40',
  high: 'bg-status-high-soft text-black border-status-high/40',
  medium: 'bg-status-medium-soft text-black border-status-medium/40',
  low: 'bg-status-low-soft text-black border-status-low/40',
  resolved: 'bg-emerald-100 text-black border-emerald-300',
  processing: 'bg-status-processing-soft text-black border-status-processing/40',
  neutral: 'bg-surface-sunken text-black border-line',
}

const PILL_TONES = {
  critical: 'bg-rose-100/90 text-black border-rose-300 shadow-xs backdrop-blur-xs',
  high: 'bg-amber-100/90 text-black border-amber-300 shadow-xs backdrop-blur-xs',
  medium: 'bg-sky-100/90 text-black border-sky-300 shadow-xs backdrop-blur-xs',
  low: 'bg-emerald-100/90 text-black border-emerald-300 shadow-xs backdrop-blur-xs',
  resolved: 'bg-emerald-100/90 text-black border-emerald-300 shadow-xs backdrop-blur-xs',
  processing: 'bg-slate-100/95 text-black border-slate-300 shadow-xs backdrop-blur-xs',
  neutral: 'bg-slate-100/95 text-black border-slate-300 shadow-xs backdrop-blur-xs',
}

const ICON_COLORS = {
  critical: 'text-rose-600',
  high: 'text-amber-600',
  medium: 'text-sky-600',
  low: 'text-emerald-600',
  resolved: 'text-emerald-700',
  processing: 'text-slate-600',
  neutral: 'text-slate-500',
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
  const iconColor = ICON_COLORS[tone] ?? ICON_COLORS.neutral
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-black ${
        pill ? 'normal-case' : 'uppercase tracking-wide'
      } ${toneMap[tone] ?? toneMap.neutral} ${className}`}
    >
      {icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />}
      <span className="text-black font-semibold">{label}</span>
    </span>
  )
}
