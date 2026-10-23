import { useState } from 'react'
import { CheckCircle2, MessageSquare, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateTime, shortId } from '../../lib/format'
import Button from '../ui/Button'
import Dialog from '../ui/Dialog'

const PRESET_REASONS = [
  'Verified authentic after review',
  'Citizen provided supplementary evidence',
  'Removed in error / accidental discard',
  'Privacy concern resolved',
  'Operational scope re-evaluated',
]

/**
 * ReopenReportModal allows System Administrators to restore / reopen
 * soft-deleted citizen reports back to active municipal records.
 */
export default function ReopenReportModal({ open, onClose, report, onSuccess }) {
  const [reason, setReason] = useState('Verified authentic after administrator review')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!open || !report) return null

  const displayId = shortId(report.id)
  const mod = report.moderation

  const handleClose = () => {
    if (submitting) return
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
      setError('Please provide a brief justification note for reopening this report.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await api(`/reports/${report.id}/moderation`, {
        method: 'POST',
        body: {
          action: 'reopen',
          reason: reason.trim(),
        },
      })

      onSuccess?.(report)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to reopen report. Please check permissions and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Reopen Deleted Report #${displayId}`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Informational Banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50/80 p-3 text-xs text-emerald-950">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <p>
            Reopening <strong>#{displayId}</strong> will restore it from the archive back to active municipal and operational views. A permanent audit log entry will document this restoration.
          </p>
        </div>

        {/* Report Summary Snippet */}
        <div className="rounded-lg border border-line bg-surface-sunken p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="font-medium text-ink">
              {report.classification?.category || report.category || 'General Issue'}
            </span>
            <span className="font-mono font-bold text-ink">ID: #{displayId}</span>
          </div>
          {report.description && (
            <p className="line-clamp-2 text-ink italic font-normal">
              "{report.description}"
            </p>
          )}

          {/* Previous Removal Provenance */}
          {mod && (
            <div className="mt-2 rounded border border-rose-200/80 bg-rose-50/70 p-2 text-2xs text-rose-900">
              <div className="flex items-center gap-1 font-semibold text-rose-950">
                <MessageSquare className="h-3 w-3 text-rose-700" />
                <span>Original Removal Record:</span>
              </div>
              <p className="mt-0.5 italic">"{mod.reason || 'No specific note recorded'}"</p>
              <div className="mt-1 flex items-center justify-between text-rose-700">
                <span>By: {mod.moderator} ({mod.moderatorRole})</span>
                <span>{mod.moderatedAt ? formatDateTime(mod.moderatedAt) : ''}</span>
              </div>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-800" role="alert">
            {error}
          </div>
        )}

        {/* Quick Presets */}
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
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-line bg-surface-panel text-ink-muted hover:border-emerald-400 hover:text-ink'
                }`}
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Reopen Reason / Justification */}
        <div className="space-y-1.5">
          <label htmlFor="reopen-notes" className="block text-xs font-semibold text-ink">
            Reopen Justification / Audit Notes <span className="text-emerald-700">*</span>
          </label>
          <textarea
            id="reopen-notes"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this report is being reopened and restored to active municipal records..."
            className="w-full rounded-lg border border-line bg-surface-panel p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
          />
          <p className="text-[11px] text-ink-muted">
            This justification note is recorded into the municipal audit trail.
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${submitting ? 'animate-spin' : ''}`} />
            <span>{submitting ? 'Reopening Report...' : 'Reopen Report (পুনরায় চালু করুন)'}</span>
          </button>
        </div>
      </form>
    </Dialog>
  )
}
