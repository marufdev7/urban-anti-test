import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FilterX, Layers, MapPin } from 'lucide-react'
import { api } from '../../lib/api'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { boundaryBBox, DHAKA_CENTER } from '../../lib/geo'
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
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

export default function CitizenMapPage() {
  const { data: categories } = useCategories()
  const { data: boundaryFeature, center, polygons, isLoading: boundaryLoading } = useCityBoundary()

  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [viewport, setViewport] = useState(null)
  const [selectedIssue, setSelectedIssue] = useState(null)

  // Use current map viewport bbox, or fallback to full city boundary bbox
  const activeBBox = viewport?.bbox || (boundaryFeature ? boundaryBBox(boundaryFeature) : '90.30,23.65,90.52,23.90')
  const activeZoom = viewport?.zoom ?? 13

  // Query issues on the map
  const queryParams = new URLSearchParams({
    bbox: activeBBox,
    zoom: String(activeZoom),
  })
  if (category) queryParams.set('category', category)
  if (severity) queryParams.set('severity', severity)
  if (status) queryParams.set('status', status)

  const { data: mapData, isLoading: mapLoading, isFetching } = useQuery({
    queryKey: ['map-issues', { bbox: activeBBox, zoom: activeZoom, category, severity, status }],
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

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...(categories ?? [])
      .filter((c) => c.active)
      .map((c) => ({ value: c.key, label: c.label.en })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Public Safety Map"
        subtitle="Explore active municipal reports and safety issues across Dhaka."
      />

      {/* Filter bar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Filters:</span>
          </div>

          <Select
            aria-label="Filter by category"
            className="w-44"
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
              <span>{features.length} visible incident{features.length === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Main Map View */}
      <div className="relative h-[650px] w-full overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel">
        <InteractiveMap
          center={center || DHAKA_CENTER}
          zoom={13}
          polygons={polygons}
          features={features}
          onViewportChange={setViewport}
          onSelectIssue={(f) => setSelectedIssue(f)}
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
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Status: <span className="font-medium text-ink capitalize">{selectedIssue.properties?.status?.replaceAll('_', ' ') ?? 'Triaged'}</span>
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
          </div>
        )}
      </div>
    </div>
  )
}
