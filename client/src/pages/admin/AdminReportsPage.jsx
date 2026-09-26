import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  FilterX,
  Image,
  MessageSquare,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { api, normalizeMediaUrl } from '../../lib/api'
import { badgeFor, categoryLabel, useCategories } from '../../hooks/data'
import { formatDateTime, shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards, SkeletonRows } from '../../components/ui/Skeleton'
import StatusBadge from '../../components/ui/StatusBadge'
import RemoveWithNotesModal from '../../components/authority/RemoveWithNotesModal'

const ACTIVE_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'solved', label: 'Solved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'triaged', label: 'Under Review' },
]

export default function AdminReportsPage({ defaultTab = 'active' }) {
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const [searchParams, setSearchParams] = useSearchParams()
  const [removeTarget, setRemoveTarget] = useState(null)

  const currentTab = searchParams.get('tab') || defaultTab
  const isDeletedTab = currentTab === 'deleted'

  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const status = searchParams.get('status') ?? ''
  const cursor = searchParams.get('cursor') ?? ''

  const setFilter = (key, value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'cursor') next.delete('cursor')
        return next
      },
      { replace: true },
    )
  }

  const setTab = (tab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'deleted') next.set('tab', 'deleted')
        else next.delete('tab')
        next.delete('cursor')
        next.delete('status')
        return next
      },
      { replace: true },
    )
  }

  const clearAll = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams()
        if (prev.get('tab')) next.set('tab', prev.get('tab'))
        return next
      },
      { replace: true },
    )
  }

  const hasFilters = Boolean(q || category || (!isDeletedTab && status))

  // 10 reports per page limit
  const params = new URLSearchParams({ limit: '10' })
  if (isDeletedTab) {
    params.set('status', 'deleted')
  } else if (status) {
    params.set('status', status)
  }
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  if (cursor) params.set('cursor', cursor)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-reports', { tab: currentTab, q, category, status: isDeletedTab ? 'deleted' : status, cursor }],
    queryFn: () => api(`/reports?${params.toString()}`),
  })

  const reports = data?.data ?? []
  const nextCursor = data?.page?.nextCursor
  const prevCursor = data?.page?.prevCursor

  return (
    <div>
      <PageHeader
        title={isDeletedTab ? 'Deleted Reports Archive' : 'Global Reports Explorer'}
        subtitle={
          isDeletedTab
            ? 'Audit and inspect citizen reports that were removed or discarded by authorities, including removal notes.'
            : 'Search and inspect raw citizen reports submitted across the entire municipal system.'
        }
      />

      {/* Primary Tab Navigation */}
      <div className="mb-5 flex border-b border-line">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            !isDeletedTab
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Active Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('deleted')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            isDeletedTab
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
          }`}
        >
          <Trash2 className="h-4 w-4" />
          <span>Deleted Reports</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-2xs font-bold text-rose-800">
            Audit Archive
          </span>
        </button>
      </div>

      {isDeletedTab && (
        <div className="mb-4 flex items-start gap-3 rounded-panel border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-900 shadow-2xs">
          <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <h4 className="text-sm font-semibold text-rose-950">Deleted & Moderated Raw Reports</h4>
            <p className="mt-0.5 text-rose-800">
              These raw citizen reports were removed from active public and operational views by municipal authorities or admins.
              Every removal preserves full audit provenance, including the moderator name, role, timestamp, and audit notes.
            </p>
          </div>
        </div>
      )}

      {/* Filters form */}
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative min-w-52 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label={isDeletedTab ? 'Search deleted reports' : 'Search reports'}
              placeholder="Search by description, address, or ID…"
              defaultValue={q}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFilter('q', e.currentTarget.value)
              }}
              onBlur={(e) => e.target.value !== q && setFilter('q', e.target.value)}
              className="w-full rounded-panel border border-line bg-surface-panel py-2 pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-primary"
            />
          </div>

          <Select
            aria-label="Filter by category"
            className="w-48"
            value={category}
            onChange={(e) => setFilter('category', e.target.value)}
            options={[
              { value: '', label: 'All Categories' },
              ...(categories ?? []).map((c) => ({ value: c.key, label: c.label.en })),
            ]}
          />

          {!isDeletedTab && (
            <Select
              aria-label="Filter by status"
              className="w-36"
              value={status}
              onChange={(e) => setFilter('status', e.target.value)}
              options={ACTIVE_STATUSES}
            />
          )}

          {hasFilters && (
            <Button variant="ghost" onClick={clearAll} className="text-ink-muted">
              <FilterX className="h-4 w-4" aria-hidden="true" />
              Clear all
            </Button>
          )}
        </form>
      </Card>

      {/* Main Content */}
      {isLoading ? (
        <>
          <div className="md:hidden">
            <SkeletonCards count={4} />
          </div>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-4 py-3">Report</th>
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Submitted</th>
                  {isDeletedTab ? (
                    <>
                      <th scope="col" className="px-4 py-3">Removed By</th>
                      <th scope="col" className="px-4 py-3">Removal Reason / Notes</th>
                      <th scope="col" className="px-4 py-3 text-right">Removed At</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Clustered Issue</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <SkeletonRows cols={6} rows={6} />
            </table>
          </Card>
        </>
      ) : isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load reports: {error.message}
          </p>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState
            title={
              isDeletedTab
                ? hasFilters
                  ? 'No deleted reports match these filters'
                  : 'No deleted reports found'
                : hasFilters
                ? 'No reports match these filters'
                : 'No reports found'
            }
            message={
              isDeletedTab
                ? hasFilters
                  ? 'Try widening or clearing your search filters.'
                  : 'Reports removed by authorities or administrators will appear here with audit provenance.'
                : hasFilters
                ? 'Try widening or clearing your search filters.'
                : 'Citizen submissions will appear here once intake processes them.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearAll}>
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile view */}
          <div className="space-y-3 p-4 md:hidden">
            {reports.map((r) => {
              const badge = badgeFor(r)
              const photo = r.media?.find((m) => m.thumbnailUrl || m.url)
              const mod = r.moderation

              return (
                <div
                  key={r.id}
                  className={`rounded-panel border p-4 shadow-panel ${
                    isDeletedTab
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-line bg-surface-panel'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-ink">
                      #{shortId(r.id)}
                    </span>
                    {isDeletedTab ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-2xs font-semibold text-rose-700">
                        <Trash2 className="h-3 w-3" /> Removed
                      </span>
                    ) : (
                      <StatusBadge tone={badge.tone} label={badge.label} />
                    )}
                  </div>

                  <p className="mt-2 text-sm font-semibold text-ink">
                    {categoryLabel(categories, r.classification?.category)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {r.description || 'No description provided.'}
                  </p>

                  {isDeletedTab && mod && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5 text-xs text-rose-950">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-900">
                        <MessageSquare className="h-3.5 w-3.5 text-rose-700 shrink-0" />
                        <span>Removal Reason:</span>
                      </div>
                      <p className="mt-1 italic text-rose-800">
                        "{mod.reason || 'No specific notes recorded.'}"
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-2xs text-rose-700 border-t border-rose-200/60 pt-1.5">
                        <span>By: <strong>{mod.moderator}</strong> ({mod.moderatorRole})</span>
                        <span>{formatDateTime(mod.moderatedAt)}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-faint">
                    <span>Submitted: {formatDateTime(r.createdAt)}</span>
                    {!isDeletedTab && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(r)}
                          className="flex items-center gap-1 font-semibold text-status-critical hover:underline"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                        <Link
                          to="/admin/queue"
                          className="flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <ShieldAlert className="h-3 w-3" /> Moderate
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th scope="col" className="px-4 py-3">Report</th>
                <th scope="col" className="px-4 py-3">Category</th>
                <th scope="col" className="px-4 py-3">Submitted</th>
                {isDeletedTab ? (
                  <>
                    <th scope="col" className="px-4 py-3">Removed By</th>
                    <th scope="col" className="px-4 py-3">Removal Reason / Notes</th>
                    <th scope="col" className="px-4 py-3 text-right">Removed At</th>
                  </>
                ) : (
                  <>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Clustered Issue</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => {
                const badge = badgeFor(r)
                const photo = r.media?.find((m) => m.thumbnailUrl || m.url)
                const mod = r.moderation

                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-surface-sunken/60 ${
                      isDeletedTab ? 'bg-rose-50/10' : ''
                    }`}
                  >
                    {/* Report & Photo */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {photo ? (
                          <img
                            src={normalizeMediaUrl(photo.thumbnailUrl || photo.url)}
                            alt=""
                            className="h-9 w-9 rounded object-cover border border-line"
                            onError={(e) => {
                              if (photo.url && e.currentTarget.src !== normalizeMediaUrl(photo.url)) {
                                e.currentTarget.src = normalizeMediaUrl(photo.url)
                              } else {
                                e.currentTarget.style.display = 'none'
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex'
                                }
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded border border-line bg-surface-sunken text-ink-faint"
                          style={{ display: photo ? 'none' : 'flex' }}
                        >
                          <Image className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 max-w-xs">
                          <span className="font-mono text-xs font-bold text-ink">
                            #{shortId(r.id)}
                          </span>
                          <p className="truncate text-xs text-ink-muted">
                            {r.description || 'No description'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 font-medium text-ink">
                      {categoryLabel(categories, r.classification?.category)}
                    </td>

                    {/* Submitted Date */}
                    <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>

                    {isDeletedTab ? (
                      <>
                        {/* Removed By */}
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            <span className="font-medium text-ink block truncate max-w-[160px]" title={mod?.moderator || 'Unknown'}>
                              {mod?.moderator || 'System/Admin'}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-block rounded bg-rose-100 px-1.5 py-0.2 text-2xs font-semibold text-rose-800 capitalize">
                                {mod?.moderatorRole || 'Official'}
                              </span>
                              {mod?.moderatorArea && (
                                <span className="text-2xs text-ink-faint capitalize">
                                  ({mod.moderatorArea})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Removal Reason / Notes */}
                        <td className="px-4 py-3">
                          {mod?.reason ? (
                            <div className="flex items-start gap-1.5 rounded border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-xs text-rose-900 max-w-md">
                              <MessageSquare className="h-3.5 w-3.5 text-rose-700 shrink-0 mt-0.5" />
                              <span className="break-words">{mod.reason}</span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-ink-faint">
                              No note provided
                            </span>
                          )}
                        </td>

                        {/* Removed At */}
                        <td className="px-4 py-3 text-right text-xs text-ink-muted whitespace-nowrap">
                          {mod?.moderatedAt ? formatDateTime(mod.moderatedAt) : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge tone={badge.tone} label={badge.label} />
                        </td>

                        {/* Clustered Issue */}
                        <td className="px-4 py-3">
                          {r.issueId ? (
                            <span className="font-mono text-xs text-ink-muted">
                              #{shortId(r.issueId)}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-faint">Pending review</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(r)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-status-critical hover:underline"
                              title="Discard report with audit notes"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                            <Link
                              to="/admin/queue"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                              Moderate
                            </Link>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* 10 per page pagination footer */}
          <div className="flex flex-wrap items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted bg-surface-sunken/40">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="font-semibold text-ink">{reports.length}</strong> {isDeletedTab ? 'deleted reports' : 'reports'}
                {cursor ? ' (Paged view)' : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!cursor}
                onClick={() => setFilter('cursor', '')}
                className="text-xs"
                title="Return to first page"
              >
                First Page
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!cursor && !prevCursor}
                onClick={() => {
                  if (prevCursor) setFilter('cursor', prevCursor)
                  else setFilter('cursor', '')
                }}
                className="text-xs flex items-center gap-1"
                title="Go to previous page"
              >
                &larr; Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!nextCursor}
                onClick={() => nextCursor && setFilter('cursor', nextCursor)}
                className="text-xs font-semibold text-primary flex items-center gap-1"
                title="Go to next page"
              >
                Next &rarr;
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Remove with Notes Modal for Admin */}
      {removeTarget && (
        <RemoveWithNotesModal
          open={Boolean(removeTarget)}
          onClose={() => setRemoveTarget(null)}
          item={removeTarget}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
          }}
        />
      )}
    </div>
  )
}
