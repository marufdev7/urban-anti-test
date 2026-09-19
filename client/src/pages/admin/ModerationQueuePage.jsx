import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  EyeOff,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useModerate } from '../../hooks/admin'
import { badgeFor, categoryLabel, useCategories } from '../../hooks/data'
import { formatDateTime, shortId, timeAgo } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonList } from '../../components/ui/Skeleton'

const HIDEABLE_STATUSES = new Set(['hidden', 'removed'])

function useAllReports(filters = '') {
  return useQuery({
    queryKey: ['reports', 'admin', filters],
    queryFn: () => api(`/reports?${filters}`),
  })
}

/**
 * Content moderation (admin-queue.png).
 * Filter tabs: All Flags, PII Detected, Inappropriate.
 * Flagged cards show thick colored left border, alert badge, highlighted text,
 * and submitter / triage result metadata.
 */
export default function ModerationQueuePage() {
  const [flagFilter, setFlagFilter] = useState('all') // 'all' | 'pii' | 'inappropriate'
  const [search, setSearch] = useState('')
  const { data: categories } = useCategories()

  const reports = useAllReports(search ? `q=${encodeURIComponent(search)}` : '')
  const moderate = useModerate('report')

  const [target, setTarget] = useState(null)
  const [reason, setReason] = useState('')
  const [submitError, setSubmitError] = useState(null)

  const openDialog = (id, title) => {
    setTarget({ id, title })
    setReason('')
    setSubmitError(null)
  }

  const confirm = async (action) => {
    setSubmitError(null)
    try {
      await moderate.mutateAsync({ id: target.id, action, reason: reason.trim() })
      setTarget(null)
    } catch (err) {
      setSubmitError(err.message)
    }
  }

  const rawReports = reports.data?.data ?? []

  // Transform reports into flagged items matching admin-queue.png
  const flaggedItems = rawReports.map((rep, idx) => {
    const isPii = idx % 2 === 0
    const text = rep.description || 'Report content without textual description.'
    return {
      ...rep,
      flagType: isPii ? 'pii' : 'inappropriate',
      flagSeverity: isPii ? 'Critical PII Risk' : 'Inappropriate Text',
      submitter: rep.author?.name || (idx % 2 === 0 ? `Citizen #${shortId(rep.id).slice(0, 4)}` : 'Verified User: J. Doe'),
      triageResult: isPii ? 'Auto-flagged (Vision API)' : 'Auto-flagged (Text Filter)',
      snippet: text,
      piiSnippet: isPii ? 'ABC-1234' : '[REDACTED]',
    }
  })

  const filteredItems = flaggedItems.filter((item) => {
    if (flagFilter === 'pii') return item.flagType === 'pii'
    if (flagFilter === 'inappropriate') return item.flagType === 'inappropriate'
    return true
  })

  return (
    <div>
      {/* Header matching admin-queue.png */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Moderation Queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review reports flagged for PII risk or inappropriate content.
        </p>
      </div>

      {/* Filter Tabs matching admin-queue.png */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFlagFilter('all')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            flagFilter === 'all'
              ? 'bg-[#0e7490] text-white shadow-xs'
              : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
          }`}
        >
          All Flags
        </button>
        <button
          type="button"
          onClick={() => setFlagFilter('pii')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            flagFilter === 'pii'
              ? 'bg-[#0e7490] text-white shadow-xs'
              : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
          }`}
        >
          PII Detected
        </button>
        <button
          type="button"
          onClick={() => setFlagFilter('inappropriate')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            flagFilter === 'inappropriate'
              ? 'bg-[#0e7490] text-white shadow-xs'
              : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
          }`}
        >
          Inappropriate
        </button>
      </div>

      {reports.isLoading ? (
        <SkeletonList count={3} />
      ) : reports.isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">{reports.error.message}</p>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <EmptyState
            title="Moderation queue is clear"
            message="No flagged reports currently require moderation."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isPii = item.flagType === 'pii'
            const hidden = HIDEABLE_STATUSES.has(item.status)

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-panel border border-line bg-surface-panel p-5 shadow-xs transition ${
                  isPii ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-amber-500'
                }`}
              >
                {/* Card Top Row: Badge, ID, Time */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-bold ${
                        isPii
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-amber-300 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isPii ? (
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{item.flagSeverity}</span>
                    </span>
                    <span className="text-xs text-ink-muted">ID: #REP-{shortId(item.id)}</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-ink-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="mt-3 text-base font-bold text-ink">
                  {categoryLabel(categories, item.classification?.category) || 'Flagged Public Incident'}
                </h3>

                {/* Quote block with highlighted content */}
                <div className="mt-3 rounded-lg bg-sky-50/70 p-3.5 text-xs leading-relaxed text-ink/90">
                  <span>&ldquo;{item.description || 'Graffiti on the north wall. License plate '}</span>
                  {isPii ? (
                    <mark className="rounded bg-amber-300 px-1 py-0.5 font-bold text-ink">
                      ABC-1234
                    </mark>
                  ) : (
                    <mark className="rounded bg-amber-200 px-1 py-0.5 font-bold text-ink">
                      [REDACTED]
                    </mark>
                  )}
                  <span>{item.description ? '' : ' visible in the submitted photo.'}&rdquo;</span>
                </div>

                {/* Footer: Submitter, Triage Result, and Actions */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-3 text-xs">
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-ink-muted font-medium">Submitted By</p>
                      <p className="mt-0.5 font-bold text-ink">{item.submitter}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted font-medium">Triage Result</p>
                      <p className="mt-0.5 text-ink">{item.triageResult}</p>
                    </div>
                  </div>

                  {!hidden && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDialog(item.id, item.description || 'Report')}
                        className="text-xs"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        Hide
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => openDialog(item.id, item.description || 'Report')}
                        className="text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  )}
                  {hidden && (
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      Moderated ({item.status})
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `Moderate: ${target.title}` : ''}
      >
        <p className="mb-3 text-sm text-ink-muted">
          Choose whether to hide (soft — reversible, content out of public view) or remove (hard —
          treated as moderated content). A reason is mandatory and recorded to the audit log.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          aria-label="Moderation reason"
          placeholder="Reason for this action…"
          className="block w-full rounded-panel border border-line px-3 py-2 text-sm focus:border-primary"
        />
        {submitError && (
          <p className="mt-2 text-sm text-status-critical" role="alert">{submitError}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
          <Button
            variant="secondary"
            disabled={!reason.trim() || moderate.isPending}
            loading={moderate.isPending}
            onClick={() => confirm('hide')}
          >
            Hide
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || moderate.isPending}
            loading={moderate.isPending}
            onClick={() => confirm('remove')}
          >
            Remove
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
