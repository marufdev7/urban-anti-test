import { useId } from 'react'

/**
 * Labelled text input with error announcement (error is wired to the field
 * via aria-describedby so screen readers announce it — FRONTEND_PLAN §9).
 */
export default function Input({
  label,
  error,
  hint,
  id,
  className = '',
  ...props
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`block w-full rounded-panel border bg-surface-panel px-3 py-2 text-sm text-ink
          placeholder:text-ink-faint focus:border-primary
          ${error ? 'border-status-critical' : 'border-line'}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-status-critical" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
