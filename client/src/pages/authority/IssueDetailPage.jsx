import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  RotateCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
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
  useIssues,
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
import { formatDateTime, shortId } from '../../lib/format'
import {
  clearCustomDeadline,
  getCustomDeadline,
  getSlaInfo,
  saveCustomDeadline,
  SLA_DURATIONS_MS,
} from '../../lib/sla'
import SlaBadge from '../../components/ui/SlaBadge'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import MapPanel from '../../components/MapPanel'
import Select from '../../components/ui/Select'
import { SkeletonDetail } from '../../components/ui/Skeleton'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'
import RemoveWithNotesModal from '../../components/authority/RemoveWithNotesModal'

function haversineMeters(a, b) {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return 999999
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function sevTone(sev) {
  switch (sev?.toLowerCase()) {
    case 'critical':
      return 'border-rose-300 bg-rose-50 text-rose-700'
    case 'high':
      return 'border-orange-300 bg-orange-50 text-orange-800'
    case 'medium':
      return 'border-amber-300 bg-amber-50 text-amber-800'
    case 'low':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

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

function IssueReportPhoto({ photo }) {
  const [failed, setFailed] = useState(false)
  const [useThumb, setUseThumb] = useState(false)
  if (!photo || failed) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded border border-dashed border-sky-200 bg-sky-50/50 text-xs font-semibold text-sky-700">
        {failed ? 'Media Expired / Unavailable' : 'No Media Attached'}
      </div>
    )
  }
  const src = useThumb
    ? normalizeMediaUrl(photo.thumbnailUrl)
    : normalizeMediaUrl(photo.url || photo.thumbnailUrl)

  return (
    <img
      src={src}
      alt="Report attachment"
      className="h-32 w-full rounded object-cover"
      onError={() => {
        if (!useThumb && photo.thumbnailUrl && photo.url && photo.url !== photo.thumbnailUrl) {
          setUseThumb(true)
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

/**
 * Incident detail (authority-issu-details.png): coordinates map, bundled reports,
 * lifecycle actions (status / unit assignment / severity override), internal
 * notes, and audit trail.
 */
export default function IssueDetailPage() {
  const navigate = useNavigate()
  const { reportId } = useParams()
  const issueId = reportId
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const { polygons, center } = useCityBoundary()

  const [removeModalOpen, setRemoveModalOpen] = useState(false)

  const backLink = user?.role === 'admin' ? '/admin/queue' : '/authority/queue'
  const backLabel = user?.role === 'admin' ? 'Back to Moderation Queue' : 'Back to the queue'

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

  const { data: nearbyIssuesData } = useIssues({ limit: '100' })
  const otherIssues = nearbyIssuesData?.data ?? []

  // Clustered duplicate detection (within 100 meters of current incident)
  const nearbyClusteredIssues = useMemo(() => {
    if (!data?.representativeLocation) return []
    const curLoc = data.representativeLocation
    return otherIssues
      .filter((iss) => {
        if (iss.id === data.id) return false
        if (iss.primaryCategory !== data.primaryCategory) return false
        const dist = haversineMeters(curLoc, iss.representativeLocation)
        return dist <= 100
      })
      .map((iss) => ({
        ...iss,
        distanceMeters: Math.round(haversineMeters(curLoc, iss.representativeLocation)),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
  }, [data, otherIssues])

  const [deadlineRevision, setDeadlineRevision] = useState(0)
  const [customDaysInput, setCustomDaysInput] = useState('')
  const [deadlineSavedMsg, setDeadlineSavedMsg] = useState('')

  useEffect(() => {
    if (issueId) {
      const existing = getCustomDeadline(issueId)
      if (existing?.days) {
        setCustomDaysInput(String(existing.days))
      }
    }
  }, [issueId])

  const sla = useMemo(() => {
    return (data ? getSlaInfo(data) : null) || {
      isOverdue: false,
      isResolved: false,
      isDueSoon: false,
      isCustom: false,
      percentElapsed: 0,
      ageHours: 0,
      slaHours: 72,
      deadlineFormatted: '—',
      deadlineDate: null,
    }
  }, [data, deadlineRevision])

  const handleSetCustomDeadline = async (days) => {
    const numDays = Number(days)
    if (isNaN(numDays) || numDays <= 0) return
    saveCustomDeadline(issueId, numDays)
    setDeadlineRevision((c) => c + 1)
    setCustomDaysInput(String(numDays))
    setDeadlineSavedMsg(`Target deadline set to ${numDays} day${numDays === 1 ? '' : 's'}.`)
    setTimeout(() => setDeadlineSavedMsg(''), 4000)

    try {
      await addComment.mutateAsync({
        body: `[Operational Update] Resolution deadline adjusted by assigned authority officer to ${numDays} day${numDays === 1 ? '' : 's'}.`,
        visibility: 'internal',
      })
    } catch {
      // ignore
    }
  }

  const handleResetDeadline = async () => {
    clearCustomDeadline(issueId)
    setDeadlineRevision((c) => c + 1)
    setCustomDaysInput('')
    setDeadlineSavedMsg('Reset to standard municipal window.')
    setTimeout(() => setDeadlineSavedMsg(''), 4000)

    try {
      await addComment.mutateAsync({
        body: `[Operational Update] Resolution deadline reset to standard SLA window by authority officer.`,
        visibility: 'internal',
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (data) {
      setStatusDraft(data.status)
      setSeverityDraft(data.severity?.current ?? '')
      setOverrideActive(Boolean(data.severity?.overridden))
      if (data.severity?.reason) setSeverityReason(data.severity.reason)
    }
  }, [data])

  if (issue.isError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-6 border-status-critical/30 bg-status-critical/5">
          <p className="text-sm font-semibold text-status-critical" role="alert">
            Could not load this incident: {issue.error?.message || 'Incident not found or inaccessible.'}
          </p>
          <Link
            to={backLink}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
        </Card>
      </div>
    )
  }

  if (issue.isPending || issue.isLoading || !data) {
    return <SkeletonDetail />
  }

  const marker = data.representativeLocation
  const isAssignedToMe = Boolean(data.assignedTo && data.assignedTo === user?.id)
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
    if (!data.assignedTo && !sla.isSet) {
      setActionError('Please set an estimated resolution deadline below before assigning this incident to yourself.')
      const deadlineEl = document.getElementById('resolution-deadline-card')
      if (deadlineEl) {
        deadlineEl.scrollIntoView({ behavior: 'smooth' })
      }
      return
    }
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
              to={backLink}
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

        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRemoveModalOpen(true)}
              className="border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 text-xs font-semibold flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              <span>Remove Issue</span>
            </Button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface-panel px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-ink shadow-xs">
            <Clock className="h-3.5 w-3.5 text-ink-muted" />
            <span>{issueStatusLabel(data.status)}</span>
          </div>
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
                  center={marker?.lat && marker?.lng ? marker : center}
                  marker={marker?.lat && marker?.lng ? marker : undefined}
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
                    const mediaList = Array.isArray(report.media) ? report.media : []
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
                              <span
                                className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${sevTone(
                                  sev,
                                )}`}
                              >
                                {sev}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs italic leading-relaxed text-ink/90">
                            &ldquo;{report.description || '(Report description)'}&rdquo;
                          </p>
                          <div className="mt-3">
                            {mediaList.length > 1 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {mediaList.map((m, mIdx) => (
                                  <IssueReportPhoto key={m.id || mIdx} photo={m} />
                                ))}
                              </div>
                            ) : (
                              <IssueReportPhoto photo={mediaList[0]} />
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
                  <div className="col-span-full rounded-panel border border-dashed border-line bg-surface-muted/30 p-6 text-center text-xs text-ink-muted">
                    No individual citizen reports linked to this incident cluster yet.
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Authority Internal Notes */}
          <Card>
            <CardHeader
              title={
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                    Authority Internal Notes
                    {internalNotes.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                        {internalNotes.length}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-500" />
                    Authority & Admin Only
                  </span>
                </div>
              }
            />
            <CardBody>
              <div className="space-y-3">
                {internalNotes.length > 0 ? (
                  internalNotes.map((comment) => {
                    const isMe = comment.authorId === user?.id
                    const role = (isMe ? user?.role : comment.authorRole) || 'authority'
                    const isAdmin = role === 'admin'

                    const displayName = isMe
                      ? (user?.fullName ? `You (${user.fullName})` : 'You')
                      : (comment.authorName || (isAdmin ? 'Municipal Administrator' : 'Operations Officer'))

                    let initials = 'OP'
                    if (isMe) {
                      initials = user?.fullName
                        ? user.fullName
                            .split(' ')
                            .filter(Boolean)
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : (isAdmin ? 'AD' : 'YOU')
                    } else if (comment.authorName) {
                      initials = comment.authorName
                        .split(' ')
                        .filter(Boolean)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                    } else if (isAdmin) {
                      initials = 'AD'
                    }

                    return (
                      <div key={comment.id} className="flex items-start gap-2.5">
                        {isMe && user?.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover border border-line shrink-0"
                          />
                        ) : (
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-xs ${
                              isAdmin
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : isMe
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : 'bg-teal-100 text-teal-800 border border-teal-200'
                            }`}
                          >
                            {initials}
                          </div>
                        )}
                        <div
                          className={`flex-1 rounded-panel border p-3 ${
                            isAdmin
                              ? 'border-purple-100 bg-purple-50/50'
                              : isMe
                                ? 'border-primary/20 bg-primary/5'
                                : 'border-sky-100 bg-sky-50/60'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-ink">{displayName}</span>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  isAdmin
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-teal-100 text-teal-800 border border-teal-200'
                                }`}
                              >
                                {isAdmin ? 'Admin' : 'Authority'}
                              </span>
                            </div>
                            <span className="text-[11px] text-ink-muted">
                              {formatDateTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-ink whitespace-pre-wrap">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-panel border border-dashed border-line bg-surface-muted/30 p-5 text-center">
                    <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-ink">No Internal Notes Recorded</p>
                    <p className="mt-1 text-[11px] text-ink-muted max-w-md mx-auto">
                      Internal notes are private to Municipal Authority personnel and System Administrators. Add secure operational updates, crew dispatch status, or triage observations below.
                    </p>
                  </div>
                )}
              </div>

              <form onSubmit={postNote} className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add internal note (visible to Authority and Admin)..."
                  className="flex-1 rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary focus:outline-hidden"
                />
                <Button
                  type="submit"
                  loading={addComment.isPending}
                  disabled={!note.trim()}
                  className="bg-[#0e7490] hover:bg-[#085f76] text-white px-4 text-xs font-semibold shrink-0"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Post Note
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right Column (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          {/* Lifecycle Actions (Only for Field Authority role) */}
          {user?.role === 'authority' && (
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
                    disabled={!isAssignedToMe}
                    className={!isAssignedToMe ? 'opacity-60 cursor-not-allowed' : ''}
                  />
                  {!isAssignedToMe && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-amber-700 dark:text-amber-300 font-medium bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>Status update locked. Please click &ldquo;Assign to me&rdquo; below to take ownership.</span>
                    </p>
                  )}
                  {isAssignedToMe && statusDraft === 'duplicate' && (
                    <input
                      type="text"
                      required
                      value={duplicateOfIssueId}
                      onChange={(e) => setDuplicateOfIssueId(e.target.value)}
                      placeholder="Original Issue ID (UUID required)"
                      className="mt-2 block w-full rounded-panel border border-line px-3 py-2 text-xs focus:border-primary"
                    />
                  )}
                  {isAssignedToMe && REASON_REQUIRED.has(statusDraft) && (
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
                      variant={!sla.isSet && !data.assignedTo ? 'secondary' : 'primary'}
                      loading={setAssignment.isPending}
                      onClick={handleAssignToMe}
                      disabled={!sla.isSet && !data.assignedTo}
                      className="text-xs font-semibold shrink-0"
                    >
                      {data.assignedTo === user?.id ? 'Unassign me' : 'Assign to me'}
                    </Button>
                  </div>
                  {!sla.isSet && !data.assignedTo && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-amber-700 dark:text-amber-300 font-medium bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>Resolution deadline must be set below before assigning this incident to yourself.</span>
                    </p>
                  )}
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
                  disabled={
                    reasonNeeded ||
                    duplicateNeeded ||
                    severityNeedsReason ||
                    (!isAssignedToMe && statusDraft !== data.status) ||
                    (statusDraft === data.status && !severityChanged)
                  }
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

                {/* Removal Button for Authority */}
                <div className="pt-2 border-t border-line/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveModalOpen(true)}
                    className="w-full text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove Issue with Notes
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Resolution Deadline Card */}
          {sla && (
            <Card id="resolution-deadline-card" className="overflow-hidden">
              <CardHeader
                title={
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2 font-bold text-ink">
                      <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                      Resolution Deadline
                    </span>
                    <SlaBadge issue={data} />
                  </div>
                }
              />
              <CardBody className="space-y-3.5">
                {/* Visual Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-ink-muted">Deadline Progress</span>
                    <span
                      className={`font-bold ${
                        !sla.isSet
                          ? 'text-amber-700 dark:text-amber-400'
                          : sla.isOverdue
                          ? 'text-status-critical'
                          : 'text-primary'
                      }`}
                    >
                      {!sla.isSet
                        ? 'Pending Authority Schedule'
                        : `${sla.percentElapsed ?? 0}% (${Math.round(sla.ageHours || 0)}h / ${sla.slaHours || 72}h)`}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        !sla.isSet
                          ? 'bg-slate-300 dark:bg-slate-700'
                          : sla.isResolved
                          ? 'bg-emerald-500'
                          : sla.isOverdue
                          ? 'bg-rose-500'
                          : sla.isDueSoon
                          ? 'bg-amber-500'
                          : 'bg-primary'
                      }`}
                      style={{ width: `${!sla.isSet ? 0 : sla.percentElapsed ?? 0}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-line bg-surface-sunken/40 p-2.5">
                    <p className="text-[10px] uppercase font-bold text-ink-muted">Resolution Window</p>
                    <p className="mt-0.5 font-bold text-ink">
                      {sla.isSet
                        ? `${sla.customDays} Day${sla.customDays === 1 ? '' : 's'} (Officer Set)`
                        : 'Pending Authority'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-surface-sunken/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase font-bold text-ink-muted">Deadline Target</p>
                      {sla.isSet && (
                        <span className="text-[9px] font-extrabold uppercase text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.2 rounded border border-teal-200 dark:border-teal-800">
                          Officer Set
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-bold text-ink">
                      {sla.isSet ? sla.deadlineFormatted : 'Not Scheduled'}
                    </p>
                  </div>
                </div>

                {/* Authority-controlled Resolution Duration Setter */}
                {user?.role === 'authority' && (
                  <div className="rounded-xl border border-line bg-surface-panel p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Resolution Duration
                      </span>
                      {sla.isSet ? (
                        <span className="rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700 text-[10px] font-bold px-2 py-0.5">
                          {sla.customDays} Day{sla.customDays === 1 ? '' : 's'} Set
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-semibold px-2 py-0.5">
                          Awaiting Estimate
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 pt-0.5">
                      <p className="text-[11px] text-ink-muted leading-tight">
                        Select or enter the estimated days required to fix this issue (required to enable assignment):
                      </p>

                      {/* Quick Presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 2, 3, 5, 7, 14].map((d) => {
                          const isSelected = sla.isSet && sla.customDays === d
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleSetCustomDeadline(d)}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-[#0e7490] text-white shadow-xs'
                                  : 'bg-surface-sunken hover:bg-surface-muted text-ink border border-line'
                              }`}
                            >
                              {d} {d === 1 ? 'Day' : 'Days'}
                            </button>
                          )
                        })}
                      </div>

                      {/* Custom Days Input */}
                      <div className="flex items-center gap-2 pt-1 border-t border-line/60">
                        <input
                          type="number"
                          min="1"
                          max="60"
                          placeholder="Days"
                          value={customDaysInput}
                          onChange={(e) => setCustomDaysInput(e.target.value)}
                          className="w-20 rounded-panel border border-line bg-surface-panel px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-hidden"
                        />
                        <span className="text-xs text-ink-muted">days</span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSetCustomDeadline(Number(customDaysInput))}
                          disabled={!customDaysInput || Number(customDaysInput) <= 0}
                          className="text-xs font-semibold shrink-0"
                        >
                          Set Deadline
                        </Button>
                        {sla.isSet && (
                          <button
                            type="button"
                            onClick={handleResetDeadline}
                            className="text-[11px] font-semibold text-rose-600 hover:underline ml-auto cursor-pointer"
                          >
                            Clear Deadline
                          </button>
                        )}
                      </div>

                      {deadlineSavedMsg && (
                        <p className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg animate-fade-in">
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          {deadlineSavedMsg}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-line/70 bg-slate-50/50 p-2.5 text-[11px] text-ink-muted flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    {sla.isResolved
                      ? 'Issue successfully closed within municipal compliance window.'
                      : !sla.isSet
                      ? 'Awaiting authority officer to set the estimated resolution timeframe for field operations.'
                      : sla.isOverdue
                      ? 'Action overdue! Municipal escalation protocol is active for municipal dispatch.'
                      : `Target deadline set by field officer to ${sla.customDays} day${sla.customDays === 1 ? '' : 's'} (${sla.slaHours} hours total).`}
                  </span>
                </div>
              </CardBody>
            </Card>
          )}

          {/* AI Duplicate & Clustered Reports Card (Within 100m) */}
          <Card className="overflow-hidden">
            <CardHeader
              title={
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    AI Duplicate &amp; Cluster Detection
                  </span>
                  {nearbyClusteredIssues.length > 0 && (
                    <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      {nearbyClusteredIssues.length} within 100m
                    </span>
                  )}
                </div>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">Citizen Impact Count:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  {(data.corroborationCount || 0) + (data.reportCount || 1)} Affected Citizen Voices
                </span>
              </div>

              {nearbyClusteredIssues.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-800 font-medium">
                    ⚠️ {nearbyClusteredIssues.length} duplicate or co-located report{nearbyClusteredIssues.length > 1 ? 's' : ''} detected within 100 meters:
                  </p>
                  {nearbyClusteredIssues.map((cand) => (
                    <div
                      key={cand.id}
                      className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 text-xs flex items-center justify-between gap-3 hover:bg-amber-50 transition"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink">#UM-{shortId(cand.id)}</span>
                          <span className="rounded-full bg-amber-200/60 text-amber-900 px-1.5 py-0.2 text-[9px] font-bold">
                            {cand.distanceMeters}m away
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted truncate">
                          {cand.address || 'Address nearby'}
                        </p>
                        <p className="text-[10px] text-ink-faint">
                          {cand.corroborationCount || 1} confirmation{cand.corroborationCount === 1 ? '' : 's'} · Status: {cand.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          to={`/authority/queue/${cand.id}`}
                          className="rounded border border-line bg-surface-panel px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-surface-sunken"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setMergeWithId(cand.id)
                            setMergeOpen(true)
                          }}
                          className="rounded border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-200 cursor-pointer"
                        >
                          Merge
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line bg-surface-sunken/30 p-3.5 text-center text-xs text-ink-muted">
                  <p className="font-semibold text-ink">No Duplicate Clusters Detected</p>
                  <p className="text-[11px] mt-0.5">
                    No active reports of the same category exist within 100 meters.
                  </p>
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
                {(Array.isArray(statusEvents.data) ? statusEvents.data : (statusEvents.data?.data ?? [])).length > 0 ? (
                  (Array.isArray(statusEvents.data) ? statusEvents.data : (statusEvents.data?.data ?? [])).map((event, index) => (
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
                  <li className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="font-bold text-ink">Incident Registered</p>
                    <p className="text-ink-muted">
                      {formatDateTime(data.openedAt)} · Initial Intake & System Registration
                    </p>
                  </li>
                )}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
      {/* Merge Modal */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge Issue">
        <p className="text-xs text-ink-muted">
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
      </Dialog>

      {/* Split Modal */}
      <Dialog open={splitOpen} onClose={() => setSplitOpen(false)} title="Split Issue">
        <p className="text-xs text-ink-muted">
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
      </Dialog>

      {/* Moderate Modal */}
      <Dialog open={moderateOpen} onClose={() => setModerateOpen(false)} title="Moderate Issue">
        <p className="text-xs text-ink-muted">
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
      </Dialog>

      {removeModalOpen && data && (
        <RemoveWithNotesModal
          open={removeModalOpen}
          onClose={() => setRemoveModalOpen(false)}
          item={{
            id: data.id,
            type: 'issue',
            description: data.description || `Incident #${shortId(data.id)}`,
            category: categoryLabel(categories, data.primaryCategory),
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['issues'] })
            navigate(backLink)
          }}
        />
      )}
    </div>
  )
}
