import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/** Modal dialog with Escape-key close, backdrop click and focus on open. */
export default function Dialog({ open, onClose, title, children, footer, className = '' }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    // Remember what was focused before the modal so it can be returned there.
    const previouslyFocused = document.activeElement
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)

    // Only focus the dialog container if focus is not already inside it
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [open])

  if (!open) return null

  const hasCustomMaxWidth = /\bmax-w-/.test(className)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${hasCustomMaxWidth ? '' : 'max-w-md'} max-h-[90vh] flex flex-col rounded-xl bg-surface-panel shadow-2xl shadow-slate-950/25 border border-line ring-1 ring-black/5 ${className}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 text-sm text-ink">{children}</div>
        {footer && <footer className="shrink-0 flex justify-end gap-2 border-t border-line bg-surface-sunken/30 px-5 py-3 rounded-b-xl">{footer}</footer>}
      </div>
    </div>
  )
}
