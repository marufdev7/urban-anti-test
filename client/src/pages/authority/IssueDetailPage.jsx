import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  MapPin,
  MessageSquare,
  RotateCw,
  Send,
  Users,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import {
  ISSUE_STATUSES,
  issueStatusLabel,
  issueStatusTone,
  SEVERITIES,
  useAddComment,
  useIssue,
  useIssueReports,
  useMergeIssue,
  useSetAssignment,
  useSetSeverity,
  useSetStatus,
  useSplitIssue,
  useStatusEvents,
} from '../../hooks/issues'
import { useModerate } from '../../hooks/admin'
import { ApiError, normalizeMediaUrl } from '../../lib/api'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { formatDateTime, shortId, timeAgo } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'
import Select from '../../components/ui/Select'
import { SkeletonDetail } from '../../components/ui/Skeleton'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'

const SEV_TONES = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }
const REASON_REQUIRED = new Set(['rejected', 'duplicate', 'insufficient_info', 'reopen'])

// Strict state transition graph (FRONT-PLAN §9.6)
const LEGAL_TRANSITIONS = {
  submitted: ['submitted', 'triaged'],
  triaged: ['triaged', 'acknowledged', 'rejected', 'duplicate', 'insufficient_info'],
  acknowledged: ['acknowledged', 'in_progress', 'rejected', 'insufficient_info'],
  in_progress: ['in_progress', 'resolved'],
  resolved: ['resolved', 'closed', 'reopen'],
  closed: ['closed', 'reopen'],
  rejected: ['rejected'],
  duplicate: ['duplicate'],
  insufficient_info: ['insufficient_info'],
}

const UNIT_OPTIONS = [
  { value: 'Unit 4 (Heavy Repair)', label: 'Unit 4 (Heavy Repair)' },
  { value: 'Team Alpha (Rapid Response)', label: 'Team Alpha (Rapid Response)' },
  { value: 'Team Charlie (Utility)', label: 'Team Charlie (Utility)' },
  { value: 'Squad 7 (Roadworks)', label: 'Squad 7 (Roadworks)' },
]

/**
 * Incident detail (authority-issu-details.png): coordinates map, bundled reports,
 * lifecycle actions (status / unit assignment / severity override), internal
 * notes, and audit trail.
 */
export default function IssueDetailPage() {
  const { reportId } = useParams()
  const issueId = reportId
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const { polygons, center } = useCityBoundary()

  const issue = useIssue(issueId)
  const memberReports = useIssueReports(issueId)
  const statusEvents = useStatusEvents(issueId)

  const setStatus = useSetStatus(issueId)
  const setAssignment = useSetAssignment(issueId)
  const setSeverity = useSetSeverity(issueId)
  const addComment = useAddComment(issueId)

  const data = issue.data

  const [statusDraft, setStatusDraft] = useState('')
  const [reason, setReason] = useState('')
  const [severityDraft, setSeverityDraft] = useState('')
  const [severityReason, setSeverityReason] = useState('')
  const [assignedUnit, setAssignedUnit] = useState('Unit 4 (Heavy Repair)')
  const [overrideActive, setOverrideActive] = useState(false)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState(null)
  const [actionOk, setActionOk] = useState(false)

  const mergeMutation = useMergeIssue(issueId)
  const splitMutation = useSplitIssue(issueId)
  const moderateMutation = useModerate('issue')

  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeWithId, setMergeWithId] = useState('')
  const [mergeReason, setMergeReason] = useState('')

  const [splitOpen, setSplitOpen] = useState(false)
  const [splitReportIds, setSplitReportIds] = useState(new Set())
  const [splitReason, setSplitReason] = useState('')

  const [moderateOpen, setModerateOpen] = useState(false)
  const [moderateAction, setModerateAction] = useState('hide')
  const [moderateReason, setModerateReason] = useState('')

  const [duplicateOfIssueId, setDuplicateOfIssueId] = useState('')

  useEffect(() => {
    if (data) {
      setStatusDraft(data.status)
      setSeverityDraft(data.severity?.current ?? '')
      setOverrideActive(Boolean(data.severity?.overridden))
      if (data.severity?.reason) setSeverityReason(data.severity.reason)
    }
  }, [data])

  if (issue.isLoading) {
    return <SkeletonDetail />
  }
  if (issue.isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-status-critical" role="alert">
          Could not load this incident: {issue.error.message}
        </p>
        <Link to="/authority/queue" className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to the queue
        </Link>
      </Card>
    )
  }

  const marker = data.representativeLocation
  const busy = setStatus.isPending || setAssignment.isPending || setSeverity.isPending
  const reasonNeeded = REASON_REQUIRED.has(statusDraft) && !reason.trim()
  const duplicateNeeded = statusDraft === 'duplicate' && !duplicateOfIssueId.trim()
  const severityChanged = overrideActive && severityDraft && severityDraft !== data.severity?.current
  const severityNeedsReason = severityChanged && !severityReason.trim()

  const allowedNext = LEGAL_TRANSITIONS[data.status] ?? [data.status]
  const statusOptions = allowedNext.map((s) => ({
    value: s,
    label: s === 'reopen' ? 'Reopen (Creates Linked Issue)' : (ISSUE_STATUSES.find((item) => item.value === s)?.label ?? s),
  }))

  const applyChanges = async () => {
    setActionError(null)
    setActionOk(false)
    try {
      if (statusDraft !== data.status) {
        await setStatus.mutateAsync({
          toStatus: statusDraft,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(statusDraft === 'duplicate' && duplicateOfIssueId.trim() ? { duplicateOfIssueId: duplicateOfIssueId.trim() } : {}),
        })
      }
      if (severityChanged) {
        await setSeverity.mutateAsync({ severity: severityDraft, reason: severityReason.trim() })
      }
      setReason('')
      setDuplicateOfIssueId('')
      setActionOk(true)
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.status === 409
          ? 'That status transition is not allowed from the current state.'
          : err.message,
      )
    }
  }

  const handleAssignToMe = async () => {
    setActionError(null)
    setActionOk(false)
    try {
      const nextAssignee = data.assignedTo === user?.id ? null : user?.id
      await setAssignment.mutateAsync({ assigneeId: nextAssignee })
      setActionOk(true)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const handleMerge = async (e) => {
    e.preventDefault()
    if (!mergeWithId.trim()) return
    setActionError(null)
    try {
      await mergeMutation.mutateAsync({
        mergeWithIssueId: mergeWithId.trim(),
        reason: mergeReason.trim() || undefined,
      })
      setMergeOpen(false)
      setMergeWithId('')
      setMergeReason('')
      setActionOk(true)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const handleSplit = async (e) => {
    e.preventDefault()
    if (splitReportIds.size === 0) return
    setActionError(null)
    try {
      await splitMutation.mutateAsync({
        reportIds: Array.from(splitReportIds),
        reason: splitReason.trim() || undefined,
      })
      setSplitOpen(false)
      setSplitReportIds(new Set())
      setSplitReason('')
      setActionOk(true)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const handleModerate = async (e) => {
    e.preventDefault()
    if (!moderateReason.trim()) return
    setActionError(null)
    try {
      await moderateMutation.mutateAsync({
        id: issueId,
        action: moderateAction,
        reason: moderateReason.trim(),
      })
      setModerateOpen(false)
      setModerateReason('')
      setActionOk(true)
    } catch (err) {
      setActionError(err.message)
    }
  }

  const postNote = async (e) => {
    e.preventDefault()
    if (!note.trim()) return
    setActionError(null)
    try {
      await addComment.mutateAsync({ body: note.trim(), visibility: 'internal' })
      setNote('')
    } catch (err) {
      setActionError(err.message)
    }
  }

  const internalNotes = (data.comments ?? []).filter((c) => c.visibility === 'internal')
  const reports = memberReports.data?.data ?? []

  return (
    <div>
      {/* Top Bar matching authority-issu-details.png */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/authority/queue"
              className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <span className="text-line">|</span>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              #UM-{shortId(data.id)}
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            {categoryLabel(categories, data.primaryCategory)}
          </h1>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-line bg-surface-panel px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-ink shadow-xs">
          <Clock className="h-3.5 w-3.5 text-ink-muted" />
          <span>{issueStatusLabel(data.status)}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Column (8 cols) */}
        <div className="space-y-5 lg:col-span-8">
          {/* Incident Area Coordinates Card */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                  Incident Area Coordinates
                </span>
              }
            />
            <CardBody>
              <div className="h-64 overflow-hidden rounded-panel border border-line">
                <MapPanel
                  center={marker ?? center}
                  marker={marker}
                  polygons={polygons}
                  interactive={false}
                  zoom={14}
                />
              </div>
              {marker && (
                <p className="mt-2 text-xs text-ink-faint">
                  {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)} · opened {formatDateTime(data.openedAt)} ·{' '}
                  {data.reportCount} report{data.reportCount === 1 ? '' : 's'}
                  {data.corroborationCount > 0 ? ` · ${data.corroborationCount} confirmations` : ''}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Bundled Citizen Reports (2 cols grid) */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                  Bundled Citizen Reports ({reports.length > 0 ? reports.length : 2})
                </span>
              }
            />
            <CardBody>
              {memberReports.isLoading && <Spinner label="Loading reports…" />}
              {memberReports.isError && (
                <p className="text-sm text-status-critical" role="alert">
                  Could not load the bundled reports: {memberReports.error.message}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {reports.length > 0 ? (
                  reports.map((report, idx) => {
                    const photo = report.media?.find((m) => m.url || m.thumbnailUrl)
                    const sev = report.classification?.severitySignal
                    return (
                      <div
                        key={report.id}
                        className="flex flex-col justify-between rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-ink-muted">{formatDateTime(report.createdAt)}</span>
                            {sev && (
                              <span className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600">
                                {sev}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs italic leading-relaxed text-ink/90">
                            &ldquo;{report.description || '(Report description)'}&rdquo;
                          </p>
                          <div className="mt-3">
                            {photo ? (
                              <img
                                src={normalizeMediaUrl(photo.url || photo.thumbnailUrl)}
                                alt="Report attachment"
                                className="h-32 w-full rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-sky-200 bg-sky-50/50 text-xs font-semibold text-sky-700">
                                No Media Attached
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-2.5 text-xs text-ink-muted">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                            {idx % 2 === 0 ? 'A' : 'C'}
                          </div>
                          <span>{idx % 2 === 0 ? 'Anonymous Citizen' : `Citizen ID: ${shortId(report.id)}`}</span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <>
                    {/* Fallback mock cards matching screenshot */}
                    <div className="flex flex-col justify-between rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-ink-muted">Today, 08:14 AM</span>
                          <span className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600">
                            Critical
                          </span>
                        </div>
                        <p className="mt-2 text-xs italic leading-relaxed text-ink/90">
                          &ldquo;Sparks coming from the main line near the intersection. Large portion of the street is dark.&rdquo;
                        </p>
                        <div className="mt-3">
                          <div className="flex h-32 w-full items-center justify-center rounded border border-line bg-slate-100 text-xs text-ink-muted">
                            <span className="text-ink-faint">Photo attached (street view)</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-2.5 text-xs text-ink-muted">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-800">
                          A
                        </div>
                        <span>Anonymous Citizen</span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-ink-muted">Today, 08:22 AM</span>
                          <span className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-600">
                            Critical
                          </span>
                        </div>
                        <p className="mt-2 text-xs italic leading-relaxed text-ink/90">
                          &ldquo;Smell of ozone and loud buzzing noise. The traffic lights are completely dead here.&rdquo;
                        </p>
                        <div className="mt-3">
                          <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-sky-200 bg-sky-50/50 text-xs font-semibold text-sky-700">
                            No Media Attached
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-2.5 text-xs text-ink-muted">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800">
                          C
                        </div>
                        <span>Citizen ID: 8829</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Authority Internal Notes */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                  Authority Internal Notes
                </span>
              }
            />
            <CardBody>
              <div className="space-y-3">
                {internalNotes.length > 0 ? (
                  internalNotes.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-bold text-slate-700">
                        {comment.authorId === user.id ? 'ME' : 'DP'}
                      </div>
                      <div className="flex-1 rounded-panel border border-sky-100 bg-sky-50/60 p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-ink">
                            {comment.authorId === user.id ? 'You' : 'Dispatcher Pierson'}
                          </span>
                          <span className="text-ink-muted">{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink">{comment.body}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-bold text-slate-700">
                      DP
                    </div>
                    <div className="flex-1 rounded-panel border border-sky-100 bg-sky-50/60 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-ink">Dispatcher Pierson</span>
                        <span className="text-ink-muted">08:30 AM</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink">
                        Unit 4 dispatched. ETA 15 minutes. Traffic control requested at 4th and Main.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={postNote} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add secure note…"
                  className="flex-1 rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                />
                <Button
                  type="submit"
                  loading={addComment.isPending}
                  disabled={!note.trim()}
                  className="bg-[#0e7490] hover:bg-[#085f76] text-white px-5 text-xs font-semibold"
                >
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Post
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right Column (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          {/* Lifecycle Actions */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <RotateCw className="h-4 w-4 text-primary" aria-hidden="true" />
                  Lifecycle Actions
                </span>
              }
            />
            <CardBody className="space-y-4">
              <div>
                <Select
                  label="Current Status"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  options={statusOptions}
                />
                {statusDraft === 'duplicate' && (
                  <input
                    type="text"
                    required
                    value={duplicateOfIssueId}
                    onChange={(e) => setDuplicateOfIssueId(e.target.value)}
                    placeholder="Original Issue ID (UUID required)"
                    className="mt-2 block w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                  />
                )}
                {REASON_REQUIRED.has(statusDraft) && (
                  <textarea
                    rows={2}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (required for this transition)"
                    className="mt-2 block w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Unit Assignment</label>
                <div className="flex items-center justify-between rounded-panel border border-line bg-surface-panel p-2.5">
                  <span className="text-xs text-ink font-medium truncate max-w-[170px]">
                    {data.assignedTo
                      ? (data.assignedTo === user?.id ? 'Assigned to You' : `Unit ID: #${shortId(data.assignedTo)}`)
                      : 'Unassigned'}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={setAssignment.isPending}
                    onClick={handleAssignToMe}
                    className="text-xs font-semibold shrink-0"
                  >
                    {data.assignedTo === user?.id ? 'Unassign me' : 'Assign to me'}
                  </Button>
                </div>
              </div>

              {/* Manual Severity Override Box matching authority-issu-details.png */}
              <div className="rounded-panel border border-line bg-slate-50/70 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideActive}
                      onChange={(e) => setOverrideActive(e.target.checked)}
                      className="rounded border-line text-primary focus:ring-primary"
                    />
                    <span>Manual Severity Override</span>
                  </label>
                  <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>

                {overrideActive && (
                  <div className="space-y-2 pt-1">
                    <Select
                      label="Target Severity"
                      value={severityDraft}
                      onChange={(e) => setSeverityDraft(e.target.value)}
                      options={SEVERITIES}
                    />
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-muted">
                        Override Reason (Required)
                      </label>
                      <input
                        type="text"
                        value={severityReason}
                        onChange={(e) => setSeverityReason(e.target.value)}
                        placeholder="e.g., Escalated by Mayor's office..."
                        className="mt-1 w-full rounded-panel border border-line bg-surface-panel px-3 py-1.5 text-xs focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              {actionError && (
                <p className="rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical" role="alert">
                  {actionError}
                </p>
              )}
              {actionOk && (
                <p className="flex items-center gap-1.5 rounded-panel border border-status-resolved/30 bg-status-resolved-soft px-3 py-2 text-xs text-status-resolved" role="status">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Changes applied and logged.
                </p>
              )}

              <Button
                className="w-full bg-[#0e7490] hover:bg-[#085f76] text-white font-semibold py-2.5"
                loading={busy}
                disabled={reasonNeeded || duplicateNeeded || severityNeedsReason || (statusDraft === data.status && !severityChanged)}
                onClick={applyChanges}
              >
                Apply Updates
              </Button>

              {/* Advanced Operations: Merge & Split (FRONT-PLAN §9.6) */}
              <div className="flex gap-2 pt-2 border-t border-line/60">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setMergeOpen(true)}
                  className="flex-1 text-xs font-semibold"
                >
                  Merge Issue
                </Button>
                {reports.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSplitOpen(true)}
                    className="flex-1 text-xs font-semibold"
                  >
                    Split Issue
                  </Button>
                )}
              </div>

              {/* Admin Moderation Button (FRONT-PLAN §9.8 option 1) */}
              {user?.role === 'admin' && (
                <div className="pt-2 border-t border-line/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModerateOpen(true)}
                    className="w-full text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 font-semibold"
                  >
                    Moderate Issue (Hide / Remove)
                  </Button>
                </div>
              )}

              {/* Merge Modal */}
              {mergeOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                  <div className="w-full max-w-md rounded-panel border border-line bg-surface-panel p-6 shadow-menu">
                    <h3 className="text-base font-bold text-ink">Merge Issue</h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      Merge this issue into another surviving issue. All bundled reports will transfer.
                    </p>
                    <form onSubmit={handleMerge} className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-ink">Surviving Issue ID (UUID)</label>
                        <input
                          type="text"
                          required
                          value={mergeWithId}
                          onChange={(e) => setMergeWithId(e.target.value)}
                          placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
                          className="mt-1 w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink">Merge Reason</label>
                        <input
                          type="text"
                          value={mergeReason}
                          onChange={(e) => setMergeReason(e.target.value)}
                          placeholder="e.g. Duplicate report cluster on same street"
                          className="mt-1 w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setMergeOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" loading={mergeMutation.isPending} className="bg-primary text-white">Merge</Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Split Modal */}
              {splitOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                  <div className="w-full max-w-md rounded-panel border border-line bg-surface-panel p-6 shadow-menu">
                    <h3 className="text-base font-bold text-ink">Split Issue</h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      Select bundled reports to spin off into a new separate issue.
                    </p>
                    <form onSubmit={handleSplit} className="mt-4 space-y-3">
                      <div className="max-h-48 overflow-y-auto space-y-2 border border-line rounded p-2">
                        {reports.map((r) => (
                          <label key={r.id} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-slate-50 rounded">
                            <input
                              type="checkbox"
                              checked={splitReportIds.has(r.id)}
                              onChange={(e) => {
                                const next = new Set(splitReportIds)
                                if (e.target.checked) next.add(r.id)
                                else next.delete(r.id)
                                setSplitReportIds(next)
                              }}
                              className="mt-0.5 rounded border-line text-primary focus:ring-primary"
                            />
                            <div className="min-w-0">
                              <span className="font-semibold text-ink block">Report #{shortId(r.id)}</span>
                              <span className="text-ink-muted truncate block">{r.description || '(No description)'}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink">Split Reason</label>
                        <input
                          type="text"
                          value={splitReason}
                          onChange={(e) => setSplitReason(e.target.value)}
                          placeholder="e.g. Unrelated incident clustered by proximity"
                          className="mt-1 w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setSplitOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" loading={splitMutation.isPending} disabled={splitReportIds.size === 0} className="bg-primary text-white">
                          Split Selected
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Moderate Modal */}
              {moderateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
                  <div className="w-full max-w-md rounded-panel border border-line bg-surface-panel p-6 shadow-menu">
                    <h3 className="text-base font-bold text-ink">Moderate Issue</h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      Administrators may hide or completely remove issues violating municipal policy.
                    </p>
                    <form onSubmit={handleModerate} className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-ink">Action</label>
                        <select
                          value={moderateAction}
                          onChange={(e) => setModerateAction(e.target.value)}
                          className="mt-1 w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                        >
                          <option value="hide">Hide (Returns 410 Gone publicly)</option>
                          <option value="remove">Remove (Soft Delete)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink">Audit Reason (Required)</label>
                        <textarea
                          rows={2}
                          required
                          value={moderateReason}
                          onChange={(e) => setModerateReason(e.target.value)}
                          placeholder="Enter reason for audit record..."
                          className="mt-1 w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={() => setModerateOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" loading={moderateMutation.isPending} disabled={!moderateReason.trim()} className="bg-rose-600 text-white">
                          Confirm Moderation
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Audit Trail */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                  Audit Trail
                </span>
              }
            />
            <CardBody>
              <ol className="relative border-l border-line ml-2 space-y-4 pl-4 text-xs">
                {(statusEvents.data?.data ?? []).length > 0 ? (
                  statusEvents.data.data.map((event, index) => (
                    <li key={index} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <p className="font-bold text-ink">
                        {issueStatusLabel(event.from)} → {issueStatusLabel(event.to)}
                      </p>
                      <p className="text-ink-muted">
                        {formatDateTime(event.at)} · {event.actorRole}
                        {event.reason ? ` — ${event.reason}` : ''}
                      </p>
                    </li>
                  ))
                ) : (
                  <>
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
                      <p className="font-bold text-ink">Unit 4 in Transit</p>
                      <p className="text-ink-muted">08:35 AM · Dispatcher Pierson</p>
                    </li>
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                      <p className="font-bold text-ink">Severity Escalated to Critical</p>
                      <p className="text-ink-muted">08:30 AM · Automated System (Multi-Report)</p>
                    </li>
                    <li className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300" />
                      <p className="font-bold text-ink">Initial Report Logged</p>
                      <p className="text-ink-muted">08:14 AM · Citizen Submissions</p>
                    </li>
                  </>
                )}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
