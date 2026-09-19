import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards } from '../../components/ui/Skeleton'
import ReportCard from '../../components/report/ReportCard'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'processing', label: 'Processing' },
  { value: 'triaged', label: 'Triaged' },
]

/** /citizen/reports — full searchable list of the citizen's own reports. */
export default function MyReportsPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [cursor, setCursor] = useState(null)
  const [stale, setStale] = useState([]) // accumulated earlier pages

  const params = new URLSearchParams({ limit: '20' })
  if (search) params.set('q', search)
  if (status) params.set('status', status)
  if (cursor) params.set('cursor', cursor)

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['reports', 'mine', { search, status, cursor }],
    queryFn: () => api(`/reports?${params}`),
    placeholderData: (prev) => prev,
  })

  const reports = cursor ? [...stale, ...(data?.data ?? [])] : data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  const applyFilters = (next = {}) => {
    setStale([])
    setCursor(null)
    if ('search' in next) setSearch(next.search)
    if ('status' in next) setStatus(next.status)
  }

  const loadMore = () => {
    setStale(reports)
    setCursor(nextCursor)
  }

  return (
    <div>
      <PageHeader
        title="My Reports"
        subtitle="Everything you have submitted, newest first."
      />

      <Card className="mb-5 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            applyFilters({ search: q })
          }}
        >
          <div className="min-w-60 flex-1">
            <label htmlFor="report-search" className="sr-only">
              Search reports
            </label>
            <input
              id="report-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by description, ID or location…"
              className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-sm placeholder:text-ink-faint focus:border-primary"
            />
          </div>
          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => applyFilters({ status: e.target.value })}
            className="w-44"
          />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {isLoading && <SkeletonCards count={6} className="mt-2" />}
      {isError && (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load your reports: {error.message}
          </p>
        </Card>
      )}

      {!isLoading && !isError && reports.length === 0 && (
        <Card>
          <EmptyState
            title="No reports found"
            message={
              search || status
                ? 'Try a different search or clear the filters.'
                : 'Reports you submit will appear here.'
            }
          />
        </Card>
      )}

      {reports.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
          {nextCursor && (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={loadMore} loading={isFetching && !!cursor}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
