import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Modal dialog with Escape-key close, backdrop click and focus on open. */
export default function Dialog({ open, onClose, title, children, footer, className = '' }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined

    // Lock body scroll while dialog is open to prevent background bleed and jump
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

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
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [open])

  if (!open) return null

  const hasCustomMaxWidth = /\bmax-w-/.test(className)

  const dialogContent = (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 overflow-y-auto"
      style={{
        margin: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
      }}
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
        className={`relative my-auto w-full ${hasCustomMaxWidth ? '' : 'max-w-md'} max-h-[90vh] flex flex-col rounded-xl bg-surface-panel shadow-menu border border-line ${className}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-panel p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 text-sm text-ink">{children}</div>
        {footer && <footer className="shrink-0 flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(dialogContent, document.body) : dialogContent
}
