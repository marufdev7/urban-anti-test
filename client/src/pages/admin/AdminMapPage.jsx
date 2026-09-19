import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  Compass,
  Crosshair,
  FilterX,
  Flame,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sliders,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { boundaryBBox, DHAKA_CENTER, forwardGeocode } from '../../lib/geo'
import { haversineDistanceMeters, MUNICIPAL_ZONES } from '../../lib/zones'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
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
  { value: 'closed', label: 'Closed' },
]

const RADIUS_OPTIONS = [
  { value: 500, label: '500 meters' },
  { value: 1000, label: '1.0 km' },
  { value: 2000, label: '2.0 km' },
  { value: 3000, label: '3.0 km' },
  { value: 5000, label: '5.0 km' },
]

export default function AdminMapPage() {
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const { data: boundaryFeature, center, polygons } = useCityBoundary()

  // Issue attribute filters
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')

  // Viewport & Area Selection
  const [viewport, setViewport] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState('all')
  const [customBounds, setCustomBounds] = useState(null)
  const [mapCenter, setMapCenter] = useState(null)
  const [mapZoom, setMapZoom] = useState(13)

  // Area Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMarker, setSearchMarker] = useState(null)

  // Focal Radius Inspection Area Tool
  const [focalMode, setFocalMode] = useState(false)
  const [focalRadius, setFocalRadius] = useState(1000)
  const [focalCenter, setFocalCenter] = useState(null)

  // Boundary Configuration Dialog
  const [boundaryModalOpen, setBoundaryModalOpen] = useState(false)
  const [boundaryPreset, setBoundaryPreset] = useState('dma')
  const [customBoundaryName, setCustomBoundaryName] = useState('')
  const [boundaryError, setBoundaryError] = useState(null)
  const [boundarySuccess, setBoundarySuccess] = useState(false)

  // Determine active zone object
  const currentZone = MUNICIPAL_ZONES.find((z) => z.id === selectedZoneId) || MUNICIPAL_ZONES[0]

  // Bounding box for fetching issues
  const activeBBox =
    viewport?.bbox ||
    currentZone.bbox ||
    (boundaryFeature ? boundaryBBox(boundaryFeature) : '90.30,23.65,90.52,23.90')
  const activeZoom = viewport?.zoom ?? mapZoom ?? 13

  const queryParams = new URLSearchParams({
    bbox: activeBBox,
    zoom: String(activeZoom),
  })
  if (category) queryParams.set('category', category)
  if (severity) queryParams.set('severity', severity)
  if (status) queryParams.set('status', status)

  const { data: mapData, isLoading } = useQuery({
    queryKey: ['map-issues-admin', { bbox: activeBBox, zoom: activeZoom, category, severity, status }],
    queryFn: () => api(`/map/issues?${queryParams.toString()}`),
    enabled: !!activeBBox,
    staleTime: 15_000,
  })

  const rawFeatures = mapData?.features ?? []

  // If focal circle inspection is active, filter features inside the radius
  const features = focalCenter
    ? rawFeatures.filter((f) => {
        const [lng, lat] = f.geometry.coordinates
        return haversineDistanceMeters(focalCenter.lat, focalCenter.lng, lat, lng) <= focalRadius
      })
    : rawFeatures

  const hasFilters = Boolean(category || severity || status || selectedZoneId !== 'all' || focalCenter)

  const clearAllFilters = () => {
    setCategory('')
    setSeverity('')
    setStatus('')
    setSelectedZoneId('all')
    setCustomBounds(null)
    setFocalCenter(null)
    setFocalMode(false)
    setSearchMarker(null)
    setSearchQuery('')
    setMapCenter(center || DHAKA_CENTER)
    setMapZoom(12)
  }

  // Handle Zone Selection
  const handleZoneSelect = (zoneId) => {
    setSelectedZoneId(zoneId)
    const zone = MUNICIPAL_ZONES.find((z) => z.id === zoneId)
    if (zone) {
      if (zone.id === 'all') {
        setCustomBounds(null)
        setMapCenter(center || DHAKA_CENTER)
        setMapZoom(12)
      } else {
        setCustomBounds(zone.bounds)
        setMapCenter(zone.center)
        setMapZoom(zone.zoom)
      }
    }
  }

  // Handle Location Search
  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const result = await forwardGeocode(searchQuery.trim() + ', Dhaka, Bangladesh')
      if (result) {
        setSearchMarker({ lat: result.lat, lng: result.lng, label: result.displayName })
        setMapCenter({ lat: result.lat, lng: result.lng })
        setMapZoom(15)
        setCustomBounds(null)
      }
    } catch {
    } finally {
      setSearching(false)
    }
  }

  // Handle Map Click for Focal Area Inspection
  const handleMapClick = (latlng) => {
    if (focalMode) {
      setFocalCenter(latlng)
      setFocalMode(false) // Placed the center
    }
  }

  // Mutation to replace municipal boundary
  const replaceBoundaryMutation = useMutation({
    mutationFn: (body) => api('/meta/city-boundary', { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['city-boundary'] })
      queryClient.invalidateQueries({ queryKey: ['map-issues-admin'] })
      setBoundarySuccess(true)
      setBoundaryError(null)
      setTimeout(() => {
        setBoundarySuccess(false)
        setBoundaryModalOpen(false)
      }, 1500)
    },
    onError: (err) => setBoundaryError(err.message),
  })

  const handleSaveBoundary = () => {
    setBoundaryError(null)
    let selectedGeo = null
    let name = ''

    if (boundaryPreset === 'dncc') {
      name = customBoundaryName.trim() || `Dhaka North City Corporation (${new Date().toLocaleDateString()})`
      selectedGeo = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [90.330, 23.765],
              [90.330, 23.830],
              [90.370, 23.900],
              [90.430, 23.900],
              [90.450, 23.840],
              [90.440, 23.775],
              [90.380, 23.765],
              [90.330, 23.765],
            ],
          ],
        ],
      }
    } else if (boundaryPreset === 'dscc') {
      name = customBoundaryName.trim() || `Dhaka South City Corporation (${new Date().toLocaleDateString()})`
      selectedGeo = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [90.360, 23.765],
              [90.445, 23.765],
              [90.445, 23.710],
              [90.410, 23.680],
              [90.360, 23.690],
              [90.355, 23.730],
              [90.360, 23.765],
            ],
          ],
        ],
      }
    } else {
      name = customBoundaryName.trim() || `Dhaka Metropolitan Area (${new Date().toLocaleDateString()})`
      selectedGeo = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [90.320, 23.680],
              [90.320, 23.900],
              [90.520, 23.900],
              [90.520, 23.680],
              [90.320, 23.680],
            ],
          ],
        ],
      }
    }

    replaceBoundaryMutation.mutate({
      name,
      geometry: selectedGeo,
    })
  }

  // Quick tally of visible severities
  const criticalOrHigh = features.filter((f) =>
    ['critical', 'high'].includes(f.properties?.severity),
  ).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="City-Wide Incident Map"
        subtitle="Administrative map overview of municipal incidents, jurisdictional zones, and hazard distribution."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCustomBounds(null)
                setSelectedZoneId('all')
                setMapCenter(center || DHAKA_CENTER)
                setMapZoom(12)
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fit Full City
            </Button>
            <Button
              size="sm"
              onClick={() => setBoundaryModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Settings className="h-3.5 w-3.5" />
              Boundary Settings
            </Button>
          </div>
        }
      />

      {/* TOP CONTROL 1: Area & Zone Selection Bar */}
      <Card className="p-3 sm:p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Municipal Area &amp; Jurisdiction
              </span>
            </div>

            {/* Address / Location Search Bar */}
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative w-64 sm:w-80">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ward, road, landmark (e.g. Mirpur 10)..."
                  className="w-full rounded-button border border-line bg-surface py-1.5 pl-8 pr-8 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button size="sm" type="submit" disabled={searching} className="text-xs">
                {searching ? <Spinner size="sm" /> : 'Search'}
              </Button>
            </form>
          </div>

          {/* Quick Zone Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-ink-muted mr-1">Quick Areas:</span>
            {MUNICIPAL_ZONES.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => handleZoneSelect(zone.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedZoneId === zone.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface-sunken text-ink hover:bg-surface-sunken/80 border border-line/60'
                }`}
              >
                {zone.nameEn}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* TOP CONTROL 2: Incident Filters & Inspection Tool */}
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
            options={[
              { value: '', label: 'All Categories' },
              ...(categories ?? []).map((c) => ({ value: c.key, label: c.label.en })),
            ]}
          />

          <Select
            aria-label="Filter by severity"
            className="w-32"
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

          <div className="h-5 w-px bg-line" />

          {/* Focal Area Radius Inspection Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={focalMode || focalCenter ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (focalCenter) {
                  setFocalCenter(null)
                  setFocalMode(false)
                } else {
                  setFocalMode(!focalMode)
                }
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Crosshair className="h-3.5 w-3.5" />
              {focalCenter ? 'Clear Focal Area' : focalMode ? 'Click Map to Pin' : 'Focal Radius Tool'}
            </Button>

            {(focalMode || focalCenter) && (
              <Select
                aria-label="Focal radius"
                className="w-28 text-xs"
                value={focalRadius}
                onChange={(e) => setFocalRadius(Number(e.target.value))}
                options={RADIUS_OPTIONS}
              />
            )}
          </div>

          {hasFilters && (
            <Button variant="ghost" onClick={clearAllFilters} className="text-xs text-ink-muted ml-1">
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Reset All
            </Button>
          )}

          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-status-critical font-medium">
              <Flame className="h-3.5 w-3.5" />
              {criticalOrHigh} High / Critical
            </span>
            <span className="font-medium text-ink">
              {features.length} visible incident{features.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </Card>

      {/* ACTIVE AREA / FOCAL HUD BANNER */}
      {(focalMode || focalCenter || selectedZoneId !== 'all') && (
        <div className="flex items-center justify-between rounded-panel border border-primary/30 bg-primary-soft/50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-ink">
            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
            <div>
              <span className="font-bold text-primary">
                {focalCenter
                  ? `Focal Inspection: ${(focalRadius / 1000).toFixed(1)} km Radius`
                  : `Active Jurisdiction: ${currentZone.nameEn} (${currentZone.nameBn})`}
              </span>
              <span className="ml-2 text-ink-muted">
                {focalCenter
                  ? `Center at (${focalCenter.lat.toFixed(4)}, ${focalCenter.lng.toFixed(4)}) • ${features.length} incidents found inside`
                  : `Framing bounds • ${features.length} incidents in zone`}
              </span>
            </div>
          </div>
          {focalMode && (
            <span className="rounded bg-primary px-2 py-0.5 font-semibold text-white animate-pulse">
              Click anywhere on the map to place inspection center
            </span>
          )}
          {focalCenter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFocalCenter(null)}
              className="text-xs text-ink-muted hover:text-status-critical"
            >
              Remove Circle
            </Button>
          )}
        </div>
      )}

      {/* MAP CONTAINER */}
      <div
        className={`h-[650px] w-full overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel relative ${
          focalMode ? 'cursor-crosshair' : ''
        }`}
      >
        <InteractiveMap
          center={mapCenter || center || DHAKA_CENTER}
          zoom={mapZoom}
          bounds={customBounds}
          polygons={polygons}
          activeZonePolygon={currentZone?.polygon}
          focalCircle={focalCenter ? { center: focalCenter, radius: focalRadius } : null}
          searchMarker={searchMarker}
          features={features}
          onViewportChange={setViewport}
          onMapClick={handleMapClick}
          getDetailLink={(id) => `/admin/queue`}
          className="h-full w-full"
        />
      </div>

      {/* MUNICIPAL BOUNDARY MANAGEMENT DIALOG */}
      <Dialog
        open={boundaryModalOpen}
        onClose={() => setBoundaryModalOpen(false)}
        title="Municipal Boundary &amp; Jurisdiction Configuration"
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="rounded-panel border border-line bg-surface-sunken p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Current Active City Boundary
            </p>
            <p className="mt-1 font-semibold text-ink">
              {boundaryFeature?.properties?.name ?? 'Dhaka Metropolitan Area (Default)'}
            </p>
            <p className="mt-0.5 text-ink-muted font-mono text-[11px]">
              Active Bounding Box: {boundaryFeature ? boundaryBBox(boundaryFeature) : '90.30, 23.65, 90.52, 23.90'}
            </p>
          </div>

          <div>
            <label className="block font-semibold text-ink">
              Select Jurisdiction Preset
            </label>
            <Select
              className="mt-1 w-full"
              value={boundaryPreset}
              onChange={(e) => setBoundaryPreset(e.target.value)}
              options={[
                { value: 'dma', label: 'Dhaka Metropolitan Area (Greater DMA - Standard)' },
                { value: 'dncc', label: 'Dhaka North City Corporation (DNCC Jurisdiction)' },
                { value: 'dscc', label: 'Dhaka South City Corporation (DSCC Jurisdiction)' },
              ]}
            />
            <p className="mt-1 text-ink-muted text-[11px]">
              Sets the official administrative perimeter used for citizen report intake and spatial aggregation.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-ink">
              Custom Boundary Name (Optional)
            </label>
            <Input
              value={customBoundaryName}
              onChange={(e) => setCustomBoundaryName(e.target.value)}
              placeholder="e.g. Dhaka Municipal Boundary 2026-Q3"
              className="mt-1"
            />
          </div>

          {boundaryError && (
            <p className="text-xs text-status-critical" role="alert">
              {boundaryError}
            </p>
          )}

          {boundarySuccess && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-status-resolved">
              <Check className="h-4 w-4" /> Municipal boundary updated and activated successfully!
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBoundaryModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={replaceBoundaryMutation.isPending || boundarySuccess}
              onClick={handleSaveBoundary}
            >
              {replaceBoundaryMutation.isPending ? <Spinner size="sm" /> : 'Save & Activate Boundary'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
