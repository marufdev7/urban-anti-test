import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Layers,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuditEvents } from '../../hooks/admin'
import { useAuth } from '../../auth/AuthContext'
import { formatDateTime, shortId, timeAgo } from '../../lib/format'
import {
  exportAuditLogPdf,
  exportAuditLogCsv,
  getActorDisplayName,
  formatActionTitle,
  formatAuditChangeDetails,
} from '../../lib/pdfExport'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards, SkeletonRows } from '../../components/ui/Skeleton'

/**
 * Format human-readable narrative and badge styling for each audit action
 */
function getActionMeta(action, before, after, metadata) {
  const title = formatActionTitle(action)
  switch (action) {
    case 'issue.status_changed': {
      const fromStatus = before?.status || 'unknown'
      const toStatus = after?.status || 'updated'
      return {
        label: title,
        badgeColor: 'border-sky-300 bg-sky-50 text-sky-700',
        Icon: RefreshCw,
        narrative: `Changed status from "${fromStatus.replace('_', ' ')}" to "${toStatus.replace('_', ' ')}"`,
        hasDiff: true,
        diffBefore: fromStatus,
        diffAfter: toStatus,
      }
    }
    case 'issue.assignment_changed': {
      const hadAssignee = Boolean(before?.assignee_id)
      const hasAssignee = Boolean(after?.assignee_id)
      return {
        label: title,
        badgeColor: 'border-teal-300 bg-teal-50 text-teal-700',
        Icon: Users,
        narrative: hasAssignee
          ? `Assigned response crew (Unit #${shortId(after.assignee_id)}) to incident`
          : 'Removed unit assignment; returned to general dispatch pool',
        hasDiff: true,
        diffBefore: hadAssignee ? `Unit #${shortId(before.assignee_id)}` : 'Unassigned',
        diffAfter: hasAssignee ? `Unit #${shortId(after.assignee_id)}` : 'Unassigned',
      }
    }
    case 'issue.severity_changed':
    case 'issue.severity_overridden': {
      const toSev = after?.severity || 'overridden'
      return {
        label: title,
        badgeColor: 'border-rose-300 bg-rose-50 text-rose-700',
        Icon: AlertTriangle,
        narrative: `Manual severity override applied: escalated to "${toSev.toUpperCase()}" priority`,
        hasDiff: true,
        diffBefore: before?.severity || 'unrated',
        diffAfter: toSev,
      }
    }
    case 'moderation.hide': {
      return {
        label: title,
        badgeColor: 'border-amber-300 bg-amber-50 text-amber-800',
        Icon: EyeOff,
        narrative: 'Hidden from public feed and municipal dashboard (Policy Enforcement)',
        hasDiff: false,
      }
    }
    case 'moderation.remove': {
      return {
        label: title,
        badgeColor: 'border-rose-300 bg-rose-50 text-rose-700',
        Icon: Trash2,
        narrative: 'Soft-deleted or permanently removed from municipal active record',
        hasDiff: false,
      }
    }
    case 'identity.provisioned':
    case 'authority.provisioned': {
      const email = after?.email || 'New Authority'
      return {
        label: title,
        badgeColor: 'border-purple-300 bg-purple-50 text-purple-700',
        Icon: UserPlus,
        narrative: `Provisioned new Authority official account for ${email}`,
        hasDiff: false,
      }
    }
    case 'identity.updated':
    case 'identity.user_updated':
    case 'authority.scope_changed': {
      return {
        label: title,
        badgeColor: 'border-indigo-300 bg-indigo-50 text-indigo-700',
        Icon: ShieldCheck,
        narrative: 'Updated municipal personnel credentials, category jurisdiction, and system access scope',
        hasDiff: Boolean(before && after),
        diffBefore: before?.category_scope ? before.category_scope.join(', ') : null,
        diffAfter: after?.category_scope ? after.category_scope.join(', ') : null,
      }
    }
    case 'reference.city_boundary_replaced': {
      return {
        label: title,
        badgeColor: 'border-blue-300 bg-blue-50 text-blue-700',
        Icon: Layers,
        narrative: 'Updated municipal GIS jurisdiction boundary geometry and reference data',
        hasDiff: Boolean(before && after),
      }
    }
    case 'issue.comment_created': {
      return {
        label: title,
        badgeColor: 'border-blue-300 bg-blue-50 text-blue-700',
        Icon: MessageSquare,
        narrative: after?.comment ? `Recorded dispatch directive: "${after.comment}"` : 'Added secure operational note',
        hasDiff: false,
      }
    }
    case 'issue.split': {
      return {
        label: title,
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Split clustered reports into separate distinct municipal incidents',
        hasDiff: false,
      }
    }
    case 'issue.merged': {
      return {
        label: title,
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Merged duplicate municipal reports into primary surviving incident',
        hasDiff: false,
      }
    }
    default: {
      return {
        label: title,
        badgeColor: 'border-slate-300 bg-slate-50 text-slate-700',
        Icon: Activity,
        narrative: `Municipal activity recorded: ${title}`,
        hasDiff: Boolean(before && after),
      }
    }
  }
}

/**
 * Human-readable Inspect Modal Content.
 * Replaces developer JSON dumps with clear, formatted before-and-after change tables.
 */
function InspectModalContent({ event, onClose }) {
  if (!event) return null
  const meta = getActionMeta(event.action, event.before, event.after, event.metadata)
  const ActionIcon = meta.Icon
  const actorName = getActorDisplayName(event)
  const isActorAdmin = event.actorRole === 'admin'
  const isIssue = event.targetType === 'issue'
  const isUser = event.targetType === 'user'
  const reason =
    event.metadata?.reason ||
    event.after?.reason ||
    (event.action === 'issue.comment_created' ? event.after?.comment : null) ||
    event.metadata?.comment

  const beforeObj = event.before && typeof event.before === 'object' ? event.before : null
  const afterObj = event.after && typeof event.after === 'object' ? event.after : null

  // Extract all modified properties
  const diffRows = []
  const keyLabels = {
    name: 'Boundary / Entity Name',
    title: 'Incident Title',
    status: 'Operational Status',
    category_scope: 'Department Category Scope',
    categoryScope: 'Department Category Scope',
    assigned_area: 'Territorial Zone Jurisdiction',
    assignedArea: 'Territorial Zone Jurisdiction',
    assignee_id: 'Assigned Response Crew',
    assigneeId: 'Assigned Response Crew',
    severity: 'Severity Level',
    email: 'Official Email',
    phone: 'Phone Number',
    require_two_factor: 'Two-Factor Authentication (2FA)',
    requireTwoFactor: 'Two-Factor Authentication (2FA)',
    priority: 'Priority Tier',
    comment: 'Dispatch Directive',
  }

  const formatValue = (v) => {
    if (v === null || v === undefined) return <span className="text-ink-muted italic">None</span>
    if (Array.isArray(v)) {
      if (v.length === 0) return <span className="text-ink-muted italic">None</span>
      return (
        <div className="flex flex-wrap gap-1">
          {v.map((item, idx) => (
            <span key={idx} className="rounded bg-surface-sunken px-1.5 py-0.5 text-2xs font-semibold text-ink border border-line">
              {String(item).replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )
    }
    if (typeof v === 'boolean') {
      return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-bold ${v ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
          {v ? 'Enabled' : 'Disabled'}
        </span>
      )
    }
    if (typeof v === 'object') {
      return <span>{Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ')}</span>
    }
    return <span className="font-semibold text-ink">{String(v).replace(/_/g, ' ')}</span>
  }

  if (beforeObj && afterObj) {
    const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]))
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'at'].includes(key) && allKeys.length > 2) {
        continue
      }
      const bVal = beforeObj[key]
      const aVal = afterObj[key]
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        diffRows.push({
          key,
          label: keyLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          before: bVal,
          after: aVal,
        })
      }
    }
  }

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
                {actorName.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-ink leading-none">{actorName}</p>
                <p className="text-2xs text-ink-muted mt-0.5">{event.actorEmail || 'System Officer'} · <span className="uppercase font-semibold">{event.actorRole || 'System'}</span></p>
              </div>
            </div>
          </div>

          <div>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-muted block mb-0.5">
              Target Entity Record
            </span>
            <div>
              <p className="font-bold text-ink uppercase tracking-wide text-2xs">{event.targetType}</p>
              <p className="font-mono text-xs font-semibold text-primary mt-0.5">
                {isIssue ? (
                  <Link to={`/admin/queue/${event.targetId}`} className="hover:underline">
                    #UM-{shortId(event.targetId)}
                  </Link>
                ) : isUser ? (
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
                    {formatValue(row.before)}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50/70 p-2 border border-emerald-200/70">
                  <span className="text-3xs uppercase tracking-wider font-bold text-emerald-800 block mb-1">
                    Updated State
                  </span>
                  <div className="text-xs">
                    {formatValue(row.after)}
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
            {Object.entries(afterObj).map(([k, val]) => (
              <div key={k} className="py-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-muted">{keyLabels[k] || k.replace(/_/g, ' ')}:</span>
                <span className="font-medium text-ink">{formatValue(val)}</span>
              </div>
            ))}
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
        </div>
      </details>

      {/* 5. Footer */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-2xs text-ink-muted flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Cryptographically recorded in immutable PostgreSQL trigger ledger
        </span>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

/**
 * Dedicated Export Dialog supporting custom date ranges for PDF and CSV.
 */
function ExportAuditModal({ open, onClose, events, allEvents, user }) {
  const [dateScope, setDateScope] = useState('current')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const exportList = useMemo(() => {
    if (dateScope === 'current') return events
    if (dateScope === 'all') return allEvents
    if (dateScope === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10)
      return allEvents.filter((e) => e.at && e.at.startsWith(todayStr))
    }
    if (dateScope === '7d') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      return allEvents.filter((e) => e.at && new Date(e.at).getTime() >= sevenDaysAgo)
    }
    if (dateScope === 'custom') {
      return allEvents.filter((e) => {
        if (startDate) {
          const fromTime = new Date(`${startDate}T00:00:00`).getTime()
          if (!e.at || new Date(e.at).getTime() < fromTime) return false
        }
        if (endDate) {
          const toTime = new Date(`${endDate}T23:59:59`).getTime()
          if (!e.at || new Date(e.at).getTime() > toTime) return false
        }
        return true
      })
    }
    return events
  }, [dateScope, startDate, endDate, events, allEvents])

  const dateRangeLabel = useMemo(() => {
    if (dateScope === 'current') return 'Current Table Filters'
    if (dateScope === 'all') return 'All Historical Logs'
    if (dateScope === 'today') return 'Today'
    if (dateScope === '7d') return 'Last 7 Days'
    if (dateScope === 'custom') {
      return `${startDate || 'Earliest'} to ${endDate || 'Latest'}`
    }
    return 'Official Log'
  }, [dateScope, startDate, endDate])

  const handleDownloadPdf = () => {
    exportAuditLogPdf({
      events: exportList,
      user,
      dateRangeText: dateRangeLabel,
      filename: `urbanmend_audit_${dateScope}_${new Date().toISOString().slice(0, 10)}.pdf`,
    })
    onClose()
  }

  const handleDownloadCsv = () => {
    exportAuditLogCsv({
      events: exportList,
      filename: `urbanmend_audit_${dateScope}_${new Date().toISOString().slice(0, 10)}.csv`,
    })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Export Audit Log Records" className="max-w-md">
      <div className="space-y-4 text-xs">
        <p className="text-ink-muted">
          Select date criteria to download an immutable audit record in PDF or CSV format.
        </p>

        <div className="space-y-2 rounded-xl border border-line bg-surface-sunken/40 p-3.5">
          <span className="font-semibold text-ink block mb-1.5">Date Period Scope</span>
          
          <label className="flex items-center gap-2 text-ink cursor-pointer">
            <input
              type="radio"
              name="dateScope"
              value="current"
              checked={dateScope === 'current'}
              onChange={() => setDateScope('current')}
              className="text-primary focus:ring-primary"
            />
            <span>Current Table Selection ({events.length} records)</span>
          </label>

          <label className="flex items-center gap-2 text-ink cursor-pointer">
            <input
              type="radio"
              name="dateScope"
              value="all"
              checked={dateScope === 'all'}
              onChange={() => setDateScope('all')}
              className="text-primary focus:ring-primary"
            />
            <span>All Historical Records ({allEvents.length} records)</span>
          </label>

          <label className="flex items-center gap-2 text-ink cursor-pointer">
            <input
              type="radio"
              name="dateScope"
              value="today"
              checked={dateScope === 'today'}
              onChange={() => setDateScope('today')}
              className="text-primary focus:ring-primary"
            />
            <span>Today Only</span>
          </label>

          <label className="flex items-center gap-2 text-ink cursor-pointer">
            <input
              type="radio"
              name="dateScope"
              value="7d"
              checked={dateScope === '7d'}
              onChange={() => setDateScope('7d')}
              className="text-primary focus:ring-primary"
            />
            <span>Past 7 Days</span>
          </label>

          <label className="flex items-center gap-2 text-ink cursor-pointer">
            <input
              type="radio"
              name="dateScope"
              value="custom"
              checked={dateScope === 'custom'}
              onChange={() => setDateScope('custom')}
              className="text-primary focus:ring-primary"
            />
            <span>Custom Date Range</span>
          </label>

          {dateScope === 'custom' && (
            <div className="pt-2 pl-6 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-2xs font-semibold text-ink-muted mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface-panel px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-2xs font-semibold text-ink-muted mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface-panel px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs flex items-center justify-between text-primary font-semibold">
          <span>Records ready to export:</span>
          <span className="text-sm font-bold">{exportList.length}</span>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadCsv}
            disabled={exportList.length === 0}
            className="flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5 text-teal-600" />
            <span>Download CSV</span>
          </Button>
          <Button
            variant="primary"
            onClick={handleDownloadPdf}
            disabled={exportList.length === 0}
            className="flex items-center gap-1.5"
          >
            <FileText className="h-3.5 w-3.5 text-white" />
            <span>Download PDF</span>
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Detailed, comprehensive Audit Log page (FRONT-PLAN §9.8 & API §6.10).
 * Displays complete actor identification ("ke korce"), full action details
 * and diffs ("kon action nice"), and total activity metrics.
 */
export default function AuditLogPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryTab, setCategoryTab] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [targetFilter, setTargetFilter] = useState('')
  const [datePreset, setDatePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [inspectEvent, setInspectEvent] = useState(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFeedback, setExportFeedback] = useState(null)

  // Fetch up to 100 recent audit events
  const { data, isLoading, isError, error, refetch, isFetching } = useAuditEvents({
    limit: '100',
  })

  const rawEvents = useMemo(() => data?.data ?? [], [data])

  // Total Activity Log Statistics
  const stats = useMemo(() => {
    const total = rawEvents.length
    const workflow = rawEvents.filter(
      (e) => e.action.startsWith('issue.status') || e.action.startsWith('issue.severity'),
    ).length
    const assignment = rawEvents.filter((e) => e.action.startsWith('issue.assignment')).length
    const moderation = rawEvents.filter((e) => e.action.startsWith('moderation')).length
    const identity = rawEvents.filter((e) => e.action.startsWith('identity')).length

    return { total, workflow, assignment, moderation, identity }
  }, [rawEvents])

  // Filtered Events based on search, category tab, role, target, and date
  const filteredEvents = useMemo(() => {
    return rawEvents.filter((e) => {
      // Category tab filter
      if (categoryTab === 'workflow') {
        if (!e.action.startsWith('issue.status') && !e.action.startsWith('issue.severity'))
          return false
      } else if (categoryTab === 'assignment') {
        if (!e.action.startsWith('issue.assignment')) return false
      } else if (categoryTab === 'moderation') {
        if (!e.action.startsWith('moderation')) return false
      } else if (categoryTab === 'identity') {
        if (!e.action.startsWith('identity')) return false
      }

      // Role filter
      if (roleFilter !== 'all' && e.actorRole !== roleFilter) return false

      // Target filter
      if (targetFilter && e.targetType !== targetFilter) return false

      // Date preset filter
      if (datePreset === 'today') {
        const todayStr = new Date().toISOString().slice(0, 10)
        if (!e.at || !e.at.startsWith(todayStr)) return false
      } else if (datePreset === '7d') {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        if (!e.at || new Date(e.at).getTime() < sevenDaysAgo) return false
      } else if (datePreset === 'custom') {
        if (customFrom) {
          const fromTime = new Date(`${customFrom}T00:00:00`).getTime()
          if (!e.at || new Date(e.at).getTime() < fromTime) return false
        }
        if (customTo) {
          const toTime = new Date(`${customTo}T23:59:59`).getTime()
          if (!e.at || new Date(e.at).getTime() > toTime) return false
        }
      }

      // Keyword search (searches actor name, email, action title, target id, reason)
      if (search.trim()) {
        const query = search.toLowerCase()
        const actorName = getActorDisplayName(e).toLowerCase()
        const matchName = (e.actorName || '').toLowerCase().includes(query) || actorName.includes(query)
        const matchEmail = (e.actorEmail || '').toLowerCase().includes(query)
        const matchAction = (e.action || '').toLowerCase().includes(query) || formatActionTitle(e.action).toLowerCase().includes(query)
        const matchTarget = (e.targetId || '').toLowerCase().includes(query)
        const matchReason = (e.metadata?.reason || e.after?.reason || '').toLowerCase().includes(query)
        if (!matchName && !matchEmail && !matchAction && !matchTarget && !matchReason) {
          return false
        }
      }

      return true
    })
  }, [rawEvents, categoryTab, roleFilter, targetFilter, datePreset, customFrom, customTo, search])

  // Quick export handlers
  const handleQuickExportPdf = () => {
    const dateRangeLabel =
      datePreset === 'custom' && (customFrom || customTo)
        ? `${customFrom || 'Start'} to ${customTo || 'Current'}`
        : datePreset === 'today'
        ? 'Today'
        : datePreset === '7d'
        ? 'Last 7 Days'
        : 'All Filtered'

    exportAuditLogPdf({
      events: filteredEvents,
      user,
      dateRangeText: dateRangeLabel,
    })
    setExportFeedback(`Exported ${filteredEvents.length} audit records to PDF.`)
    setTimeout(() => setExportFeedback(null), 4000)
  }

  const handleQuickExportCsv = () => {
    exportAuditLogCsv({ events: filteredEvents })
    setExportFeedback(`Exported ${filteredEvents.length} audit records to CSV.`)
    setTimeout(() => setExportFeedback(null), 4000)
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
            <span>Security &amp; Operational Audit Log</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Complete, cryptographically immutable activity history of all administrative, dispatch, and lifecycle decisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold shadow-xs"
            title="Configure Date Range and Export PDF/CSV"
          >
            <Download className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            <span>Export Log...</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleQuickExportPdf}
            className="flex items-center gap-1.5 text-xs font-semibold"
            title="Download PDF directly with current filters"
          >
            <FileText className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
            <span>PDF</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleQuickExportCsv}
            className="flex items-center gap-1.5 text-xs font-semibold"
            title="Download CSV directly with current filters"
          >
            <Download className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {exportFeedback && (
        <div className="flex items-center gap-2 rounded-panel border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{exportFeedback}</span>
        </div>
      )}

      {/* KPI Cards: Total Activity Log Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Total Events</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{stats.total}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Recorded actions</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Status &amp; Lifecycle</span>
            <RefreshCw className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-sky-700">{stats.workflow}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">State transitions</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Crew Assignments</span>
            <Users className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-teal-700">{stats.assignment}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Dispatched teams</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Moderation</span>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700">{stats.moderation}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Policy enforcement</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">Personnel &amp; Access</span>
            <UserCheck className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-700">{stats.identity}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Provisioning &amp; scopes</p>
        </div>
      </div>

      {/* Filter Tabs matching user request: Total Activity Log Categories */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryTab('all')}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              categoryTab === 'all'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'bg-surface-panel border border-line text-ink-muted hover:text-ink'
            }`}
          >
            All Activities ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setCategoryTab('workflow')}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              categoryTab === 'workflow'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'bg-surface-panel border border-line text-ink-muted hover:text-ink'
            }`}
          >
            Status &amp; Lifecycle ({stats.workflow})
          </button>
          <button
            type="button"
            onClick={() => setCategoryTab('assignment')}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              categoryTab === 'assignment'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'bg-surface-panel border border-line text-ink-muted hover:text-ink'
            }`}
          >
            Crew Assignments ({stats.assignment})
          </button>
          <button
            type="button"
            onClick={() => setCategoryTab('moderation')}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              categoryTab === 'moderation'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'bg-surface-panel border border-line text-ink-muted hover:text-ink'
            }`}
          >
            Moderation ({stats.moderation})
          </button>
          <button
            type="button"
            onClick={() => setCategoryTab('identity')}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              categoryTab === 'identity'
                ? 'bg-[#0e7490] text-white shadow-xs'
                : 'bg-surface-panel border border-line text-ink-muted hover:text-ink'
            }`}
          >
            Personnel &amp; Access ({stats.identity})
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Search by actor, action, reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-line bg-surface-panel pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Sub-Filters: Role, Target Type, and Date Preset */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink-muted">Actor Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-panel border border-line bg-surface-panel px-2.5 py-1 text-xs focus:border-primary"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrator</option>
              <option value="authority">Authority / Dispatch</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink-muted">Target:</span>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="rounded-panel border border-line bg-surface-panel px-2.5 py-1 text-xs focus:border-primary"
            >
              <option value="">All Entities</option>
              <option value="issue">Issues</option>
              <option value="user">Users</option>
              <option value="report">Reports</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface-sunken p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`rounded-full px-3 py-0.5 font-semibold transition ${
                datePreset === 'all'
                  ? 'bg-surface-panel text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('today')}
              className={`rounded-full px-3 py-0.5 font-semibold transition ${
                datePreset === 'today'
                  ? 'bg-surface-panel text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('7d')}
              className={`rounded-full px-3 py-0.5 font-semibold transition ${
                datePreset === '7d'
                  ? 'bg-surface-panel text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`rounded-full px-3 py-0.5 font-semibold transition ${
                datePreset === 'custom'
                  ? 'bg-surface-panel text-ink shadow-xs text-primary'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Custom Range
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-panel px-3 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-ink-muted">From:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded border border-line bg-surface-sunken px-2 py-0.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
              <span className="text-ink-muted">To:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded border border-line bg-surface-sunken px-2 py-0.5 text-xs text-ink focus:border-primary focus:outline-none"
              />
              {(customFrom || customTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomFrom('')
                    setCustomTo('')
                  }}
                  className="text-2xs text-rose-600 hover:underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Activity Log Table */}
      {isLoading ? (
        <SkeletonRows rows={6} cols={5} />
      ) : isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load audit log: {error.message}
          </p>
        </Card>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <EmptyState
            title="No audit events found"
            message="No activity logs match the selected filter and search criteria."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-sunken font-bold uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="px-4 py-3">Timestamp</th>
                  <th scope="col" className="px-4 py-3">Actor (Who)</th>
                  <th scope="col" className="px-4 py-3">Action (What)</th>
                  <th scope="col" className="px-4 py-3">Target Entity</th>
                  <th scope="col" className="px-4 py-3">Details &amp; Audit Reason</th>
                  <th scope="col" className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredEvents.map((event, index) => {
                  const meta = getActionMeta(
                    event.action,
                    event.before,
                    event.after,
                    event.metadata,
                  )
                  const ActionIcon = meta.Icon
                  const isIssue = event.targetType === 'issue'
                  const isUser = event.targetType === 'user'
                  const actorDisplayName = getActorDisplayName(event)
                  const actorInitial = actorDisplayName.charAt(0).toUpperCase()
                  const isActorAdmin = event.actorRole === 'admin'
                  const changeDetailsText = formatAuditChangeDetails(event)

                  return (
                    <tr key={event.id || `${event.at}-${index}`} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Timestamp */}
                      <td className="whitespace-nowrap px-4 py-3 text-ink">
                        <div className="flex items-center gap-1.5 font-bold text-ink">
                          <Clock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          <span>{timeAgo(event.at)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {formatDateTime(event.at)}
                        </p>
                      </td>

                      {/* 2. Actor (Who did it) */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              isActorAdmin
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-teal-100 text-teal-800'
                            }`}
                          >
                            {actorInitial}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-ink leading-tight">
                                {actorDisplayName}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                                  isActorAdmin
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {event.actorRole || 'authority'}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-muted">
                              {event.actorEmail || `ID: #${shortId(event.actorId)}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 3. Action Taken */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold ${meta.badgeColor}`}
                          >
                            <ActionIcon className="h-3 w-3" />
                            <span>{meta.label}</span>
                          </span>
                          <p className="text-xs font-medium text-ink leading-tight">
                            {meta.narrative}
                          </p>
                        </div>
                      </td>

                      {/* 4. Target Entity */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                            {event.targetType}
                          </span>
                          <div>
                            {isIssue ? (
                              <Link
                                to={`/admin/queue/${event.targetId}`}
                                className="font-mono text-xs font-bold text-primary hover:underline"
                                title="View target issue"
                              >
                                #UM-{shortId(event.targetId)}
                              </Link>
                            ) : isUser ? (
                              <Link
                                to={`/admin/authorities/${event.targetId}`}
                                className="font-mono text-xs font-bold text-primary hover:underline"
                                title="View authority profile"
                              >
                                #USR-{shortId(event.targetId)}
                              </Link>
                            ) : (
                              <span className="font-mono text-xs text-ink-muted">
                                #{shortId(event.targetId)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 5. Details & Reason */}
                      <td className="px-4 py-3 max-w-sm">
                        <p className="text-xs text-ink leading-relaxed">
                          {changeDetailsText}
                        </p>
                      </td>

                      {/* 6. Inspect Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectEvent(event)}
                          className="text-xs text-primary hover:bg-primary-soft p-1.5"
                          title="Inspect audit record in readable format"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Inspection Modal */}
      <Dialog
        open={Boolean(inspectEvent)}
        onClose={() => setInspectEvent(null)}
        title="Audit Event Verification & Payload"
        className="max-w-2xl"
      >
        <InspectModalContent event={inspectEvent} onClose={() => setInspectEvent(null)} />
      </Dialog>

      {/* Export Modal with Custom Date Range */}
      <ExportAuditModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        events={filteredEvents}
        allEvents={rawEvents}
        user={user}
      />
    </div>
  )
}
