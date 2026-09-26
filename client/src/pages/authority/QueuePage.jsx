import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Filter,
  Info,
  MapPin,
  Plus,
  Search,
  UserCheck,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { getJurisdictionLabel } from '../../lib/zones'
import {
  ISSUE_SORTS,
  ISSUE_STATUSES,
  issueStatusLabel,
  issueStatusTone,
  SEVERITIES,
  useIssues,
} from '../../hooks/issues'
import { categoryLabel, useCategories } from '../../hooks/data'
import { formatAge, shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Select from '../../components/ui/Select'
import { SkeletonCards, SkeletonRows } from '../../components/ui/Skeleton'
import ManualEntryModal from '../../components/authority/ManualEntryModal'

const SEV_CONFIG = {
  critical: {
    className: 'border-rose-400 bg-rose-100 text-rose-800 font-bold',
    iconColor: 'text-rose-600',
    Icon: AlertCircle,
  },
  high: {
    className: 'border-orange-500 bg-orange-100 text-orange-950 font-bold',
    iconColor: 'text-orange-600',
    Icon: AlertTriangle,
  },
  medium: {
    className: 'border-yellow-400 bg-yellow-100 text-yellow-950 font-bold',
    iconColor: 'text-yellow-600',
    Icon: Info,
  },
  low: {
    className: 'border-emerald-400 bg-emerald-100 text-emerald-800 font-bold',
    iconColor: 'text-emerald-600',
    Icon: CheckCircle2,
  },
}

const SEV_STYLES = {
  critical: SEV_CONFIG.critical.className,
  high: SEV_CONFIG.high.className,
  medium: SEV_CONFIG.medium.className,
  low: SEV_CONFIG.low.className,
}

const STATUS_DOTS = {
  triage: 'bg-slate-400',
  open: 'bg-slate-400',
  acknowledged: 'bg-amber-500',
  in_progress: 'bg-primary',
  in_transit: 'bg-indigo-500',
  on_site: 'bg-teal-600',
  resolved: 'bg-status-resolved',
  closed: 'bg-status-resolved',
}

const AVATAR_COLORS = [
  'bg-teal-700 text-white',
  'bg-amber-800 text-white',
  'bg-blue-800 text-white',
  'bg-indigo-700 text-white',
  'bg-emerald-700 text-white',
]

function getAvatarColor(str = '') {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name = '') {
  if (!name) return 'UN'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Authority queue (authority-queue.png). Filter/sort state lives in the URL
 * search params so views are bookmarkable.
 */
export default function QueuePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [assigningId, setAssigningId] = useState(null)

  const isMyIssuesRoute = location.pathname.startsWith('/authority/my-issues')
  const assignedToParam = searchParams.get('assignedTo')
  const isMyIssues = isMyIssuesRoute || assignedToParam === 'me'

  const assignToMe = async (issueId) => {
    setAssigningId(issueId)
    try {
      await api(`/issues/${issueId}/assignment`, {
        method: 'PATCH',
        body: { assigneeId: user?.id },
      })
      queryClient.invalidateQueries({ queryKey: ['issues'] })
    } catch (err) {
      alert(`Assignment failed: ${err.message}`)
    } finally {
      setAssigningId(null)
    }
  }

  const unassign = async (issueId) => {
    setAssigningId(issueId)
    try {
      await api(`/issues/${issueId}/assignment`, {
        method: 'PATCH',
        body: { assigneeId: null },
      })
      queryClient.invalidateQueries({ queryKey: ['issues'] })
    } catch (err) {
      alert(`Unassign failed: ${err.message}`)
    } finally {
      setAssigningId(null)
    }
  }

  const filters = {
    category: searchParams.get('category') ?? '',
    severity: searchParams.get('severity') ?? '',
    status: searchParams.get('status') ?? '',
    assignedTo: isMyIssues ? 'me' : (searchParams.get('assignedTo') ?? ''),
    sort: searchParams.get('sort') ?? '',
    q: searchParams.get('q') ?? '',
    cursor: searchParams.get('cursor') ?? '',
  }

  const setFilter = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'cursor') next.delete('cursor')
      return next
    }, { replace: true })
  }

  const clearAll = () => setSearchParams({}, { replace: true })
  const hasFilters = Object.entries(filters).some(([key, v]) => v && key !== 'cursor' && key !== 'assignedTo')

  const { data, isLoading, isFetching, isError, error } = useIssues(filters, {
    refetchInterval: 20_000,
  })
  const issues = data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  const allSelected = issues.length > 0 && issues.every((iss) => selectedIds.has(iss.id))
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(issues.map((i) => i.id)))
    }
  }

  const toggleSelect = (id, e) => {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div>
      {/* Page Header with Title, Jurisdiction Badge & Manual Entry Action */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {isMyIssues ? 'My Assigned Issues' : 'Work Queue'}
            </h1>
            {user?.assignedArea && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                <span>{getJurisdictionLabel(user.assignedArea)}</span>
              </span>
            )}
            {isMyIssues && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <UserCheck className="h-3.5 w-3.5" />
                Direct Assignments
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {isMyIssues
              ? `Municipal incidents assigned directly to you${user?.assignedArea ? ` in ${getJurisdictionLabel(user.assignedArea)}` : ''} for municipal response, dispatch, and resolution.`
              : `Manage and review active municipal reports across ${getJurisdictionLabel(user?.assignedArea)}.`}
          </p>
        </div>

        <Button
          onClick={() => setManualEntryOpen(true)}
          className="bg-[#005a4c] hover:bg-[#00483c] text-white font-semibold px-4 py-2 flex items-center gap-2 shadow-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          <span>Manual Entry</span>
        </Button>
      </div>

      {/* Comprehensive Modern Manual Entry Modal */}
      {manualEntryOpen && (
        <ManualEntryModal
          isOpen={manualEntryOpen}
          onClose={() => setManualEntryOpen(false)}
          defaultArea={user?.assignedArea}
        />
      )}

      {/* Filters Bar matching authority-queue.png */}
      <Card className="mb-4 p-3 md:sticky md:top-0 md:z-20">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border-r border-line pr-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <Filter className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
            <span>Filters</span>
          </div>

          <div className="w-44">
            <Select
              aria-label="Filter by category"
              value={filters.category}
              onChange={(e) => setFilter('category', e.target.value)}
              options={(categories ?? []).filter((c) => c.active).map((c) => ({ value: c.key, label: c.label.en }))}
              placeholder="All Categories"
            />
          </div>

          <div className="w-40">
            <Select
              aria-label="Filter by severity"
              value={filters.severity}
              onChange={(e) => setFilter('severity', e.target.value)}
              options={SEVERITIES}
              placeholder="All Severities"
            />
          </div>

          <div className="w-40">
            <Select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value)}
              options={ISSUE_STATUSES}
              placeholder="All Statuses"
            />
          </div>

          <div className="w-44">
            <Select
              aria-label="Filter by assignment"
              value={isMyIssues ? 'me' : ''}
              onChange={(e) => {
                if (e.target.value === 'me') {
                  handleTabSwitch('my')
                } else {
                  handleTabSwitch('all')
                }
              }}
              options={[
                { value: '', label: 'All Assignments' },
                { value: 'me', label: 'Assigned to Me' },
              ]}
              placeholder="Assignment"
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto text-xs font-medium text-ink-muted hover:text-ink hover:underline"
            >
              Clear All
            </button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <>
          <div className="md:hidden">
            <SkeletonCards count={4} />
          </div>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-sky-50/50 text-left text-xs font-bold uppercase tracking-wider text-ink-muted">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Issue Title &amp; ID</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3 text-right">Time Elapsed</th>
                </tr>
              </thead>
              <SkeletonRows cols={7} rows={5} />
            </table>
          </Card>
        </>
      ) : isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load the queue: {error.message}
          </p>
        </Card>
      ) : issues.length === 0 ? (
        <Card>
          <EmptyState
            title={
              isMyIssues
                ? 'No issues assigned to you yet'
                : hasFilters
                ? 'No issues match these filters'
                : 'Queue is empty'
            }
            message={
              isMyIssues
                ? 'You currently have no tasks assigned to you. Browse the Work Queue to claim unassigned issues or wait for dispatch.'
                : hasFilters
                ? 'Try widening the filters or clearing them.'
                : 'New reports will appear here as reports are reviewed.'
            }
            action={
              isMyIssues ? (
                <Button variant="primary" onClick={() => handleTabSwitch('all')}>
                  Browse Work Queue
                </Button>
              ) : hasFilters ? (
                <Button variant="secondary" onClick={clearAll}>
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile: stacked report cards */}
          <div className="space-y-3 p-4 md:hidden">
            {issues.map((issue) => {
              const sev = issue.severity?.current || 'medium'
              const sevCfg = SEV_CONFIG[sev] || SEV_CONFIG.medium
              const SevIcon = sevCfg.Icon
              return (
                <Link
                  key={issue.id}
                  to={`/authority/queue/${issue.id}`}
                  className="block rounded-panel border border-line bg-surface-panel p-4 shadow-panel"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs capitalize ${
                        sevCfg.className
                      }`}
                    >
                      <SevIcon className={`h-3 w-3 shrink-0 ${sevCfg.iconColor}`} aria-hidden="true" />
                      {sev}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          STATUS_DOTS[issue.status] ?? 'bg-slate-400'
                        }`}
                      />
                      {issueStatusLabel(issue.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-ink">
                    {categoryLabel(categories, issue.primaryCategory)}
                  </p>
                  <p className="text-xs text-ink-muted">#UM-{shortId(issue.id)}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-muted">
                    <div className="flex items-center gap-2">
                      <span>
                        {issue.assignedTo ? (issue.assignedTo === user?.id ? 'Assigned to Me' : 'Team Alpha') : 'Unassigned'}
                      </span>
                      {issue.assignedTo === user?.id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            unassign(issue.id)
                          }}
                          disabled={assigningId === issue.id}
                          className="font-medium text-ink-muted hover:text-rose-600 underline"
                        >
                          Release
                        </button>
                      ) : !issue.assignedTo ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            assignToMe(issue.id)
                          }}
                          disabled={assigningId === issue.id}
                          className="font-semibold text-primary underline"
                        >
                          Claim
                        </button>
                      ) : null}
                    </div>
                    <span className={`font-semibold ${sev === 'critical' ? 'text-rose-600' : 'text-ink'}`}>
                      {new Date(issue.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span className="text-ink-muted font-normal ml-1">• {formatAge(issue.ageSeconds)}</span>
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Desktop Table matching authority-queue.png */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-sky-50/50 text-left text-xs font-bold uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-line text-primary focus:ring-primary"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3.5">Severity</th>
                  <th scope="col" className="px-4 py-3.5">Issue Title &amp; ID</th>
                  <th scope="col" className="px-4 py-3.5">Location</th>
                  <th scope="col" className="px-4 py-3.5">Status</th>
                  <th scope="col" className="px-4 py-3.5">Assigned To</th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      Reported <ChevronDown className="h-3.5 w-3.5" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {issues.map((issue) => {
                  const sev = issue.severity?.current || 'medium'
                  const isCritical = sev === 'critical'
                  const isChecked = selectedIds.has(issue.id)
                  const assigneeName = issue.assignedTo
                    ? (issue.assignedTo === user?.id ? 'Me' : 'Team Alpha')
                    : null
                  const sevCfg = SEV_CONFIG[sev] || SEV_CONFIG.medium
                  const SevIcon = sevCfg.Icon

                  return (
                    <tr
                      key={issue.id}
                      onClick={() => navigate(`/authority/queue/${issue.id}`)}
                      className="cursor-pointer transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleSelect(issue.id, e)}
                          className="rounded border-line text-primary focus:ring-primary"
                        />
                      </td>

                      {/* Severity pill badge with icon */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs capitalize ${sevCfg.className}`}
                        >
                          <SevIcon className={`h-3 w-3 shrink-0 ${sevCfg.iconColor}`} aria-hidden="true" />
                          {sev}
                        </span>
                      </td>

                      {/* Title & ID */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-ink">
                          {categoryLabel(categories, issue.primaryCategory)}
                        </p>
                        <p className="text-xs text-ink-muted">#UM-{shortId(issue.id)}</p>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                          <span className="text-ink-muted truncate" title={issue.address || ''}>
                            {issue.address
                              ? issue.address
                              : issue.representativeLocation
                                ? `${issue.representativeLocation.lat.toFixed(4)}, ${issue.representativeLocation.lng.toFixed(4)}`
                                : 'Location unavailable'}
                          </span>
                        </div>
                      </td>

                      {/* Status with dot */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-ink">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              STATUS_DOTS[issue.status] ?? 'bg-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          {issueStatusLabel(issue.status)}
                        </span>
                      </td>

                      {/* Assigned to with initials avatar or Assign to me button */}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {assigneeName ? (
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${getAvatarColor(
                                assigneeName,
                              )}`}
                            >
                              {getInitials(assigneeName)}
                            </div>
                            <span className="text-xs font-semibold text-ink">{assigneeName}</span>
                            {issue.assignedTo === user?.id && (
                              <button
                                type="button"
                                disabled={assigningId === issue.id}
                                onClick={() => unassign(issue.id)}
                                title="Release assignment back to queue"
                                className="ml-1 text-[11px] font-medium text-ink-muted hover:text-rose-600 hover:underline"
                              >
                                {assigningId === issue.id ? '…' : 'Release'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={assigningId === issue.id}
                            onClick={() => assignToMe(issue.id)}
                            className="rounded border border-primary/40 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            {assigningId === issue.id ? 'Assigning…' : 'Assign to me'}
                          </button>
                        )}
                      </td>

                      {/* Reported date + age */}
                      <td
                        className={`px-4 py-3.5 text-right text-xs ${
                          isCritical ? 'text-rose-600' : 'text-ink'
                        }`}
                      >
                        <span className="font-semibold">
                          {new Date(issue.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-ink-muted ml-1">• {formatAge(issue.ageSeconds)} ago</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer (FRONT-PLAN §1.3 & §10.5 cursor pagination) */}
          <div className="flex flex-wrap items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted">
            <div>
              Viewing {issues.length} active issues on this page
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!filters.cursor}
                onClick={() => setFilter('cursor', '')}
                className="text-xs"
              >
                First Page
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!nextCursor}
                onClick={() => nextCursor && setFilter('cursor', nextCursor)}
                className="text-xs font-semibold text-primary"
              >
                Next Page &rarr;
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
