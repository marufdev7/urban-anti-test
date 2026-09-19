import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, FilterX, Flame, Layers, Shield } from 'lucide-react'
import { api } from '../../lib/api'
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
  { value: 'triaged', label: 'Triaged' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

export default function AdminMapPage() {
  const { data: categories } = useCategories()
  const { data: boundaryFeature, center, polygons } = useCityBoundary()

  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
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

  const { data: mapData, isLoading, isFetching } = useQuery({
    queryKey: ['map-issues-admin', { bbox: activeBBox, zoom: activeZoom, category, severity, status }],
    queryFn: () => api(`/map/issues?${queryParams.toString()}`),
    enabled: !!activeBBox,
    staleTime: 15_000,
  })

  const features = mapData?.features ?? []
  const hasFilters = Boolean(category || severity || status)

  const clearFilters = () => {
    setCategory('')
    setSeverity('')
    setStatus('')
  }

  // Quick tally of visible severities
  const criticalOrHigh = features.filter((f) =>
    ['critical', 'high'].includes(f.properties?.severity),
  ).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="City-Wide Incident Map"
        subtitle="Full administrative map overview of municipal reports, triage status, and hazard distribution."
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
            options={[
              { value: '', label: 'All Categories' },
              ...(categories ?? []).map((c) => ({ value: c.key, label: c.label.en })),
            ]}
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

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-xs text-ink-muted">
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          )}

          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-status-critical font-medium">
              <Flame className="h-3.5 w-3.5" />
              {criticalOrHigh} High / Critical
            </span>
            <span className="text-ink-muted">
              {features.length} visible incident{features.length === 1 ? '' : 's'}
            </span>
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
          getDetailLink={(id) => `/admin/queue`}
          className="h-full w-full"
        />
      </div>
    </div>
  )
}
