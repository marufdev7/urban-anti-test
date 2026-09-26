import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FilterX, Layers, MapPin, ShieldCheck, UserCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { boundaryBBox, DHAKA_CENTER } from '../../lib/geo'
import { BANGLADESH_CITIES, getJurisdictionLabel } from '../../lib/zones'
import { shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import StatusBadge from '../../components/ui/StatusBadge'
import InteractiveMap from '../../components/InteractiveMap'

const SEVERITIES = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'triaged', label: 'Under Review' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

const ASSIGNMENT_OPTIONS = [
  { value: '', label: 'All Assignments' },
  { value: 'me', label: 'Assigned to Me' },
]

export default function AuthorityMapPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const { data: boundaryFeature, center, polygons } = useCityBoundary()

  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [viewport, setViewport] = useState(null)
  const [selectedIssue, setSelectedIssue] = useState(null)

  const assignedCity = useMemo(() => {
    if (!user?.assignedArea) return null
    return BANGLADESH_CITIES.find(
      (c) => c.id.toLowerCase() === user.assignedArea.toLowerCase(),
    )
  }, [user?.assignedArea])

  const mapCenter = assignedCity ? [assignedCity.center.lat, assignedCity.center.lng] : (center || DHAKA_CENTER)
  const mapZoom = assignedCity ? assignedCity.zoom : 13
  const mapPolygons = assignedCity?.boundaryPolygon ? [assignedCity.boundaryPolygon] : polygons

  const activeBBox =
    viewport?.bbox ||
    (assignedCity
      ? assignedCity.bbox
      : boundaryFeature
        ? boundaryBBox(boundaryFeature)
        : '90.30,23.65,90.52,23.90')
  const activeZoom = viewport?.zoom ?? mapZoom

  const queryParams = new URLSearchParams({
    bbox: activeBBox,
    zoom: String(activeZoom),
  })
  if (category) queryParams.set('category', category)
  if (severity) queryParams.set('severity', severity)
  if (status) queryParams.set('status', status === 'resolved' ? 'resolved,closed' : status)
  if (assignedTo === 'me') queryParams.set('assignedTo', 'me')

  const { data: mapData, isLoading, isFetching } = useQuery({
    queryKey: ['map-issues-authority', { bbox: activeBBox, zoom: activeZoom, category, severity, status, assignedTo }],
    queryFn: () => api(`/map/issues?${queryParams.toString()}`),
    enabled: !!activeBBox,
    staleTime: 15_000,
  })

  const features = mapData?.features ?? []
  const hasFilters = Boolean(category || severity || status || assignedTo)

  const clearFilters = () => {
    setCategory('')
    setSeverity('')
    setStatus('')
    setAssignedTo('')
  }

  // Filter categories down to those in authority scope if scoped
  const scopeSet = new Set(user?.categoryScope ?? [])
  const availableCategories = (categories ?? []).filter(
    (c) => c.active && (scopeSet.size === 0 || scopeSet.has(c.key)),
  )

  const categoryOptions = [
    { value: '', label: 'All In-Scope Categories' },
    ...availableCategories.map((c) => ({ value: c.key, label: c.label.en })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Jurisdiction Map"
        subtitle={`Live incident map for municipal authority teams. Jurisdiction: ${getJurisdictionLabel(
          user?.assignedArea,
        )} • Scope: ${
          user?.categoryScope?.length ? user.categoryScope.join(', ') : 'All categories'
        }`}
      />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          {user?.assignedArea && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              <MapPin className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>{getJurisdictionLabel(user.assignedArea)}</span>
            </span>
          )}

          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Filters:</span>
          </div>

          <Select
            aria-label="Filter by category"
            className="w-48"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categoryOptions}
          />

          <Select
            aria-label="Filter by severity"
            className="w-36"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={SEVERITIES}
          />

          <Select
            aria-label="Filter by status"
            className="w-36"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUSES}
          />

          <Select
            aria-label="Filter by assignment"
            className="w-40"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            options={ASSIGNMENT_OPTIONS}
          />

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-xs text-ink-muted">
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            {assignedTo === 'me' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <UserCheck className="h-3.5 w-3.5" />
                {features.length} Assigned
              </span>
            )}
            {isFetching ? (
              <span>Updating map…</span>
            ) : (
              <span>{features.length} active incident{features.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      </Card>

      <div className="relative h-[650px] w-full overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel">
        <InteractiveMap
          center={mapCenter}
          zoom={mapZoom}
          polygons={mapPolygons}
          features={features}
          onViewportChange={setViewport}
          onSelectIssue={(f) => setSelectedIssue(f)}
          getDetailLink={(id) => `/authority/queue/${id}`}
          className="h-full w-full"
        />

        {/* Selected Issue Preview Card (Bottom Overlay) */}
        {selectedIssue && (
          <div className="absolute bottom-4 left-4 right-4 z-20 mx-auto max-w-lg rounded-panel border border-line bg-surface-panel p-4 shadow-menu sm:left-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">
                    Issue #{shortId(selectedIssue.id)}
                  </span>
                  <StatusBadge
                    tone={
                      selectedIssue.properties?.severity === 'critical'
                        ? 'critical'
                        : selectedIssue.properties?.severity === 'high'
                          ? 'high'
                          : selectedIssue.properties?.severity === 'medium'
                            ? 'medium'
                            : 'low'
                    }
                    label={selectedIssue.properties?.severity ?? 'Medium'}
                  />
                  {selectedIssue.properties?.assignedTo && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      <UserCheck className="h-3 w-3" />
                      Assigned
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Status: <span className="font-medium text-ink capitalize">{selectedIssue.properties?.status === 'triaged' ? 'Under Review' : (selectedIssue.properties?.status?.replaceAll('_', ' ') ?? 'Under Review')}</span>
                  {selectedIssue.properties?.corroborationCount > 1 && (
                    <span> · {selectedIssue.properties.corroborationCount} confirmations</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIssue(null)}
                aria-label="Close preview"
                className="rounded p-1 text-ink-muted hover:bg-surface hover:text-ink"
              >
                &times;
              </button>
            </div>
            <Link
              to={`/authority/queue/${selectedIssue.id}`}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#005a4c] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#004a3e] active:scale-[0.99]"
            >
              <MapPin className="h-3.5 w-3.5" />
              Open in Work Queue
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
