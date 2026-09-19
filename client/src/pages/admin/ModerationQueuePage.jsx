import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  EyeOff,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useModerate } from '../../hooks/admin'
import { useIssues, issueStatusLabel } from '../../hooks/issues'
import { categoryLabel, useCategories } from '../../hooks/data'
import { shortId, timeAgo } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonList } from '../../components/ui/Skeleton'

function useAllReports() {
  return useQuery({
    queryKey: ['reports', 'admin', 'all'],
    queryFn: () => api('/reports?limit=50'),
  })
}

/**
 * Admin Moderation & Work Queue.
 * Displays ALL actual issues from the database.
 * Tabs: All Flags / All Issues, New, In Process, Resolved.
 */
export default function ModerationQueuePage() {
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'new' | 'in_process' | 'resolved'
  const [severityFilter, setSeverityFilter] = useState('all') // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [search, setSearch] = useState('')
  const [localStatusMap, setLocalStatusMap] = useState({}) // { [issueId]: { status, action } }

  const { data: categories } = useCategories()
  const issuesQuery = useIssues({}, { refetchInterval: 15_000 })
  const reportsQuery = useAllReports()
  const moderate = useModerate('issue')

  const [dialogTarget, setDialogTarget] = useState(null)
  const [dialogAction, setDialogAction] = useState('hide') // 'hide' | 'remove'
  const [reason, setReason] = useState('')
  const [submitError, setSubmitError] = useState(null)

  const openDialog = (id, title, action = 'hide') => {
    setDialogTarget({ id, title })
    setDialogAction(action)
    setReason('')
    setSubmitError(null)
  }

  const confirm = async (actionToRun) => {
    setSubmitError(null)
    const action = actionToRun || dialogAction
    try {
      if (action === 'hide' || action === 'remove') {
        await moderate.mutateAsync({ id: dialogTarget.id, action, reason: reason.trim() })
      }
      setLocalStatusMap((prev) => ({
        ...prev,
        [dialogTarget.id]: { status: 'resolved', action },
      }))
      setDialogTarget(null)
    } catch (err) {
      setSubmitError(err.message)
    }
  }

  const handleMoveToInProcess = (id) => {
    setLocalStatusMap((prev) => ({
      ...prev,
      [id]: { status: 'in_process' },
    }))
  }

  const handleResolveDirectly = (id) => {
    setLocalStatusMap((prev) => ({
      ...prev,
      [id]: { status: 'resolved', action: 'resolved' },
    }))
  }

  const handleReopen = (id) => {
    setLocalStatusMap((prev) => ({
      ...prev,
      [id]: { status: 'in_process' },
    }))
  }

  const rawIssues = issuesQuery.data?.data ?? []
  const rawReports = reportsQuery.data?.data ?? []

  // Map each actual database Issue to a Queue Card item
  const queueItems = useMemo(() => {
    return rawIssues.map((issue) => {
      // Find associated bundled report for actual citizen description & submitter
      const linkedReport = rawReports.find(
        (r) => r.issueId === issue.id || r.id === issue.representativeReportId
      )

      const sev = (issue.severity?.current || issue.computedSeverity || 'medium').toLowerCase()
      const text =
        linkedReport?.description ||
        issue.severity?.rationale ||
        'Reported incident undergoing municipal response.'

      // Determine workflow status from real DB issue status
      let workflowStatus = 'new'
      let resolutionAction = null

      if (localStatusMap[issue.id]) {
        workflowStatus = localStatusMap[issue.id].status
        resolutionAction = localStatusMap[issue.id].action
      } else if (issue.status === 'resolved' || issue.status === 'closed') {
        workflowStatus = 'resolved'
        resolutionAction = 'resolved'
      } else if (issue.status === 'acknowledged' || issue.status === 'in_progress') {
        workflowStatus = 'in_process'
      } else if (issue.status === 'triaged' || issue.status === 'submitted') {
        workflowStatus = 'new'
      } else {
        workflowStatus = 'new'
      }

      const isPiiOrSevere = sev === 'critical' || text.toLowerCase().includes('accident') || text.toLowerCase().includes('danger')
      const flagSeverity =
        sev === 'critical'
          ? 'Critical Risk'
          : sev === 'high'
          ? 'High Priority'
          : sev === 'medium'
          ? 'Medium Priority'
          : 'Low Priority'

      return {
        id: issue.id,
        primaryCategory: issue.primaryCategory,
        severity: sev,
        flagSeverity,
        isPiiOrSevere,
        status: issue.status,
        createdAt: issue.openedAt || linkedReport?.createdAt || new Date().toISOString(),
        submitter:
          linkedReport?.author?.name ||
          `Citizen #${shortId(linkedReport?.authorId || issue.id).slice(0, 4)}`,
        reviewResult:
          issue.severity?.rationale ||
          (sev === 'critical'
            ? 'Auto-flagged (Vision & Priority API)'
            : 'Auto-flagged (Priority Filter)'),
        snippet: text,
        workflowStatus,
        resolutionAction,
      }
    })
  }, [rawIssues, rawReports, localStatusMap])

  // Dynamic counts for each tab from actual database items
  const counts = useMemo(() => {
    const all = queueItems.length
    const newCount = queueItems.filter((i) => i.workflowStatus === 'new').length
    const inProcessCount = queueItems.filter((i) => i.workflowStatus === 'in_process').length
    const resolvedCount = queueItems.filter((i) => i.workflowStatus === 'resolved').length
    return { all, new: newCount, in_process: inProcessCount, resolved: resolvedCount }
  }, [queueItems])

  // Filter items by status tab, severity, and search term
  const filteredItems = useMemo(() => {
    return queueItems.filter((item) => {
      if (statusFilter !== 'all' && item.workflowStatus !== statusFilter) return false
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false
      if (search.trim()) {
        const query = search.toLowerCase()
        const descMatch = (item.snippet || '').toLowerCase().includes(query)
        const idMatch = (item.id || '').toLowerCase().includes(query)
        const submitterMatch = (item.submitter || '').toLowerCase().includes(query)
        const catMatch = (item.primaryCategory || '').toLowerCase().includes(query)
        if (!descMatch && !idMatch && !submitterMatch && !catMatch) return false
      }
      return true
    })
  }, [queueItems, statusFilter, severityFilter, search])

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Moderation Queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review all municipal issues and flagged reports from the database.
        </p>
      </div>

      {/* Filter Tabs matching user request: All Flags, New, In Process, Resolved */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
            }`}
          >
            All Flags ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('new')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'new'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
            }`}
          >
            New ({counts.new})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_process')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'in_process'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
            }`}
          >
            In Process ({counts.in_process})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === 'resolved'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'border border-line bg-surface-panel text-ink-muted hover:text-ink'
            }`}
          >
            Resolved ({counts.resolved})
          </button>
        </div>

        {/* Severity Sub-Filter & Search Input */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface-sunken p-1 text-xs">
            <button
              type="button"
              onClick={() => setSeverityFilter('all')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                severityFilter === 'all'
                  ? 'bg-surface-panel text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All Severities
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('critical')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                severityFilter === 'critical'
                  ? 'bg-surface-panel text-rose-600 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Critical
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('high')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                severityFilter === 'high'
                  ? 'bg-surface-panel text-amber-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              High
            </button>
            <button
              type="button"
              onClick={() => setSeverityFilter('medium')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                severityFilter === 'medium'
                  ? 'bg-surface-panel text-sky-700 shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Medium
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-44 rounded-full border border-line bg-surface-panel pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {issuesQuery.isLoading ? (
        <SkeletonList count={4} />
      ) : issuesQuery.isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">{issuesQuery.error.message}</p>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <EmptyState
            title="No issues match this filter"
            message={`No database issues found under ${
              statusFilter === 'all' ? 'the selected criteria' : `"${statusFilter.replace('_', ' ')}"`
            }.`}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isResolved = item.workflowStatus === 'resolved'
            const isCritical = item.severity === 'critical'
            const isHigh = item.severity === 'high'
            const borderColor = isCritical
              ? 'border-l-rose-500'
              : isHigh
              ? 'border-l-amber-500'
              : 'border-l-sky-500'

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-panel border border-line bg-surface-panel p-5 shadow-xs transition border-l-4 ${borderColor}`}
              >
                {/* Top Row: Severity Badge, ID, Status, Timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-bold ${
                        isCritical
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : isHigh
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-sky-300 bg-sky-50 text-sky-700'
                      }`}
                    >
                      {isCritical ? (
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{item.flagSeverity}</span>
                    </span>

                    <span className="font-mono text-xs text-ink-muted">
                      ID: #UM-{shortId(item.id)}
                    </span>

                    {/* Workflow Status Pill */}
                    {item.workflowStatus === 'new' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                        <Clock className="h-3 w-3" />
                        New
                      </span>
                    )}
                    {item.workflowStatus === 'in_process' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        <Clock className="h-3 w-3" />
                        In Process
                      </span>
                    )}
                    {item.workflowStatus === 'resolved' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Resolved
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-ink-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>

                {/* Category Heading */}
                <h3 className="mt-3 text-base font-bold text-ink flex items-center gap-2">
                  <span>{categoryLabel(categories, item.primaryCategory) || 'Public Safety Incident'}</span>
                  <Link
                    to={`/admin/queue/${item.id}`}
                    className="text-xs text-primary font-normal hover:underline inline-flex items-center gap-0.5"
                    title="View issue details"
                  >
                    <span>View Details</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </h3>

                {/* Description Quote Box */}
                <div className="mt-3 rounded-lg bg-sky-50/70 p-3.5 text-xs leading-relaxed text-ink/90">
                  <span>&ldquo;{item.snippet}&rdquo;</span>
                </div>

                {/* Footer: Submitter, Assessment Result, and Action Buttons */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-3 text-xs">
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-ink-muted font-medium">Submitted By</p>
                      <p className="mt-0.5 font-bold text-ink">{item.submitter}</p>
                    </div>
                    <div>
                      <p className="text-ink-muted font-medium">Assessment Result</p>
                      <p className="mt-0.5 text-ink">{item.reviewResult}</p>
                    </div>
                  </div>

                  {/* Contextual Action Buttons */}
                  {isResolved ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolved
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReopen(item.id)}
                        className="text-xs flex items-center gap-1"
                        title="Reopen for review"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {item.workflowStatus === 'new' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMoveToInProcess(item.id)}
                          className="text-xs bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 flex items-center gap-1"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Start Review
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleResolveDirectly(item.id)}
                        className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Resolve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDialog(item.id, categoryLabel(categories, item.primaryCategory), 'hide')}
                        className="text-xs flex items-center gap-1"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        Hide
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => openDialog(item.id, categoryLabel(categories, item.primaryCategory), 'remove')}
                        className="text-xs flex items-center gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Moderation Dialog */}
      <Dialog
        open={!!dialogTarget}
        onClose={() => setDialogTarget(null)}
        title={`${dialogAction === 'hide' ? 'Hide' : 'Remove'} Issue: ${dialogTarget?.title}`}
      >
        <p className="mb-3 text-sm text-ink-muted">
          {dialogAction === 'hide'
            ? 'Choose whether to hide this issue from public view. A reason is mandatory and recorded to the audit log.'
            : 'Choose whether to remove this issue. A reason is mandatory and recorded to the audit log.'}
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
          <Button variant="ghost" onClick={() => setDialogTarget(null)}>Cancel</Button>
          <Button
            variant={dialogAction === 'hide' ? 'secondary' : 'danger'}
            disabled={!reason.trim() || moderate.isPending}
            loading={moderate.isPending}
            onClick={() => confirm(dialogAction)}
          >
            {dialogAction === 'hide' ? 'Confirm Hide' : 'Confirm Remove'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
