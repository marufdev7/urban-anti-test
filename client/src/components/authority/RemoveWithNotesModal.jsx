import { useState } from 'react'
import { AlertTriangle, Check, ShieldAlert, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { shortId } from '../../lib/format'
import Button from '../ui/Button'
import Dialog from '../ui/Dialog'

const PRESET_REASONS = [
  'Spam / Inappropriate content',
  'Duplicate submission',
  'Invalid / Test submission',
  'Out of municipal operational scope',
  'Unverifiable incident details',
]

/**
 * RemoveWithNotesModal allows authorities to discard unwanted reports or issues
 * while capturing required moderation audit notes.
 */
export default function RemoveWithNotesModal({ open, onClose, item, onSuccess }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isIssue = item?.type === 'issue'
  const targetLabel = isIssue ? 'Issue' : 'Report'
  const displayId = item?.id ? shortId(item.id) : ''

  const handleClose = () => {
    if (submitting) return
    setReason('')
    setError(null)
    onClose?.()
  }

  const handleSelectPreset = (preset) => {
    if (!reason.trim()) {
      setReason(preset)
    } else if (!reason.includes(preset)) {
      setReason((prev) => `${prev.trim()}; ${preset}`)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Please provide a reason or note explaining why this is being removed.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const endpoint = isIssue
        ? `/issues/${item.id}/moderation`
        : `/reports/${item.id}/moderation`

      await api(endpoint, {
        method: 'POST',
        body: {
          action: 'remove',
          reason: reason.trim(),
        },
      })

      setReason('')
      onSuccess?.()
      onClose?.()
    } catch (err) {
      setError(err.message || `Failed to remove ${targetLabel.toLowerCase()}. Please try again.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Remove ${targetLabel} #${displayId}`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            This action will remove <strong>#{displayId}</strong> from all active citizen and operational views. A permanent audit log with your notes will be recorded.
          </p>
        </div>

        {/* Item Summary snippet */}
        {item && (
          <div className="rounded-lg border border-line bg-surface-sunken p-3 text-xs space-y-1">
            <div className="flex items-center justify-between text-ink-muted">
              <span>{item.category || 'General'}</span>
              <span className="font-mono font-bold text-ink">ID: #{displayId}</span>
            </div>
            {item.description && (
              <p className="line-clamp-2 text-ink italic font-normal">
                "{item.description}"
              </p>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-800" role="alert">
            {error}
          </div>
        )}

        {/* Preset Reasons */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-ink">
            Quick Reason Tags:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                  reason.includes(preset)
                    ? 'border-[#005a4c] bg-[#e3f2ef] text-[#005a4c] font-semibold'
                    : 'border-line bg-surface-panel text-ink-muted hover:border-slate-400 hover:text-ink'
                }`}
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Reason / Notes Input */}
        <div className="space-y-1.5">
          <label htmlFor="removal-notes" className="block text-xs font-semibold text-ink">
            Removal Notes / Reason <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="removal-notes"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide notes explaining why this report or incident is being removed..."
            className="w-full rounded-lg border border-line bg-surface-panel p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-[#005a4c] focus:ring-1 focus:ring-[#005a4c] focus:outline-none"
          />
          <p className="text-[11px] text-ink-muted">
            Required for compliance and municipal records.
          </p>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 border-t border-line pt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{submitting ? 'Removing...' : 'Remove with Notes'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  )
}
