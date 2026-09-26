import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  FilterX,
  MapPin,
  Plus,
  Search,
  Users,
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
import CommunityIssueCard from '../../components/issue/CommunityIssueCard'

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'solved', label: 'Solved / Resolved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'triaged', label: 'Under Review' },
  { value: 'processing', label: 'Processing' },
  { value: 'submitted', label: 'Submitted' },
]

export default function MyReportsPage() {
  const location = useLocation()
  const isQueueRoute = location.pathname === '/citizen/queue'

  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  // active tab: 'all' | 'queue' | 'solved' | 'community'
  const [activeTab, setActiveTab] = useState(isQueueRoute ? 'queue' : 'all')
  const [cursor, setCursor] = useState(null)
  const [stale, setStale] = useState([]) // accumulated earlier pages
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 }
      )
    }
  }, [])

  const params = new URLSearchParams({ limit: '50' })
  if (search) params.set('q', search)
  // Backend only recognizes model status (submitted, processing, triaged)
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

  // Community issues query (unresolved issues across neighborhood)
  const { data: communityData, isLoading: isCommunityLoading } = useQuery({
    queryKey: ['issues', 'community', 'unresolved'],
    queryFn: () => api('/issues?limit=100'),
    staleTime: 15_000,
    refetchInterval: 10_000,
  })

  const rawCommunityIssues = communityData?.data ?? []
  const unresolvedCommunityIssues = useMemo(() => {
    const list = rawCommunityIssues.filter((i) => i.status !== 'resolved' && i.status !== 'closed')
    if (!userLocation) return list.map((issue) => ({ ...issue, distance: null }))

    return list
      .map((issue) => {
        const loc = issue.representativeLocation
        const dist =
          loc?.lat && loc?.lng
            ? haversineKm(userLocation, { lat: loc.lat, lng: loc.lng })
            : null
        return { ...issue, distance: dist }
      })
      .sort((a, b) => {
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      })
  }, [rawCommunityIssues, userLocation])

  const communityCount = unresolvedCommunityIssues.length

  const filteredCommunityIssues = useMemo(() => {
    return unresolvedCommunityIssues.filter((issue) => {
      if (search) {
        const term = search.toLowerCase()
        const desc = (issue.description || '').toLowerCase()
        const cat = (issue.primaryCategory || '').toLowerCase()
        const id = (issue.id || '').toLowerCase()
        if (!desc.includes(term) && !cat.includes(term) && !id.includes(term)) {
          return false
        }
      }
      if (status) {
        if (status === 'in_progress' && issue.status !== 'in_progress') return false
        if (status !== 'in_progress' && issue.status !== status) return false
      }
      return true
    })
  }, [unresolvedCommunityIssues, search, status])

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
    if (activeTab === 'queue' && isSolved) return false

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
    if ('search' in next) setSearch(next.search)
    if ('status' in next) setStatus(next.status)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'solved') setStatus('solved')
    else if (tab === 'queue') setStatus('')
    else if (tab === 'community') setStatus('')
    else setStatus('')
  }

  const loadMore = () => {
    setStale(allRawReports)
    setCursor(nextCursor)
  }

  const pageTitle = isQueueRoute ? 'Processing Queue' : 'My Reports'
  const pageSubtitle = isQueueRoute
    ? 'Track your active civic incident reports progressing through review, municipal dispatch, and repair.'
    : 'Comprehensive archive of all your civic incident submissions, status tracking, and verified resolutions.'

  return (
    <div>
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <Link to="/citizen/reports/new">
            <Button size="sm" className="flex items-center gap-1.5 font-semibold">
              <Plus className="h-4 w-4" />
              Submit New Report
            </Button>
          </Link>
        }
      />

      {/* TOP PIPELINE HUD BANNER */}
      {activeTab === 'community' ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[#005a4c]/40 bg-[#005a4c]/5 p-4 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#005a4c] text-white">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">Nearby Community Issues (আমার এলাকার অন্যান্য নাগরিকদের সমস্যা)</span>
                <span className="rounded bg-[#005a4c]/15 px-2 py-0.5 text-[10px] font-bold text-[#005a4c] uppercase">
                  {communityCount} Active in District
                </span>
              </div>
              <p className="mt-0.5 text-ink-muted text-xs">
                Active municipal infrastructure issues reported by other citizens in your area. Click &quot;Me Too / Confirm&quot; to corroborate problems and speed up municipal resolution.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/citizen/map">
              <Button variant="secondary" size="sm" className="text-xs">
                View on Live Map
              </Button>
            </Link>
          </div>
        </div>
      ) : isQueueRoute ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-primary/40 bg-primary-soft/50 p-4 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">Active Resolution Queue</span>
                <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                  {queueCount} In Queue
                </span>
              </div>
              <p className="mt-0.5 text-ink-muted text-xs">
                Your submitted problems currently awaiting classification, review, or municipal field repairs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/citizen/reports">
              <Button variant="secondary" size="sm" className="text-xs">
                View All Archive ({totalCount})
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface-panel p-4 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">Citizen Submissions Record</span>
                <span className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-black uppercase">
                  {solvedCount} Solved
                </span>
              </div>
              <p className="mt-0.5 text-ink-muted text-xs">
                Total {totalCount} report{totalCount === 1 ? '' : 's'} recorded • {queueCount} currently active in progress.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/citizen/queue">
              <Button variant="secondary" size="sm" className="text-xs">
                Open Active Queue ({queueCount})
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* SEARCH & FILTER CONTROLS */}
      <Card className="mb-5 p-4">
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
              All Reports ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('queue')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'queue'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-sunken text-black hover:bg-surface-sunken/80 border border-line/60'
              }`}
            >
              <Clock3 className="h-3.5 w-3.5" />
              In Queue / Active ({queueCount})
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
              Solved / Resolved ({solvedCount})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('community')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'community'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'bg-[#005a4c]/10 text-[#005a4c] hover:bg-[#005a4c]/20 border border-[#005a4c]/30'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Nearby Community Issues ({communityCount})
            </button>

            {(search || status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ('')
                  setSearch('')
                  setStatus('')
                  setActiveTab(isQueueRoute ? 'queue' : 'all')
                }}
                className="ml-auto text-xs text-ink-muted hover:text-ink"
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
                onChange={(e) => setQ(e.target.value)}
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
              className="w-48 text-xs"
            />
            <Button type="submit" size="sm" className="text-xs font-semibold">
              Filter
            </Button>
          </form>
        </div>
      </Card>

      {/* TAB CONTENT: COMMUNITY ISSUES */}
      {activeTab === 'community' ? (
        <>
          {isCommunityLoading && <SkeletonCards count={6} className="mt-2" />}

          {!isCommunityLoading && filteredCommunityIssues.length === 0 && (
            <Card>
              <EmptyState
                title="No community issues found"
                message={
                  search || status
                    ? 'No unresolved community issues match your search criteria. Try clearing filters.'
                    : 'There are currently no active unresolved community issues in your district.'
                }
                action={
                  <Link to="/citizen/reports/new">
                    <Button size="sm">Report a Problem</Button>
                  </Link>
                }
              />
            </Card>
          )}

          {!isCommunityLoading && filteredCommunityIssues.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCommunityIssues.map((issue) => (
                <CommunityIssueCard
                  key={issue.id}
                  issue={issue}
                  distanceKm={issue.distance}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* TAB CONTENT: CITIZEN PERSONAL REPORTS */
        <>
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
                    : activeTab === 'queue'
                    ? 'No active reports in queue'
                    : 'No reports found'
                }
                message={
                  search || status
                    ? 'Try a different search query or clear the filters.'
                    : activeTab === 'solved'
                    ? 'Reports that have been resolved and verified will appear here.'
                    : 'Reports you submit will appear here as they are processed.'
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
        </>
      )}
    </div>
  )
}
