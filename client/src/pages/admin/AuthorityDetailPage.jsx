import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  History,
  Layers,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useAuthorityProfile, useUpdateUser } from '../../hooks/admin'
import { useCategories } from '../../hooks/data'
import { formatDate, formatDateTime, shortId, timeAgo } from '../../lib/format'
import {
  exportOfficerAuditPdf,
  exportAuditLogCsv,
  formatActionTitle,
  getActorDisplayName,
} from '../../lib/pdfExport'
import { JURISDICTION_AREAS, getJurisdictionLabel } from '../../lib/zones'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'
import TabLoadingSkeleton from '../../components/ui/TabLoadingSkeleton'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

const STATUS_TONES = {
  active: 'resolved',
  verified: 'low',
  registered: 'processing',
  suspended: 'high',
  deprovisioned: 'neutral',
}

const STATUS_LABELS = {
  active: 'Active',
  verified: 'Verified',
  registered: 'Registered',
  suspended: 'Suspended',
  deprovisioned: 'Deprovisioned',
}

const ISSUE_STATUS_TONES = {
  open: 'high',
  acknowledged: 'medium',
  in_progress: 'processing',
  resolved: 'resolved',
  closed: 'neutral',
}

/**
 * Format audit actions into human-readable narratives, icons, and badge colors
 */
function getEventActionMeta(event) {
  const { action, before, after } = event

  switch (action) {
    case 'issue.status_changed': {
      const fromStatus = before?.status || 'unknown'
      const toStatus = after?.status || 'updated'
      return {
        label: 'Status Transition',
        badgeColor: 'border-sky-300 bg-sky-50 text-sky-700',
        Icon: RefreshCw,
        narrative: `Changed issue status from "${fromStatus.replace('_', ' ')}" to "${toStatus.replace('_', ' ')}"`,
      }
    }
    case 'issue.assignment_changed': {
      const hadAssignee = Boolean(before?.assignee_id)
      const hasAssignee = Boolean(after?.assignee_id)
      return {
        label: 'Incident Assignment',
        badgeColor: 'border-teal-300 bg-teal-50 text-teal-700',
        Icon: ClipboardList,
        narrative: hasAssignee
          ? `Assigned incident to response officer`
          : 'Returned incident to general dispatch pool',
      }
    }
    case 'issue.severity_changed': {
      const toSev = after?.severity || 'updated'
      return {
        label: 'Severity Priority Override',
        badgeColor: 'border-rose-300 bg-rose-50 text-rose-700',
        Icon: AlertTriangle,
        narrative: `Manual severity priority override applied: updated to "${toSev.toUpperCase()}"`,
      }
    }
    case 'identity.user_updated': {
      let details = []
      if (before && after) {
        if (before.assigned_area !== after.assigned_area) {
          details.push(`Jurisdiction: ${getJurisdictionLabel(after.assigned_area) || 'All'}`)
        }
        if (before.status !== after.status) {
          details.push(`Status: ${after.status}`)
        }
        if (JSON.stringify(before.category_scope) !== JSON.stringify(after.category_scope)) {
          details.push(`Category scope (${(after.category_scope || []).length} categories)`)
        }
        if (before.email !== after.email) {
          details.push(`Email updated`)
        }
        if (before.phone !== after.phone) {
          details.push(`Phone updated`)
        }
      }
      return {
        label: 'Account Config Updated',
        badgeColor: 'border-indigo-300 bg-indigo-50 text-indigo-700',
        Icon: ShieldCheck,
        narrative: details.length > 0 ? `Updated ${details.join(', ')}` : 'Administrator updated officer account configuration',
      }
    }
    case 'identity.provisioned': {
      return {
        label: 'Officer Provisioned',
        badgeColor: 'border-purple-300 bg-purple-50 text-purple-700',
        Icon: UserPlus,
        narrative: `Authority officer account provisioned by administrator`,
      }
    }
    case 'issue.comment_created': {
      return {
        label: 'Internal Dispatch Note',
        badgeColor: 'border-blue-300 bg-blue-50 text-blue-700',
        Icon: MessageSquare,
        narrative: after?.comment ? `Recorded dispatch note: "${after.comment}"` : 'Added dispatch note',
      }
    }
    case 'issue.split': {
      return {
        label: 'Incident Split',
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Split clustered incident reports into separate municipal tasks',
      }
    }
    case 'issue.merged': {
      return {
        label: 'Incident Merged',
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Merged duplicate reports into primary incident',
      }
    }
    default: {
      return {
        label: action.replace('.', ' ').replace('_', ' ').toUpperCase(),
        badgeColor: 'border-slate-300 bg-slate-50 text-slate-700',
        Icon: Activity,
        narrative: `Recorded operational action: ${action}`,
      }
    }
  }
}

const PARAM_KEY_LABELS = {
  name: 'Full Name',
  title: 'Title',
  status: 'Account Status',
  category_scope: 'Category Scope',
  categoryScope: 'Category Scope',
  assigned_area: 'Territorial Zone / Jurisdiction',
  assignedArea: 'Territorial Zone / Jurisdiction',
  assignee_id: 'Assigned Response Crew',
  assigneeId: 'Assigned Response Crew',
  severity: 'Severity Level',
  email: 'Official Email',
  phone: 'Contact Phone',
  require_two_factor: 'Two-Factor Authentication',
  requireTwoFactor: 'Two-Factor Authentication',
  priority: 'Priority Flag',
  comment: 'Directive Note',
  description: 'Incident Description',
  resolution_notes: 'Resolution Summary',
  resolutionNotes: 'Resolution Summary',
}

function formatParamValue(v) {
  if (v === null || v === undefined) return <span className="text-ink-muted italic">None</span>
  if (typeof v === 'boolean') {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold ${v ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
        {v ? 'Enabled' : 'Disabled'}
      </span>
    )
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-ink-muted italic">Empty list</span>
    return (
      <div className="flex flex-wrap gap-1">
        {v.map((item, idx) => (
          <span key={idx} className="bg-surface-sunken border border-line text-ink rounded px-1.5 py-0.5 text-2xs font-medium">
            {String(item).replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    )
  }
  if (typeof v === 'object') {
    return (
      <div className="space-y-0.5 text-2xs">
        {Object.entries(v).map(([k, val]) => (
          <div key={k} className="flex gap-1.5">
            <span className="font-semibold text-ink-muted">{k}:</span>
            <span className="text-ink">{String(val)}</span>
          </div>
        ))}
      </div>
    )
  }
  return <span className="font-medium text-ink">{String(v).replace(/_/g, ' ')}</span>
}

/**
 * Human-readable inspector for individual audit events (replaces raw JSON).
 */
function OfficerInspectModalContent({ event, onClose }) {
  if (!event) return null

  const meta = getEventActionMeta(event)
  const ActionIcon = meta.Icon || Activity
  const actorDisplayName = getActorDisplayName(event)
  const isActorAdmin = event.actorRole === 'admin' || (event.actorEmail || '').includes('admin')

  const beforeObj = event.before && typeof event.before === 'object' ? event.before : null
  const afterObj = event.after && typeof event.after === 'object' ? event.after : null

  const diffRows = useMemo(() => {
    if (!beforeObj && !afterObj) return []
    if (beforeObj && afterObj) {
      const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]))
      const nonIdKeys = allKeys.filter(
        (k) => !['id', '_id', 'uuid', 'pk', 'created_at', 'updated_at', 'at'].includes(k)
      )
      const keysToCheck = nonIdKeys.length > 0 ? nonIdKeys : allKeys
      return keysToCheck
        .filter((k) => JSON.stringify(beforeObj[k]) !== JSON.stringify(afterObj[k]))
        .map((k) => ({
          key: k,
          label: PARAM_KEY_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          before: beforeObj[k],
          after: afterObj[k],
        }))
    }
    return []
  }, [beforeObj, afterObj])

  const reason =
    event.metadata?.reason ||
    event.after?.reason ||
    event.before?.reason ||
    (event.action === 'issue.comment_created' ? event.after?.comment : null) ||
    event.metadata?.comment

  return (
    <div className="space-y-4 text-xs">
      {/* 1. Header Overview Card */}
      <div className="rounded-xl border border-line bg-surface-sunken/40 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.badgeColor}`}>
              <ActionIcon className="h-3.5 w-3.5" />
              <span>{meta.label}</span>
            </span>
            <span className="text-2xs font-mono text-ink-muted">#{shortId(event.id)}</span>
          </div>
          <span className="text-2xs text-ink-muted">
            {formatDateTime(event.at)} ({timeAgo(event.at)})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted block mb-0.5">
              Operating Officer / Actor
            </span>
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold ${isActorAdmin ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'}`}>
                {actorDisplayName.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-ink leading-none">{actorDisplayName}</p>
                <p className="text-2xs text-ink-muted mt-0.5">{event.actorEmail || 'System Officer'} &bull; <span className="uppercase font-semibold">{event.actorRole || 'System'}</span></p>
              </div>
            </div>
          </div>

          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted block mb-0.5">
              Target Entity Record
            </span>
            <div>
              <p className="font-bold text-ink uppercase tracking-wide text-2xs">{event.targetType || 'User Record'}</p>
              <p className="font-mono text-xs font-semibold text-primary mt-0.5">
                {event.targetType === 'issue' ? (
                  <Link to={`/admin/queue/${event.targetId}`} className="hover:underline">
                    #UM-{shortId(event.targetId)}
                  </Link>
                ) : event.targetType === 'user' ? (
                  <Link to={`/admin/authorities/${event.targetId}`} className="hover:underline">
                    #USR-{shortId(event.targetId)}
                  </Link>
                ) : (
                  `#${shortId(event.targetId)}`
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Structured Normal Text Diff Display */}
      {diffRows.length > 0 ? (
        <div className="rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="bg-surface-sunken px-4 py-2 border-b border-line flex items-center justify-between">
            <span className="font-bold text-xs text-ink">Decision &amp; State Modifications</span>
            <span className="text-2xs text-ink-muted">{diffRows.length} field{diffRows.length === 1 ? '' : 's'} updated</span>
          </div>
          <div className="divide-y divide-line bg-surface-panel">
            {diffRows.map((row) => (
              <div key={row.key} className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-start">
                <span className="font-semibold text-ink text-xs">{row.label}</span>
                <div className="rounded-lg bg-surface-sunken/60 p-2 border border-line/60">
                  <span className="text-3xs uppercase tracking-wider font-bold text-ink-muted block mb-1">
                    Previous State
                  </span>
                  <div className="line-through text-slate-500 text-xs">
                    {formatParamValue(row.before)}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50/70 p-2 border border-emerald-200/70">
                  <span className="text-3xs uppercase tracking-wider font-bold text-emerald-800 block mb-1">
                    Updated State
                  </span>
                  <div className="text-xs">
                    {formatParamValue(row.after)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : afterObj ? (
        <div className="rounded-xl border border-line overflow-hidden shadow-xs">
          <div className="bg-surface-sunken px-4 py-2 border-b border-line font-bold text-xs text-ink">
            Provisioned Entity Parameters
          </div>
          <div className="p-3 bg-surface-panel divide-y divide-line">
            {Object.entries(afterObj).map(([k, val]) => {
              if (['id', '_id', 'uuid', 'pk'].includes(k)) return null
              return (
                <div key={k} className="py-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-muted">{PARAM_KEY_LABELS[k] || k.replace(/_/g, ' ')}:</span>
                  <span className="font-medium text-ink">{formatParamValue(val)}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface-panel p-4 text-xs text-ink">
          <p className="font-medium">{meta.narrative}</p>
        </div>
      )}

      {/* 3. Reason Callout */}
      {reason && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs space-y-1">
          <span className="font-bold text-sky-900 block">Audit Reason &amp; Operational Directive</span>
          <p className="italic text-ink/90 leading-relaxed">&ldquo;{reason}&rdquo;</p>
        </div>
      )}

      {/* 4. Subtle Collapsible Technical Details (Hidden by default) */}
      <details className="group rounded-lg border border-line bg-surface-sunken/30 text-2xs">
        <summary className="px-3 py-2 font-semibold text-ink-muted cursor-pointer hover:text-ink select-none flex items-center justify-between">
          <span>Technical JSON Payload (For Auditors &amp; Developers)</span>
          <span className="text-3xs text-ink-muted">Click to toggle</span>
        </summary>
        <div className="p-3 border-t border-line space-y-2">
          {event.before && (
            <div>
              <span className="font-bold text-ink">Raw State Before:</span>
              <pre className="rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto font-mono text-3xs mt-1">
                {JSON.stringify(event.before, null, 2)}
              </pre>
            </div>
          )}
          {event.after && (
            <div>
              <span className="font-bold text-ink">Raw State After:</span>
              <pre className="rounded bg-slate-900 text-emerald-300 p-2 overflow-x-auto font-mono text-3xs mt-1">
                {JSON.stringify(event.after, null, 2)}
              </pre>
            </div>
          )}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <span className="font-bold text-ink">Context Metadata:</span>
              <pre className="rounded bg-slate-900 text-slate-200 p-2 overflow-x-auto font-mono text-3xs mt-1">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </details>

      {/* 5. Footer */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-2xs text-ink-muted flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Cryptographically recorded in immutable audit ledger
        </span>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

export default function AuthorityDetailPage() {
  const { authorityId } = useParams()
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const { data, isLoading, isError, error, refetch, isFetching } = useAuthorityProfile(authorityId)

  const authority = data?.user
  const performance = data?.performance ?? {
    totalAssigned: 0,
    totalResolved: 0,
    totalInProgress: 0,
    totalAcknowledged: 0,
    resolutionRate: 0.0,
    assignedIssues: [],
  }
  const activityLog = data?.activityLog ?? []

  const update = useUpdateUser(authorityId)

  const [activeTab, setActiveTab] = useState('issues') // 'issues' | 'activity' | 'settings'
  const [isTabLoading, setIsTabLoading] = useState(false)
  const tabTimerRef = useRef(null)

  const TAB_LABELS = {
    issues: 'Assigned Reports & Issues',
    activity: 'Activity Log & Audit Trail',
    settings: 'Account Settings & Scope',
  }

  useEffect(() => {
    return () => {
      if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    }
  }, [])

  const handleTabChange = (tabId) => {
    if (tabId === activeTab && !isTabLoading) return
    setActiveTab(tabId)
    setIsTabLoading(true)
    if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    tabTimerRef.current = setTimeout(() => {
      setIsTabLoading(false)
    }, 500)
  }
  const [issueStatusFilter, setIssueStatusFilter] = useState('all')
  const [issueSearch, setIssueSearch] = useState('')
  const [activitySearch, setActivitySearch] = useState('')
  const [inspectEvent, setInspectEvent] = useState(null)

  const [statusDraft, setStatusDraft] = useState('')
  const [scopeDraft, setScopeDraft] = useState([])
  const [areaDraft, setAreaDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [confirmStatus, setConfirmStatus] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (authority) {
      setStatusDraft(authority.status || 'active')
      setScopeDraft(authority.categoryScope ?? [])
      setAreaDraft(authority.assignedArea ?? '')
      setEmailDraft(authority.email ?? '')
      setPhoneDraft(authority.phone ?? '')
    }
  }, [authority])

  // Filter assigned issues
  const filteredIssues = useMemo(() => {
    let list = performance.assignedIssues || []
    if (issueStatusFilter !== 'all') {
      if (issueStatusFilter === 'resolved') {
        list = list.filter((i) => i.status === 'resolved' || i.status === 'closed')
      } else {
        list = list.filter((i) => i.status === issueStatusFilter)
      }
    }
    if (issueSearch.trim()) {
      const q = issueSearch.toLowerCase()
      list = list.filter(
        (i) =>
          i.shortId?.toLowerCase().includes(q) ||
          i.id?.toLowerCase().includes(q) ||
          i.categoryName?.toLowerCase().includes(q) ||
          i.status?.toLowerCase().includes(q) ||
          i.severity?.toLowerCase().includes(q)
      )
    }
    return list
  }, [performance.assignedIssues, issueStatusFilter, issueSearch])

  // Filter activity log
  const filteredActivityLog = useMemo(() => {
    let list = activityLog || []
    if (activitySearch.trim()) {
      const q = activitySearch.toLowerCase()
      list = list.filter((e) => {
        const meta = getEventActionMeta(e)
        return (
          e.action?.toLowerCase().includes(q) ||
          e.actorName?.toLowerCase().includes(q) ||
          e.actorEmail?.toLowerCase().includes(q) ||
          meta.narrative?.toLowerCase().includes(q) ||
          meta.label?.toLowerCase().includes(q) ||
          e.targetId?.toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [activityLog, activitySearch])

  if (isLoading) return <Spinner className="justify-center py-16" label="Loading authority profile & audit trail…" />
  if (isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-status-critical" role="alert">{error?.message || 'Failed to load officer details'}</p>
        <Link to="/admin/authorities" className="mt-3 inline-block text-sm text-primary hover:underline">
          &larr; Back to Authorities List
        </Link>
      </Card>
    )
  }
  if (!authority) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ink-muted">Authority officer not found or could not be loaded.</p>
        <Link to="/admin/authorities" className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to authorities
        </Link>
      </Card>
    )
  }

  const applyScope = async () => {
    setSaveError(null)
    setSaved(false)
    try {
      await update.mutateAsync({ categoryScope: scopeDraft })
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const applyArea = async () => {
    setSaveError(null)
    setSaved(false)
    try {
      await update.mutateAsync({ assignedArea: areaDraft })
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const applyContact = async (e) => {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)
    try {
      const payload = {}
      if (emailDraft && emailDraft !== authority.email) payload.email = emailDraft
      if (phoneDraft !== (authority.phone ?? '')) payload.phone = phoneDraft
      if (Object.keys(payload).length > 0) {
        await update.mutateAsync(payload)
        setSaved(true)
      }
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const applyPassword = async (e) => {
    e.preventDefault()
    setSaveError(null)
    setPasswordMsg(null)
    if (!newPassword) return
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    try {
      await update.mutateAsync({ password: newPassword })
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' })
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err.message })
    }
  }

  const confirmStatusChange = async () => {
    setSaveError(null)
    setSaved(false)
    setConfirmStatus(null)
    try {
      await update.mutateAsync({ status: statusDraft })
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const toggleScope = (slug) => {
    setScopeDraft((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/admin/authorities"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-primary transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Authorities</span>
            </Link>
            <span className="text-line">/</span>
            <span className="text-xs font-medium text-ink-muted">Profile &amp; Audit</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-panel bg-primary-soft text-primary font-bold text-sm">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-ink">{authority.email}</h1>
                <StatusBadge
                  tone={STATUS_TONES[authority.status] ?? 'neutral'}
                  label={STATUS_LABELS[authority.status] ?? authority.status}
                />
              </div>
              <p className="text-xs text-ink-muted flex items-center gap-2 mt-0.5">
                <span>Jurisdiction: <strong className="text-ink">{getJurisdictionLabel(authority.assignedArea)}</strong></span>
                <span>&bull;</span>
                <span>Officer ID: <code className="bg-surface-sunken px-1 rounded text-2xs">{shortId(authority.id)}</code></span>
                {authority.phone && (
                  <>
                    <span>&bull;</span>
                    <span>Tel: <strong className="text-ink">{authority.phone}</strong></span>
                  </>
                )}
                <span>&bull;</span>
                <span>Joined: {formatDate(authority.dateJoined)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
            className="inline-flex items-center gap-1.5"
            title="Refresh profile & audit stats"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <Link
            to="/admin/authorities"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline px-2 py-1"
          >
            <span>All Officers</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Performance Summary Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Assigned */}
        <Card className="border-l-4 border-l-primary p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Total Assigned
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-panel bg-primary-soft text-primary">
              <ClipboardList className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-ink">
              {performance.totalAssigned}
            </span>
            <span className="text-xs text-ink-muted">reports</span>
          </div>
          <p className="mt-1 text-2xs text-ink-muted">
            {performance.totalInProgress + performance.totalAcknowledged} active in field
          </p>
        </Card>

        {/* KPI 2: Total Solved / Resolved */}
        <Card className="border-l-4 border-l-status-resolved p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Solved / Resolved
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-panel bg-emerald-50 text-status-resolved">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-status-resolved">
              {performance.totalResolved}
            </span>
            <span className="text-xs text-ink-muted">closed / resolved</span>
          </div>
          <p className="mt-1 text-2xs text-ink-muted">
            Successfully completed fieldwork
          </p>
        </Card>

        {/* KPI 3: In Progress & Acknowledged */}
        <Card className="border-l-4 border-l-amber-500 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              In Progress &amp; Field
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-panel bg-amber-50 text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600">
              {performance.totalInProgress}
            </span>
            <span className="text-xs text-ink-muted">
              + {performance.totalAcknowledged} Ack
            </span>
          </div>
          <p className="mt-1 text-2xs text-ink-muted">
            Currently under ongoing mitigation
          </p>
        </Card>

        {/* KPI 4: Resolution Success Rate */}
        <Card className="border-l-4 border-l-indigo-500 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Resolution Rate
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-panel bg-indigo-50 text-indigo-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-indigo-600">
              {performance.resolutionRate}%
            </span>
            <span className="text-xs text-ink-muted">success rate</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              style={{ width: `${Math.min(100, performance.resolutionRate)}%` }}
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            />
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center border-b border-line gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('issues')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition cursor-pointer ${
            activeTab === 'issues'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Assigned Reports &amp; Issues</span>
          <span
            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${
              activeTab === 'issues' ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-muted'
            }`}
          >
            {performance.assignedIssues?.length ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('activity')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition cursor-pointer ${
            activeTab === 'activity'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Activity Log &amp; Audit Trail</span>
          <span
            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${
              activeTab === 'activity' ? 'bg-primary text-white' : 'bg-surface-sunken text-ink-muted'
            }`}
          >
            {activityLog?.length ?? 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('settings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition cursor-pointer ${
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Account Settings &amp; Scope</span>
        </button>
      </div>

      {/* Tab Content Panels */}
      {isTabLoading ? (
        <TabLoadingSkeleton title={TAB_LABELS[activeTab] || 'Section'} />
      ) : (
        <>
          {/* TAB 1: Assigned Issues & Field Reports */}
          {activeTab === 'issues' && (
            <div className="space-y-4 animate-fade-in">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'all', label: 'All Assigned', count: performance.assignedIssues?.length ?? 0 },
                { key: 'in_progress', label: 'In Progress', count: performance.totalInProgress },
                { key: 'acknowledged', label: 'Acknowledged', count: performance.totalAcknowledged },
                { key: 'resolved', label: 'Resolved / Solved', count: performance.totalResolved },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setIssueStatusFilter(tab.key)}
                  className={`rounded-panel px-3 py-1.5 text-xs font-semibold transition ${
                    issueStatusFilter === tab.key
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-surface-panel border border-line text-ink-muted hover:text-ink hover:border-primary/40'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-faint" />
              <input
                type="text"
                placeholder="Search issues, category..."
                value={issueSearch}
                onChange={(e) => setIssueSearch(e.target.value)}
                className="w-full rounded-panel border border-line bg-surface-panel pl-8 pr-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <Card className="overflow-hidden border border-line shadow-xs">
            {filteredIssues.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={ClipboardList}
                  title={
                    issueSearch || issueStatusFilter !== 'all'
                      ? 'No matching assigned issues found'
                      : 'No issues currently assigned to this officer'
                  }
                  description={
                    issueSearch || issueStatusFilter !== 'all'
                      ? 'Try clearing the search query or status filter.'
                      : 'When field reports or municipal issues are assigned to this officer, they will appear here with full resolution details.'
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-surface-sunken text-ink-muted uppercase font-bold tracking-wider text-2xs">
                    <tr>
                      <th className="px-4 py-3">Issue ID</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Updated / Opened</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface-panel">
                    {filteredIssues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-slate-50/75 transition">
                        <td className="px-4 py-3.5">
                          <Link
                            to={`/admin/queue/${issue.id}`}
                            className="font-bold text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <span>#UM-{issue.shortId}</span>
                          </Link>
                          <p className="text-2xs text-ink-faint font-mono mt-0.5">
                            {issue.id.slice(0, 18)}...
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-ink">
                            {issue.categoryName || issue.category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            tone={issue.severity || 'medium'}
                            label={(issue.severity || 'medium').toUpperCase()}
                            pill
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            tone={ISSUE_STATUS_TONES[issue.status] ?? 'neutral'}
                            label={(issue.status || 'unknown').replace('_', ' ')}
                          />
                        </td>
                        <td className="px-4 py-3.5 text-ink-muted">
                          <span title={formatDateTime(issue.updatedAt || issue.openedAt)}>
                            {timeAgo(issue.updatedAt || issue.openedAt)}
                          </span>
                          <p className="text-2xs text-ink-faint">
                            Opened {formatDate(issue.openedAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link
                            to={`/admin/queue/${issue.id}`}
                            className="inline-flex items-center gap-1 rounded-panel border border-line px-2.5 py-1 text-xs font-semibold text-ink-muted transition hover:border-primary hover:text-primary hover:bg-primary-soft/30"
                          >
                            <span>View Details</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-muted bg-surface-sunken">
              <span>Showing {filteredIssues.length} of {performance.assignedIssues?.length ?? 0} assigned tasks</span>
              <span className="text-2xs">Data synchronized with municipal dispatcher</span>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: Activity Log & Audit Trail */}
      {activeTab === 'activity' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-ink-muted">
              Chronological immutable ledger of actions performed by or targeting this officer account.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-faint" />
                <input
                  type="text"
                  placeholder="Search audit actions, actors..."
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  className="w-full rounded-panel border border-line bg-surface-panel pl-8 pr-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  exportOfficerAuditPdf({
                    events: filteredActivityLog,
                    officer: authority,
                    user,
                  })
                }
                className="h-8 gap-1.5 text-xs font-semibold text-primary hover:bg-primary/5 flex items-center border-primary/30"
                title="Export this officer's activity log and audit history as PDF"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export as PDF</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportAuditLogCsv({
                    events: filteredActivityLog,
                    filename: `audit_officer_${(authority?.name || 'officer').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
                  })
                }
                className="h-8 text-xs text-ink-muted hover:text-ink hover:bg-surface-sunken"
                title="Export this officer's activity log as CSV"
              >
                <span>CSV</span>
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden border border-line shadow-xs">
            {filteredActivityLog.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={History}
                  title={activitySearch ? 'No matching audit events found' : 'No audit events recorded'}
                  description="When actions are performed by this officer or administrative adjustments are made, full immutable audit trails are recorded here."
                />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filteredActivityLog.map((event) => {
                  const meta = getEventActionMeta(event)
                  const ActionIcon = meta.Icon
                  return (
                    <div
                      key={event.id}
                      className="p-4 hover:bg-slate-50/75 transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-panel border ${meta.badgeColor}`}
                        >
                          <ActionIcon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded border px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${meta.badgeColor}`}
                            >
                              {meta.label}
                            </span>
                            <span className="text-xs font-semibold text-ink">
                              {meta.narrative}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            <span>
                              Actor: <strong className="text-ink">{event.actorName}</strong>{' '}
                              {event.actorEmail && `(${event.actorEmail})`}
                            </span>
                            <span>&bull;</span>
                            <span title={formatDateTime(event.at)}>
                              {timeAgo(event.at)} ({formatDateTime(event.at)})
                            </span>
                            {event.targetType && (
                              <>
                                <span>&bull;</span>
                                <span className="font-mono text-2xs bg-surface-sunken px-1 rounded">
                                  {event.targetType}:{shortId(event.targetId)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectEvent(event)}
                          className="text-xs inline-flex items-center gap-1 hover:border-line border border-transparent"
                        >
                          <Eye className="h-3.5 w-3.5 text-ink-muted" />
                          <span>Inspect Diff</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="border-t border-line px-4 py-2.5 text-xs text-ink-muted bg-surface-sunken flex items-center justify-between">
              <span>Showing {filteredActivityLog.length} of {activityLog.length} events</span>
              <span className="text-2xs font-mono">Immutable Hash Verified</span>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: Account Settings & Scope */}
      {activeTab === 'settings' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Card 1: Account Status */}
            <Card>
              <CardHeader title="Account Status" subtitle="Suspend to freeze access, or activate operational officer credentials." />
              <CardBody>
                <select
                  aria-label="Account status"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-sm focus:border-primary"
                >
                  {!STATUS_OPTIONS.some((s) => s.value === statusDraft) && (
                    <option value={statusDraft} disabled>
                      {STATUS_LABELS[statusDraft] ?? statusDraft} (Current)
                    </option>
                  )}
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {statusDraft !== authority.status && (
                  <Button
                    className="mt-3 w-full"
                    variant={statusDraft === 'suspended' ? 'danger' : 'primary'}
                    onClick={() => setConfirmStatus(statusDraft)}
                  >
                    Apply status change
                  </Button>
                )}
                <p className="mt-3 text-xs text-ink-muted">
                  Officer profile created on {formatDate(authority.dateJoined)}
                </p>
              </CardBody>
            </Card>

            {/* Card: Contact Credentials */}
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                    Contact Credentials
                  </span>
                }
                subtitle="Update officer official email and phone number."
              />
              <CardBody>
                <form onSubmit={applyContact} className="space-y-3">
                  <Input
                    label="Official Email Address"
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    required
                  />
                  <Input
                    label="Phone Number"
                    type="tel"
                    placeholder="+8801700000000"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                  />
                  {(emailDraft !== (authority.email ?? '') || phoneDraft !== (authority.phone ?? '')) && (
                    <Button type="submit" className="w-full" loading={update.isPending}>
                      Save Contact Information
                    </Button>
                  )}
                </form>
              </CardBody>
            </Card>

            {/* Card 2: Assigned Jurisdiction Area */}
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                    Assigned Jurisdiction Area
                  </span>
                }
                subtitle="The municipal zone this officer operates within."
              />
              <CardBody>
                <Select
                  options={JURISDICTION_AREAS}
                  value={areaDraft}
                  onChange={(e) => setAreaDraft(e.target.value)}
                />
                {areaDraft !== (authority.assignedArea ?? '') && (
                  <Button className="mt-3 w-full" onClick={applyArea} loading={update.isPending}>
                    Save Jurisdiction
                  </Button>
                )}
                <p className="mt-3 text-xs text-ink-muted">
                  The officer’s incident work queue and live map are automatically filtered to this territory.
                </p>
              </CardBody>
            </Card>

            {/* Card 3: Category Scope */}
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    Category scope (BR-26)
                  </span>
                }
                subtitle="An empty scope grants nothing until categories are assigned."
              />
              <CardBody>
                <div className="grid grid-cols-2 gap-2">
                  {(categories ?? [])
                    .filter((c) => c.active)
                    .map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded-panel border border-line px-3 py-2 text-sm hover:border-primary"
                      >
                        <input
                          type="checkbox"
                          checked={scopeDraft.includes(c.key)}
                          onChange={() => toggleScope(c.key)}
                          className="h-4 w-4 accent-primary"
                        />
                        {c.label.en}
                      </label>
                    ))}
                </div>
                {JSON.stringify(scopeDraft) !== JSON.stringify(authority.categoryScope) && (
                  <Button className="mt-3 w-full" onClick={applyScope} loading={update.isPending}>
                    Save Category Scope
                  </Button>
                )}
              </CardBody>
            </Card>

            {/* Card 4: Change Password */}
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
                    Set New Login Password
                  </span>
                }
                subtitle="Update or reset password credentials for this officer."
              />
              <CardBody>
                <form onSubmit={applyPassword} className="space-y-3">
                  <Input
                    label="New Password"
                    type="password"
                    placeholder="Min 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {passwordMsg && (
                    <p
                      className={`text-xs ${
                        passwordMsg.type === 'error' ? 'text-status-critical' : 'text-status-resolved'
                      }`}
                      role="alert"
                    >
                      {passwordMsg.text}
                    </p>
                  )}
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={!newPassword || update.isPending}
                    loading={update.isPending}
                  >
                    Update Password
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>

          {saveError && (
            <Card className="p-4 border-status-critical/40">
              <p className="text-sm text-status-critical" role="alert">{saveError}</p>
            </Card>
          )}
          {saved && (
            <Card className="p-4 border-status-resolved/40">
              <p className="text-sm text-status-resolved" role="status">
                Changes saved successfully and committed to the immutable audit trail.
              </p>
            </Card>
          )}
        </div>
      )}
        </>
      )}

      {/* Status Confirmation Modal */}
      <Dialog
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        title="Confirm Status Change"
      >
        <p className="text-sm text-ink-muted">
          Set this authority to{' '}
          <strong>{STATUS_LABELS[confirmStatus] ?? confirmStatus}</strong>?{' '}
          {confirmStatus === 'suspended'
            ? 'The account keeps its assigned area and scope but cannot log in or act until reactivated.'
            : confirmStatus === 'active'
              ? 'The officer will immediately regain full operational access.'
              : ''}{' '}
          This change is recorded in the audit log.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmStatus(null)}>Cancel</Button>
          <Button
            variant={confirmStatus === 'active' ? 'primary' : 'danger'}
            loading={update.isPending}
            onClick={confirmStatusChange}
          >
            Confirm
          </Button>
        </div>
      </Dialog>

      {/* Inspect Diff Modal */}
      <Dialog
        open={Boolean(inspectEvent)}
        onClose={() => setInspectEvent(null)}
        title={inspectEvent ? `Audit Record: ${formatActionTitle(inspectEvent.action)}` : 'Audit Record'}
        className="max-w-2xl"
      >
        <OfficerInspectModalContent event={inspectEvent} onClose={() => setInspectEvent(null)} />
      </Dialog>
    </div>
  )
}
