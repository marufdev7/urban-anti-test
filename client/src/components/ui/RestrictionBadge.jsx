import { useEffect, useState } from 'react'
import { formatRemainingCooldown, getAuthorityRestriction } from '../../lib/unnaturalActivity'

/**
 * Dynamic countdown badge for restricted authority accounts.
 *
 * Displays live ticking countdown during the 15-minute cooldown (e.g. "Cooldown (14m 32s)")
 * and automatically clears restriction and transitions back to normal when timer hits zero.
 */
export default function RestrictionBadge({
  restriction,
  onExpire,
  className = '',
  showPulse = true,
}) {
  const [countdownText, setCountdownText] = useState(() =>
    restriction?.level === 'temporary'
      ? formatRemainingCooldown(restriction.restrictedUntil) || '15m'
      : null
  )

  useEffect(() => {
    if (!restriction || restriction.level !== 'temporary' || !restriction.restrictedUntil) {
      return
    }

    // Immediate initial sync
    const initialText = formatRemainingCooldown(restriction.restrictedUntil)
    if (!initialText || initialText === '0s') {
      getAuthorityRestriction(restriction.userId)
      if (onExpire) onExpire()
      return
    }
    setCountdownText(initialText)

    // Ticking every 1 second
    const timer = setInterval(() => {
      const remaining = formatRemainingCooldown(restriction.restrictedUntil)
      if (!remaining || remaining === '0s') {
        clearInterval(timer)
        // Invoking getAuthorityRestriction cleans up expired storage and dispatches alert
        getAuthorityRestriction(restriction.userId)
        if (onExpire) onExpire()
      } else {
        setCountdownText(remaining)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [restriction?.level, restriction?.restrictedUntil, restriction?.userId, onExpire])

  if (!restriction) return null

  if (restriction.level === 'permanent') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 ${className}`}
        title={restriction.reason || 'Account suspended by security engine'}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
        <span>🔴 Suspended</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 shadow-2xs ${className}`}
      title={`${restriction.reason || 'Operational rate limit'}. Remaining: ${countdownText || 'cooldown'}`}
    >
      {showPulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
      )}
      <span>🟠 Cooldown ({countdownText || '15m'})</span>
    </span>
  )
}
