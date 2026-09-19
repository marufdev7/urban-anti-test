import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FilterX, Layers, ShieldCheck, User } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { boundaryBBox, DHAKA_CENTER } from '../../lib/geo'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
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
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
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

  const activeBBox = viewport?.bbox || (boundaryFeature ? boundaryBBox(boundaryFeature) : '90.30,23.65,90.52,23.90')
  const activeZoom = viewport?.zoom ?? 13

  const queryParams = new URLSearchParams({
    bbox: activeBBox,
    zoom: String(activeZoom),
  })
  if (category) queryParams.set('category', category)
  if (severity) queryParams.set('severity', severity)
  if (status) queryParams.set('status', status)
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
        subtitle={`Live incident map for municipal authority teams. Scope: ${
          user?.categoryScope?.length ? user.categoryScope.join(', ') : 'All categories'
        }`}
      />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
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
            options={[{ value: 'me', label: 'Assigned to me' }]}
            placeholder="Any Assignment"
          />

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-xs text-ink-muted">
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          )}

          <div className="ml-auto text-xs text-ink-muted">
            {isFetching ? (
              <span>Updating map…</span>
            ) : (
              <span>{features.length} active incident{features.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      </Card>

      <div className="h-[650px] w-full overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel">
        <InteractiveMap
          center={center || DHAKA_CENTER}
          zoom={13}
          polygons={polygons}
          features={features}
          onViewportChange={setViewport}
          getDetailLink={(id) => `/authority/queue/${id}`}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
