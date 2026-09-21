import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Labelled text input with error announcement and built-in password show/hide toggle.
 * Error is wired to the field via aria-describedby so screen readers announce it — FRONTEND_PLAN §9.
 */
export default function Input({
  label,
  error,
  hint,
  id,
  type = 'text',
  showPasswordToggle = true,
  className = '',
  ...props
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={effectiveType}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`block w-full rounded-panel border bg-surface-panel px-3 py-2 text-sm text-ink
            placeholder:text-ink-faint focus:border-primary focus:outline-none
            ${isPassword && showPasswordToggle ? 'pr-10' : ''}
            ${error ? 'border-status-critical' : 'border-line'}`}
          {...props}
        />
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted hover:text-ink focus:outline-none cursor-pointer transition"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-ink-muted hover:text-ink" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4 text-ink-muted hover:text-ink" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
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
