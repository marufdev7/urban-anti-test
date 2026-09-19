import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FilterX, Image, Search } from 'lucide-react'
import { api, normalizeMediaUrl } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { badgeFor, categoryLabel, useCategories } from '../../hooks/data'
import { formatDateTime, shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards, SkeletonRows } from '../../components/ui/Skeleton'
import StatusBadge from '../../components/ui/StatusBadge'

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'processing', label: 'Processing' },
  { value: 'triaged', label: 'Under Review' },
]

export default function AuthorityReportsPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const [searchParams, setSearchParams] = useSearchParams()

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

  const clearAll = () => setSearchParams({}, { replace: true })
  const hasFilters = Boolean(q || category || status)

  // Query parameters for GET /reports
  const params = new URLSearchParams({ limit: '20' })
  if (q) params.set('q', q)
  if (category) params.set('category', category)
  if (status) params.set('status', status)
  if (cursor) params.set('cursor', cursor)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['authority-reports', { q, category, status, cursor }],
    queryFn: () => api(`/reports?${params.toString()}`),
  })

  const reports = data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  const scopeSet = new Set(user?.categoryScope ?? [])
  const availableCategories = (categories ?? []).filter(
    (c) => c.active && (scopeSet.size === 0 || scopeSet.has(c.key)),
  )

  return (
    <div>
      <PageHeader
        title="Citizen Reports"
        subtitle="Review raw citizen submissions across your authority's category scope."
      />

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
              aria-label="Search reports"
              placeholder="Search descriptions, IDs, addresses…"
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
              { value: '', label: 'All In-Scope Categories' },
              ...availableCategories.map((c) => ({ value: c.key, label: c.label.en })),
            ]}
          />

          <Select
            aria-label="Filter by status"
            className="w-36"
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
            options={STATUSES}
          />

          {hasFilters && (
            <Button variant="ghost" onClick={clearAll} className="text-ink-muted">
              <FilterX className="h-4 w-4" aria-hidden="true" />
              Clear all
            </Button>
          )}
        </form>
      </Card>

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
                  <th scope="col" className="px-4 py-3">Status / Severity</th>
                  <th scope="col" className="px-4 py-3">Clustered Issue</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <SkeletonRows cols={6} rows={5} />
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
            title={hasFilters ? 'No reports match these filters' : 'No reports found'}
            message={
              hasFilters
                ? 'Try widening or clearing your search filters.'
                : 'Citizen submissions within your assigned categories will appear here.'
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
              return (
                <div
                  key={r.id}
                  className="rounded-panel border border-line bg-surface-panel p-4 shadow-panel"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-ink">
                      #{shortId(r.id)}
                    </span>
                    <StatusBadge tone={badge.tone} label={badge.label} />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {categoryLabel(categories, r.classification?.category)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {r.description || 'No description provided.'}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-faint">
                    <span>{formatDateTime(r.createdAt)}</span>
                    {r.issueId && (
                      <Link
                        to={`/authority/queue/${r.issueId}`}
                        className="flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Issue #{shortId(r.issueId)} <ExternalLink className="h-3 w-3" />
                      </Link>
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
                <th scope="col" className="px-4 py-3">Status / Severity</th>
                <th scope="col" className="px-4 py-3">Clustered Issue</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => {
                const badge = badgeFor(r)
                const photo = r.media?.find((m) => m.thumbnailUrl || m.url)
                return (
                  <tr key={r.id} className="hover:bg-surface-sunken/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {photo ? (
                          <img
                            src={normalizeMediaUrl(photo.thumbnailUrl || photo.url)}
                            alt=""
                            className="h-9 w-9 rounded object-cover border border-line"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded border border-line bg-surface-sunken text-ink-faint">
                            <Image className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold text-ink">
                            #{shortId(r.id)}
                          </span>
                          <p className="max-w-xs truncate text-xs text-ink-muted">
                            {r.description || 'No description'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {categoryLabel(categories, r.classification?.category)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={badge.tone} label={badge.label} />
                    </td>
                    <td className="px-4 py-3">
                      {r.issueId ? (
                        <Link
                          to={`/authority/queue/${r.issueId}`}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          Issue #{shortId(r.issueId)}
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-faint">Pending review</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.issueId ? (
                        <Link
                          to={`/authority/queue/${r.issueId}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          View incident
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {nextCursor && (
            <div className="border-t border-line p-3 text-center">
              <Button
                variant="secondary"
                onClick={() => setFilter('cursor', nextCursor)}
              >
                Load Next Page
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
