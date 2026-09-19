import { Loader2 } from 'lucide-react'

export default function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center gap-2 text-ink-muted ${className}`} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
