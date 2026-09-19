/** Three-step wizard indicator (citizen-submit-new-issue.png). */
export default function StepIndicator({ steps, current }) {
  return (
    <ol className="mb-5 flex items-center gap-3 sm:gap-6">
      {steps.map((label, index) => {
        const state =
          index < current ? 'done' : index === current ? 'active' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
                ${state === 'done' || state === 'active'
                  ? 'bg-primary text-white'
                  : 'bg-surface-sunken text-ink-faint'}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              {index + 1}
            </span>
            <span
              className={`text-sm font-medium ${
                state === 'todo' ? 'text-ink-faint' : 'text-primary'
              }`}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
