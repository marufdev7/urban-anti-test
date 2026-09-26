import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  FilterX,
  MapPin,
  Plus,
  Search,
} from 'lucide-react'
import { api } from '../../lib/api'
import { isReportSolved } from '../../hooks/data'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards } from '../../components/ui/Skeleton'
import ReportCard from '../../components/report/ReportCard'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'solved', label: 'Solved / Resolved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'triaged', label: 'Under Review' },
  { value: 'processing', label: 'Processing' },
  { value: 'submitted', label: 'Submitted' },
]

/**
 * Citizen personal submission archive (/citizen/reports).
 * Lists all reports filed by the logged-in citizen.
 * Distinct from the community-wide Processing Queue (/citizen/queue).
 */
export default function MyReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || searchParams.get('search') || ''

  const [q, setQ] = useState(urlQuery)
  const [search, setSearch] = useState(urlQuery)
  const [status, setStatus] = useState('')
  // active tab: 'all' | 'active' | 'solved'
  const [activeTab, setActiveTab] = useState('all')
  const [cursor, setCursor] = useState(null)
  const [stale, setStale] = useState([]) // accumulated earlier pages

  // Sync state if URL search query changes
  useEffect(() => {
    setQ(urlQuery)
    setSearch(urlQuery)
    setStale([])
    setCursor(null)
  }, [urlQuery])

  const params = new URLSearchParams({ limit: '50' })
  if (search) params.set('q', search)
  // Backend recognizes submitted, processing, triaged
  if (status && !['solved', 'in_progress'].includes(status)) {
    params.set('status', status)
  }
  if (cursor) params.set('cursor', cursor)

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['reports', 'mine', { search, status, cursor }],
    queryFn: () => api(`/reports?${params}`),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  })

  const allRawReports = cursor ? [...stale, ...(data?.data ?? [])] : data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  // Tally counts across all loaded reports
  const totalCount = allRawReports.length
  const solvedCount = allRawReports.filter(isReportSolved).length
  const queueCount = totalCount - solvedCount

  // Filter reports according to active tab and status dropdown
  const filteredReports = allRawReports.filter((report) => {
    const isSolved = isReportSolved(report)
    const issStatus = report.issueStatus || report.issue?.status || ''

    // 1. Tab filter
    if (activeTab === 'solved' && !isSolved) return false
    if (activeTab === 'active' && isSolved) return false

    // 2. Status dropdown filter
    if (status === 'solved' && !isSolved) return false
    if (status === 'in_progress' && issStatus !== 'in_progress') return false
    if (status && !['solved', 'in_progress'].includes(status) && report.status !== status) {
      return false
    }

    return true
  })

  const applyFilters = (next = {}) => {
    setStale([])
    setCursor(null)
    if ('search' in next) {
      const cleanSearch = next.search !== undefined ? next.search.trim() : ''
      setSearch(cleanSearch)
      const newParams = new URLSearchParams(searchParams)
      if (cleanSearch) {
        newParams.set('q', cleanSearch)
      } else {
        newParams.delete('q')
        newParams.delete('search')
      }
      setSearchParams(newParams, { replace: true })
    }
    if ('status' in next) setStatus(next.status)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'solved') setStatus('solved')
    else if (tab === 'active') setStatus('')
    else setStatus('')
  }

  const loadMore = () => {
    setStale(allRawReports)
    setCursor(nextCursor)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Reports"
        subtitle="Comprehensive archive of all your civic incident submissions, status tracking, and verified resolutions."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/citizen/queue">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs font-semibold">
                <ClipboardList className="h-4 w-4 text-primary" />
                View Area Processing Queue
              </Button>
            </Link>
            <Link to="/citizen/reports/new">
              <Button size="sm" className="flex items-center gap-1.5 font-semibold">
                <Plus className="h-4 w-4" />
                Submit New Report
              </Button>
            </Link>
          </div>
        }
      />

      {/* TOP SUMMARY HUD BANNER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface-panel p-4 text-xs shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink">Personal Submissions Record</h2>
              <span className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-black uppercase">
                {solvedCount} Solved
              </span>
            </div>
            <p className="mt-0.5 text-ink-muted text-xs">
              Total <strong>{totalCount}</strong> report{totalCount === 1 ? '' : 's'} recorded • <strong>{queueCount}</strong> currently active in progress.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/citizen/queue">
            <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs font-semibold border-primary/40 text-primary hover:bg-primary-soft">
              <span>View Area Processing Queue</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* SEARCH & FILTER CONTROLS */}
      <Card className="p-4">
        <div className="space-y-3">
          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
            <button
              type="button"
              onClick={() => handleTabChange('all')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-ink text-white shadow-xs'
                  : 'bg-surface-sunken text-black hover:bg-surface-sunken/80 border border-line/60'
              }`}
            >
              All My Reports ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('active')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'active'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-sunken text-black hover:bg-surface-sunken/80 border border-line/60'
              }`}
            >
              <Clock3 className="h-3.5 w-3.5" />
              Active in Processing ({queueCount})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('solved')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'solved'
                  ? 'bg-emerald-200 text-black border border-emerald-400 shadow-xs'
                  : 'bg-emerald-50 text-black hover:bg-emerald-100 border border-emerald-300'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Solved &amp; Verified ({solvedCount})
            </button>

            {(search || status || q) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ('')
                  setSearch('')
                  setStatus('')
                  setActiveTab('all')
                  const newParams = new URLSearchParams(searchParams)
                  newParams.delete('q')
                  newParams.delete('search')
                  setSearchParams(newParams, { replace: true })
                }}
                className="ml-auto text-xs text-ink-muted hover:text-ink flex items-center gap-1"
              >
                <FilterX className="h-3.5 w-3.5" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Search Bar & Status Dropdown */}
          <form
            className="flex flex-wrap items-center gap-3 pt-1"
            onSubmit={(e) => {
              e.preventDefault()
              applyFilters({ search: q })
            }}
          >
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                id="report-search"
                type="search"
                value={q}
                onChange={(e) => {
                  const val = e.target.value
                  setQ(val)
                  if (!val.trim() && search) {
                    applyFilters({ search: '' })
                  }
                }}
                placeholder="Search description, ID, category or address location…"
                className="w-full rounded-panel border border-line bg-surface-panel py-2 pl-9 pr-4 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Select
              aria-label="Filter by status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => {
                const val = e.target.value
                setStatus(val)
                if (val === 'solved') setActiveTab('solved')
                else if (val) {
                  if (activeTab === 'solved') setActiveTab('all')
                }
              }}
              className="w-56 text-xs"
            />
            <Button type="submit" size="sm" className="text-xs font-semibold">
              Filter
            </Button>
          </form>
        </div>
      </Card>

      {/* REPORTS LIST */}
      {isLoading && <SkeletonCards count={6} className="mt-2" />}

      {isError && (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load reports: {error.message}
          </p>
        </Card>
      )}

      {!isLoading && !isError && filteredReports.length === 0 && (
        <Card>
          <EmptyState
            title={
              activeTab === 'solved'
                ? 'No solved reports found'
                : activeTab === 'active'
                ? 'No active reports in processing'
                : 'No personal reports found'
            }
            message={
              search || status
                ? 'Try a different search query or clear the filters.'
                : activeTab === 'solved'
                ? 'Reports you submitted that have been repaired and verified will appear here.'
                : 'Reports you submit will appear here as they are processed by authorities.'
            }
            action={
              <Link to="/citizen/reports/new">
                <Button size="sm">Submit a Report</Button>
              </Link>
            }
          />
        </Card>
      )}

      {filteredReports.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredReports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>

          {nextCursor && (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={loadMore} loading={isFetching && !!cursor}>
                Load more reports
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
