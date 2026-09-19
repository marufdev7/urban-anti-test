import { useId } from 'react'

export default function Select({
  label,
  error,
  id,
  options = [],
  placeholder,
  className = '',
  ...props
}) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className={className}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-ink mb-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={!!error}
        className={`block w-full rounded-panel border bg-surface-panel px-3 py-2 text-sm text-ink
          focus:border-primary ${error ? 'border-status-critical' : 'border-line'}`}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-status-critical" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
