import { useState, useEffect } from 'react'
import { CheckCircle2, Loader2, ThumbsUp } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useConfirmIssue, useWithdrawConfirmation } from '../../hooks/issues'

/**
 * Interactive "Me Too / Confirm" button for citizens.
 * Corroborates a civic issue so authorities see multiple citizens affected (FR-16, BR-22, BR-23).
 */
export default function ConfirmIssueButton({
  issueId,
  initialCount = 1,
  initialConfirmed = false,
  className = '',
  size = 'sm', // 'xs' | 'sm' | 'md'
  showCount = true,
}) {
  const { user } = useAuth()
  const isCitizen = user?.role === 'citizen'

  const [hasConfirmed, setHasConfirmed] = useState(Boolean(initialConfirmed))
  const [count, setCount] = useState(Number(initialCount) || 1)
  const [loading, setLoading] = useState(false)

  const confirmMutation = useConfirmIssue(issueId)
  const withdrawMutation = useWithdrawConfirmation(issueId)

  // Keep state synced if props change (e.g. from React Query cache or parent updates)
  useEffect(() => {
    if (!loading) {
      setHasConfirmed(Boolean(initialConfirmed))
      setCount(Number(initialCount) || 1)
    }
  }, [initialConfirmed, initialCount, loading])

  const handleToggle = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!issueId || !isCitizen || loading) return

    setLoading(true)
    if (!hasConfirmed) {
      // Optimistic confirm
      setHasConfirmed(true)
      setCount((prev) => prev + 1)
      try {
        const res = await confirmMutation.mutateAsync()
        if (res?.corroborationCount !== undefined) {
          setCount(res.corroborationCount)
        }
      } catch (err) {
        if (err?.code === 'ALREADY_CONFIRMED') {
          setHasConfirmed(true)
        } else {
          // Revert optimistic update
          setHasConfirmed(false)
          setCount((prev) => Math.max(1, prev - 1))
        }
      } finally {
        setLoading(false)
      }
    } else {
      // Optimistic withdraw
      setHasConfirmed(false)
      setCount((prev) => Math.max(1, prev - 1))
      try {
        await withdrawMutation.mutateAsync()
      } catch (err) {
        // Revert
        setHasConfirmed(true)
        setCount((prev) => prev + 1)
      } finally {
        setLoading(false)
      }
    }
  }

  const sizeClasses = {
    xs: 'px-2 py-1 text-[11px] gap-1',
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
  }[size] || 'px-2.5 py-1.5 text-xs gap-1.5'

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!isCitizen || loading}
      title={
        !isCitizen
          ? 'Only verified citizens can confirm issues'
          : hasConfirmed
            ? 'You confirmed this problem affects you too. Click to revoke.'
            : 'Click "Me Too" to confirm this problem affects your neighborhood too.'
      }
      className={`inline-flex items-center justify-center font-semibold rounded-panel transition-all active:scale-[0.98] select-none shadow-xs ${sizeClasses} ${
        hasConfirmed
          ? 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600'
          : 'bg-[#005a4c]/10 text-[#005a4c] hover:bg-[#005a4c]/20 border border-[#005a4c]/30'
      } ${!isCitizen ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : hasConfirmed ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white" />
      ) : (
        <ThumbsUp className="h-3.5 w-3.5 shrink-0" />
      )}

      <span>
        {hasConfirmed ? 'Confirmed (Me Too)' : 'Me Too / Confirm'}
      </span>

      {showCount && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
            hasConfirmed ? 'bg-white/25 text-white' : 'bg-[#005a4c]/20 text-[#005a4c]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
