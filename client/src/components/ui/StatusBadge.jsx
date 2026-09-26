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
  critical: 'bg-rose-50 text-rose-800 border-rose-300',
  high: 'bg-orange-50 text-orange-900 border-orange-400',
  medium: 'bg-yellow-50 text-yellow-900 border-yellow-400',
  low: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  processing: 'bg-slate-100 text-slate-800 border-slate-300',
  neutral: 'bg-surface-sunken text-ink border-line',
}

const PILL_TONES = {
  critical: 'bg-rose-100/90 text-rose-800 border-rose-300 shadow-xs backdrop-blur-xs',
  high: 'bg-orange-100/90 text-orange-900 border-orange-400 shadow-xs backdrop-blur-xs',
  medium: 'bg-yellow-100/90 text-yellow-900 border-yellow-400 shadow-xs backdrop-blur-xs',
  low: 'bg-emerald-100/90 text-emerald-800 border-emerald-300 shadow-xs backdrop-blur-xs',
  resolved: 'bg-emerald-100/90 text-emerald-800 border-emerald-300 shadow-xs backdrop-blur-xs',
  processing: 'bg-slate-100/95 text-slate-800 border-slate-300 shadow-xs backdrop-blur-xs',
  neutral: 'bg-slate-100/95 text-ink border-slate-300 shadow-xs backdrop-blur-xs',
}

const ICON_COLORS = {
  critical: 'text-rose-600',
  high: 'text-orange-600',
  medium: 'text-yellow-600',
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        pill ? 'normal-case' : 'uppercase tracking-wide'
      } ${toneMap[tone] ?? toneMap.neutral} ${className}`}
    >
      {icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />}
      <span className="font-semibold">{label}</span>
    </span>
  )
}
