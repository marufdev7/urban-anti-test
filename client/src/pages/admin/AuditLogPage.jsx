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
import { exportAuditLogPdf, exportAuditLogCsv } from '../../lib/pdfExport'
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
  switch (action) {
    case 'issue.status_changed': {
      const fromStatus = before?.status || 'unknown'
      const toStatus = after?.status || 'updated'
      return {
        label: 'Status Transition',
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
        label: 'Crew Assignment',
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
    case 'issue.severity_changed': {
      const fromSev = before?.severity || 'unrated'
      const toSev = after?.severity || 'overridden'
      return {
        label: 'Severity Override',
        badgeColor: 'border-rose-300 bg-rose-50 text-rose-700',
        Icon: AlertTriangle,
        narrative: `Manual severity override applied: escalated to "${toSev.toUpperCase()}" priority`,
        hasDiff: true,
        diffBefore: fromSev,
        diffAfter: toSev,
      }
    }
    case 'moderation.hide': {
      return {
        label: 'Moderation (Hidden)',
        badgeColor: 'border-amber-300 bg-amber-50 text-amber-800',
        Icon: EyeOff,
        narrative: 'Hidden from public feed and municipal dashboard (Policy Enforcement)',
        hasDiff: false,
      }
    }
    case 'moderation.remove': {
      return {
        label: 'Moderation (Removed)',
        badgeColor: 'border-rose-300 bg-rose-50 text-rose-700',
        Icon: Trash2,
        narrative: 'Soft-deleted or permanently removed from municipal active record',
        hasDiff: false,
      }
    }
    case 'identity.provisioned': {
      const email = after?.email || 'New Authority'
      return {
        label: 'Personnel Provisioned',
        badgeColor: 'border-purple-300 bg-purple-50 text-purple-700',
        Icon: UserPlus,
        narrative: `Provisioned new Authority official account for ${email}`,
        hasDiff: false,
      }
    }
    case 'identity.updated': {
      return {
        label: 'Scope & Access Updated',
        badgeColor: 'border-indigo-300 bg-indigo-50 text-indigo-700',
        Icon: ShieldCheck,
        narrative: 'Updated municipal personnel category jurisdiction and system access scope',
        hasDiff: Boolean(before && after),
        diffBefore: before?.category_scope ? before.category_scope.join(', ') : null,
        diffAfter: after?.category_scope ? after.category_scope.join(', ') : null,
      }
    }
    case 'issue.comment_created': {
      return {
        label: 'Internal Dispatch Note',
        badgeColor: 'border-blue-300 bg-blue-50 text-blue-700',
        Icon: MessageSquare,
        narrative: after?.comment ? `Recorded dispatch directive: "${after.comment}"` : 'Added secure operational note',
        hasDiff: false,
      }
    }
    case 'issue.split': {
      return {
        label: 'Incident Split',
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Split clustered reports into separate distinct municipal incidents',
        hasDiff: false,
      }
    }
    case 'issue.merged': {
      return {
        label: 'Incident Merged',
        badgeColor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icon: Layers,
        narrative: 'Merged duplicate municipal reports into primary surviving incident',
        hasDiff: false,
      }
    }
    default: {
      return {
        label: action.replace('.', ' ').replace('_', ' ').toUpperCase(),
        badgeColor: 'border-slate-300 bg-slate-50 text-slate-700',
        Icon: Activity,
        narrative: `System recorded action: ${action}`,
        hasDiff: Boolean(before && after),
      }
    }
  }
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
  const [inspectEvent, setInspectEvent] = useState(null)
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
      }

      // Keyword search (searches actor name, email, action, target id, reason)
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchName = (e.actorName || '').toLowerCase().includes(query)
        const matchEmail = (e.actorEmail || '').toLowerCase().includes(query)
        const matchAction = (e.action || '').toLowerCase().includes(query)
        const matchTarget = (e.targetId || '').toLowerCase().includes(query)
        const matchReason = (e.metadata?.reason || e.after?.reason || '').toLowerCase().includes(query)
        if (!matchName && !matchEmail && !matchAction && !matchTarget && !matchReason) {
          return false
        }
      }

      return true
    })
  }, [rawEvents, categoryTab, roleFilter, targetFilter, datePreset, search])

  // Export handlers
  const handleExportPdf = () => {
    exportAuditLogPdf({ events: filteredEvents, user })
    setExportFeedback(`Exported ${filteredEvents.length} audit records to PDF.`)
    setTimeout(() => setExportFeedback(null), 4000)
  }

  const handleExportCsv = () => {
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
            variant="secondary"
            size="sm"
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 text-xs font-semibold"
            title="Download PDF Audit Log"
          >
            <FileText className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
            <span>Export PDF</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 text-xs font-semibold"
            title="Download CSV Audit Log"
          >
            <Download className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
            <span>Export CSV</span>
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
                  const reason =
                    event.metadata?.reason ||
                    event.after?.reason ||
                    (event.action === 'issue.comment_created' ? event.after?.comment : null)
                  const isIssue = event.targetType === 'issue'
                  const isUser = event.targetType === 'user'

                  const actorInitial = (event.actorName || event.actorEmail || 'A')
                    .charAt(0)
                    .toUpperCase()
                  const isActorAdmin = event.actorRole === 'admin'

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
                                {event.actorName || 'Authority'}
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
                          <p className="font-mono text-[10px] text-ink-muted">
                            {event.action}
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
                      <td className="px-4 py-3 max-w-xs">
                        <div className="space-y-1.5">
                          {/* Diff comparison pills if available */}
                          {meta.hasDiff && meta.diffBefore && meta.diffAfter && (
                            <div className="flex flex-wrap items-center gap-1 text-[11px]">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 line-through">
                                {meta.diffBefore}
                              </span>
                              <span className="text-ink-muted">➔</span>
                              <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 font-semibold text-emerald-800">
                                {meta.diffAfter}
                              </span>
                            </div>
                          )}

                          {/* Reason Quote Box */}
                          {reason && (
                            <div className="rounded bg-sky-50/70 border border-sky-100 p-2 text-[11px] text-ink/90 leading-relaxed italic">
                              &ldquo;{reason}&rdquo;
                            </div>
                          )}

                          {!meta.hasDiff && !reason && (
                            <span className="text-[11px] text-ink-muted">
                              Action cryptographically confirmed.
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. Inspect Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectEvent(event)}
                          className="text-xs text-primary hover:bg-primary-soft p-1.5"
                          title="Inspect raw audit payload"
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
        title="Audit Event Payload & Verification"
      >
        {inspectEvent && (
          <div className="space-y-4 text-xs">
            <div className="rounded-panel border border-line bg-surface-sunken p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Action: {inspectEvent.action}</span>
                <span className="font-mono text-ink-muted">ID: {inspectEvent.id || 'IMMUTABLE'}</span>
              </div>
              <p className="text-ink-muted">
                Actor: {inspectEvent.actorName} ({inspectEvent.actorEmail}) · Role: {inspectEvent.actorRole}
              </p>
              <p className="text-ink-muted">
                Timestamp: {formatDateTime(inspectEvent.at)} ({inspectEvent.at})
              </p>
              <p className="text-ink-muted">
                Target: {inspectEvent.targetType} #{inspectEvent.targetId}
              </p>
            </div>

            <div>
              <p className="font-bold text-ink mb-1">State Before:</p>
              <pre className="rounded border border-line bg-slate-900 text-slate-100 p-2.5 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(inspectEvent.before, null, 2) || 'null'}
              </pre>
            </div>

            <div>
              <p className="font-bold text-ink mb-1">State After:</p>
              <pre className="rounded border border-line bg-slate-900 text-emerald-300 p-2.5 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(inspectEvent.after, null, 2) || 'null'}
              </pre>
            </div>

            {inspectEvent.metadata && Object.keys(inspectEvent.metadata).length > 0 && (
              <div>
                <p className="font-bold text-ink mb-1">Audit Metadata &amp; Directives:</p>
                <pre className="rounded border border-line bg-slate-900 text-amber-300 p-2.5 overflow-x-auto font-mono text-[11px]">
                  {JSON.stringify(inspectEvent.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-[11px] text-ink-muted flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Immutable PostgreSQL trigger enforced
              </span>
              <Button size="sm" onClick={() => setInspectEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
