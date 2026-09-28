import { Loader2 } from 'lucide-react'

/**
 * TabLoadingSkeleton
 * Provides a stable minimum height (min-h-[460px]) and polished brand loading
 * animation during tab switches to prevent sudden viewport jumps and layout shifts.
 */
export default function TabLoadingSkeleton({
  title = 'Section',
  subtitle = 'Please wait while configuration and details are prepared.',
  minHeight = 'min-h-[460px]',
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${minHeight} w-full flex flex-col items-center justify-center rounded-2xl border border-line bg-surface-panel p-8 text-center animate-fade-in shadow-xs`}
    >
      <div className="relative flex items-center justify-center mb-4">
        {/* Outer subtle pulsing aura */}
        <div className="absolute h-16 w-16 rounded-full bg-[#005a4c]/15 animate-ping" />
        {/* Central themed loader container */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#005a4c]/10 border border-[#005a4c]/20 text-[#005a4c]">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </div>

      <p className="text-base font-bold text-ink">Loading {title}...</p>
      <p className="mt-1 text-xs text-ink-muted max-w-sm">{subtitle}</p>

      {/* Structural layout skeleton lines mimicking cards/forms */}
      <div className="mt-8 w-full max-w-lg space-y-3.5">
        <div className="h-3.5 w-full rounded-md bg-surface-sunken animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 rounded-xl bg-surface-sunken animate-pulse" />
          <div className="h-10 rounded-xl bg-surface-sunken animate-pulse" />
        </div>
        <div className="h-24 w-full rounded-xl bg-surface-sunken animate-pulse" />
        <div className="flex justify-end gap-2 pt-2">
          <div className="h-8 w-24 rounded-lg bg-surface-sunken animate-pulse" />
          <div className="h-8 w-32 rounded-lg bg-[#005a4c]/15 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
