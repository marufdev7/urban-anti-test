import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Compass,
  FileText,
  FilterX,
  Layers,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'
import { api } from '../../lib/api'
import { categoryLabel, useCategories } from '../../hooks/data'
import { DHAKA_CENTER } from '../../lib/geo'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards } from '../../components/ui/Skeleton'
import CommunityIssueCard from '../../components/issue/CommunityIssueCard'

/** Haversine distance in km between two {lat, lng} coordinates. */
function haversineKm(a, b) {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371 // Earth radius in km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

const DISTANCE_OPTIONS = [
  { value: 'all', label: 'All Distances' },
  { value: '1', label: 'Within 1 km' },
  { value: '3', label: 'Within 3 km' },
  { value: '5', label: 'Within 5 km' },
]

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Processing States' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'triaged', label: 'Under Review' },
]

const SORT_OPTIONS = [
  { value: 'distance', label: 'Nearest to Me' },
  { value: 'severity', label: 'Highest Severity' },
  { value: 'corroboration', label: 'Most Citizens Affected' },
  { value: 'newest', label: 'Newest First' },
]

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 }

/**
 * Processing Queue Page (/citizen/queue):
 * Displays active municipal works and civic issues currently being processed
 * in the citizen's neighborhood / district area.
 * Completely distinct from "My Reports" (/citizen/reports).
 */
export default function ProcessingQueuePage() {
  const { data: categories } = useCategories()
  const [userLocation, setUserLocation] = useState(null)
  const [geoError, setGeoError] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || searchParams.get('search') || ''

  // Filters state
  const [search, setSearch] = useState(urlQuery)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [maxDistanceKm, setMaxDistanceKm] = useState('all')
  const [sortBy, setSortBy] = useState('distance')

  // Keep search state synchronized if URL search parameter changes
  useEffect(() => {
    setSearch(urlQuery)
  }, [urlQuery])

  // Request browser geolocation for proximity calculation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGeoError(false)
        },
        () => {
          setGeoError(true)
          // Fallback to central metropolitan location
          setUserLocation(DHAKA_CENTER)
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60_000 }
      )
    } else {
      setUserLocation(DHAKA_CENTER)
    }
  }, [])

  // 1. Fetch all active municipal issues across the city / district
  const {
    data: issuesData,
    isLoading: isIssuesLoading,
    isError: isIssuesError,
    error: issuesError,
  } = useQuery({
    queryKey: ['issues', 'processing-queue'],
    queryFn: () => api('/issues?limit=100'),
    staleTime: 15_000,
    refetchInterval: 10_000,
  })

  // 2. Fetch logged-in citizen's personal reports to identify own issues
  const { data: myReportsData } = useQuery({
    queryKey: ['reports', 'mine', 'queue-crosscheck'],
    queryFn: () => api('/reports?limit=100'),
    staleTime: 15_000,
  })

  const myReports = myReportsData?.data ?? []
  const myIssueIds = useMemo(() => {
    return new Set(myReports.map((r) => r.issueId).filter(Boolean))
  }, [myReports])

  // Check if citizen has any report currently pending intake/clustering
  const myPendingUnclusteredReports = useMemo(() => {
    return myReports.filter(
      (r) => !r.issueId && r.status !== 'resolved' && r.status !== 'closed' && r.status !== 'hidden'
    )
  }, [myReports])

  // Extract raw issues and filter to only ACTIVE PROCESSING issues
  const rawIssues = issuesData?.data ?? []
  const processingIssues = useMemo(() => {
    return rawIssues
      .filter((i) => {
        // Exclude resolved, closed, or rejected issues — this is the active PROCESSING queue
        return (
          i.status !== 'resolved' &&
          i.status !== 'closed' &&
          i.status !== 'rejected' &&
          i.status !== 'duplicate'
        )
      })
      .map((issue) => {
        const loc = issue.representativeLocation
        const dist =
          userLocation && loc?.lat && loc?.lng
            ? haversineKm(userLocation, { lat: loc.lat, lng: loc.lng })
            : null
        const isMine = myIssueIds.has(issue.id)
        return { ...issue, distance: dist, isMyReport: isMine }
      })
  }, [rawIssues, userLocation, myIssueIds])

  // Count active breakdowns
  const totalProcessingCount = processingIssues.length
  const inProgressCount = processingIssues.filter((i) => i.status === 'in_progress').length
  const acknowledgedCount = processingIssues.filter((i) => i.status === 'acknowledged').length
  const triagedCount = processingIssues.filter((i) => i.status === 'triaged' || i.status === 'submitted').length
  const totalCitizensAffected = processingIssues.reduce(
    (sum, i) => sum + (i.corroborationCount || 1),
    0
  )

  // Filter and sort the processing list
  const filteredAndSortedIssues = useMemo(() => {
    let result = processingIssues.filter((issue) => {
      // 1. Distance filter
      if (maxDistanceKm !== 'all' && issue.distance !== null) {
        const maxDist = parseFloat(maxDistanceKm)
        if (issue.distance > maxDist) return false
      }

      // 2. Status filter
      if (selectedStatus && issue.status !== selectedStatus) {
        return false
      }

      // 3. Category filter
      if (selectedCategory && issue.primaryCategory !== selectedCategory) {
        return false
      }

      // 4. Search query
      if (search.trim()) {
        const term = search.toLowerCase().trim()
        const cleanTerm = term.replace(/^#/, '')
        const desc = (issue.description || '').toLowerCase()
        const cat = (issue.primaryCategory || '').toLowerCase()
        const catLabel = (categoryLabel(issue.primaryCategory) || '').toLowerCase()
        const addr = (issue.representativeLocation?.address || '').toLowerCase()
        const id = (issue.id || '').toLowerCase()
        if (
          !desc.includes(term) &&
          !cat.includes(term) &&
          !catLabel.includes(term) &&
          !addr.includes(term) &&
          !id.includes(cleanTerm)
        ) {
          return false
        }
      }

      return true
    })

    // Sort result
    result.sort((a, b) => {
      if (sortBy === 'distance') {
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      }
      if (sortBy === 'severity') {
        const sevA = (a.severity?.current || a.computedSeverity || 'low').toLowerCase()
        const sevB = (b.severity?.current || b.computedSeverity || 'low').toLowerCase()
        return (SEVERITY_ORDER[sevB] || 0) - (SEVERITY_ORDER[sevA] || 0)
      }
      if (sortBy === 'corroboration') {
        return (b.corroborationCount || 1) - (a.corroborationCount || 1)
      }
      if (sortBy === 'newest') {
        return new Date(b.openedAt || 0) - new Date(a.openedAt || 0)
      }
      return 0
    })

    return result
  }, [processingIssues, maxDistanceKm, selectedStatus, selectedCategory, search, sortBy])

  const handleSearchChange = (val) => {
    setSearch(val)
    const newParams = new URLSearchParams(searchParams)
    if (val.trim()) {
      newParams.set('q', val.trim())
    } else {
      newParams.delete('q')
      newParams.delete('search')
    }
    setSearchParams(newParams, { replace: true })
  }

  const clearAllFilters = () => {
    setSearch('')
    setSelectedCategory('')
    setSelectedStatus('')
    setMaxDistanceKm('all')
    setSortBy('distance')
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('q')
    newParams.delete('search')
    setSearchParams(newParams, { replace: true })
  }

  const hasActiveFilters =
    Boolean(search) || Boolean(selectedCategory) || Boolean(selectedStatus) || maxDistanceKm !== 'all'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Community Issues"
        subtitle="Live feed of active civic issues and municipal operations currently being resolved across your area."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/citizen/map">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5 text-xs font-semibold">
                <Compass className="h-4 w-4 text-primary" />
                Live Area Map
              </Button>
            </Link>
            <Link to="/citizen/reports/new">
              <Button size="sm" className="flex items-center gap-1.5 font-semibold">
                <Plus className="h-4 w-4" />
                Report New Issue
              </Button>
            </Link>
          </div>
        }
      />

      {/* TOP PIPELINE HUD BANNER */}
      <div className="rounded-panel border border-[#005a4c]/30 bg-gradient-to-r from-[#005a4c]/10 via-[#005a4c]/5 to-transparent p-4 text-xs shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#005a4c] text-white shadow-xs">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-ink">
                  Active Community Issues
                </h2>
                <span className="rounded-full bg-[#005a4c] px-2.5 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider">
                  {totalProcessingCount} Active in District
                </span>
              </div>
              <p className="mt-1 text-ink-muted text-xs leading-relaxed max-w-2xl">
                Active municipal works and community issues currently undergoing review, investigation, or field repair by city departments. You can corroborate issues to help accelerate municipal resolution.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/citizen/reports">
              <Button
                variant="secondary"
                size="sm"
                className="flex items-center gap-1.5 text-xs font-semibold border-primary/30 text-primary bg-primary/5 hover:bg-primary/10"
              >
                <FileText className="h-3.5 w-3.5" />
                My Submitted Reports ({myReports.length})
              </Button>
            </Link>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line/60 pt-3">
          <div className="rounded-panel bg-surface-panel/80 p-2.5 border border-line/50">
            <p className="text-[11px] font-medium text-ink-muted">Total Active Issues</p>
            <p className="mt-0.5 text-lg font-bold text-ink">{totalProcessingCount}</p>
          </div>
          <div className="rounded-panel bg-amber-50/70 p-2.5 border border-amber-200">
            <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              In Progress
            </p>
            <p className="mt-0.5 text-lg font-bold text-amber-950">{inProgressCount}</p>
          </div>
          <div className="rounded-panel bg-blue-50/70 p-2.5 border border-blue-200">
            <p className="text-[11px] font-semibold text-blue-800">Acknowledged by Dept</p>
            <p className="mt-0.5 text-lg font-bold text-blue-950">{acknowledgedCount}</p>
          </div>
          <div className="rounded-panel bg-surface-panel/80 p-2.5 border border-line/50">
            <p className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-primary" />
              Citizens Impacted
            </p>
            <p className="mt-0.5 text-lg font-bold text-ink">{totalCitizensAffected}</p>
          </div>
        </div>
      </div>

      {/* UNCLUSTERED PERSONAL REPORTS NOTICE */}
      {myPendingUnclusteredReports.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-panel border border-primary/30 bg-primary/5 p-3.5 text-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-ink">
                You have {myPendingUnclusteredReports.length} pending report{myPendingUnclusteredReports.length === 1 ? '' : 's'} awaiting AI classification.
              </p>
              <p className="text-ink-muted text-[11px]">
                Once verified and clustered, it will automatically appear in this active queue.
              </p>
            </div>
          </div>
          <Link to={`/citizen/reports/${myPendingUnclusteredReports[0].id}`}>
            <Button size="xs" variant="secondary" className="text-xs shrink-0">
              Track My Report
            </Button>
          </Link>
        </div>
      )}

      {/* SEARCH AND FILTER CONTROLS */}
      <Card className="p-4">
        <div className="space-y-3">
          {/* Distance Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-ink-muted mr-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Distance:
              </span>
              {DISTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxDistanceKm(opt.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    maxDistanceKm === opt.value
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-surface-sunken text-black hover:bg-surface-sunken/80 border border-line/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs text-ink-muted hover:text-ink flex items-center gap-1"
              >
                <FilterX className="h-3.5 w-3.5" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Search bar & Secondary filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search active issues by description, category, or area address..."
                className="w-full rounded-panel border border-line bg-surface-panel py-2 pl-9 pr-4 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Status Dropdown */}
            <Select
              aria-label="Filter by processing state"
              options={STATUS_FILTER_OPTIONS}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs"
            />

            {/* Sort Dropdown */}
            <Select
              aria-label="Sort issues by"
              options={SORT_OPTIONS}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-semibold text-ink-muted mr-1">Categories:</span>
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`rounded px-2.5 py-1 text-2xs font-semibold transition ${
                !selectedCategory
                  ? 'bg-ink text-white'
                  : 'bg-surface-sunken text-ink hover:bg-surface-sunken/80 border border-line'
              }`}
            >
              All
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === cat.key ? '' : cat.key)}
                className={`rounded px-2.5 py-1 text-2xs font-semibold transition ${
                  selectedCategory === cat.key
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-sunken text-ink hover:bg-surface-sunken/80 border border-line'
                }`}
              >
                {cat.label?.en || cat.key}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ISSUES LIST GRID */}
      {isIssuesLoading && <SkeletonCards count={6} className="mt-2" />}

      {isIssuesError && (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load community issues: {issuesError?.message}
          </p>
        </Card>
      )}

      {!isIssuesLoading && !isIssuesError && filteredAndSortedIssues.length === 0 && (
        <Card>
          <EmptyState
            title="No community issues found in this view"
            message={
              hasActiveFilters
                ? 'No active community issues match your selected distance or filter criteria. Try expanding distance or clearing filters.'
                : 'There are currently no active community issues in your immediate vicinity.'
            }
            action={
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button variant="secondary" size="sm" onClick={clearAllFilters}>
                    Clear Filters
                  </Button>
                )}
                <Link to="/citizen/reports/new">
                  <Button size="sm">Report a Problem</Button>
                </Link>
              </div>
            }
          />
        </Card>
      )}

      {!isIssuesLoading && filteredAndSortedIssues.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-ink-muted px-1">
            <span>
              Showing <strong>{filteredAndSortedIssues.length}</strong> active community issue{filteredAndSortedIssues.length === 1 ? '' : 's'}
              {userLocation ? ' sorted by proximity' : ''}
            </span>
            <span className="text-[11px]">
              Click &quot;Me Too / Confirm&quot; to corroborate problems in your area
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAndSortedIssues.map((issue) => (
              <CommunityIssueCard
                key={issue.id}
                issue={issue}
                distanceKm={issue.distance}
                isMyReport={issue.isMyReport}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
