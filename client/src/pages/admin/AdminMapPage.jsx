import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  Compass,
  Crosshair,
  Edit3,
  FilterX,
  Flame,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  PenTool,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  Sliders,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { boundaryBBox, DHAKA_CENTER, forwardGeocode } from '../../lib/geo'
import {
  BANGLADESH_CITIES,
  haversineDistanceMeters,
  isPointInPolygon,
  pointsToGeoJsonMultiPolygon,
} from '../../lib/zones'
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

  // City & Jurisdiction Selection
  const [selectedCityId, setSelectedCityId] = useState('dhaka')
  const [selectedZoneId, setSelectedZoneId] = useState('dhaka_all')
  const [viewport, setViewport] = useState(null)
  const [customBounds, setCustomBounds] = useState(null)
  const [mapCenter, setMapCenter] = useState(null)
  const [mapZoom, setMapZoom] = useState(12)
  const [showAllZones, setShowAllZones] = useState(true)

  // Interactive Area Marking / Polygon Drawing
  const [isDrawingArea, setIsDrawingArea] = useState(false)
  const [drawnPoints, setDrawnPoints] = useState([]) // Array of [lat, lng]
  const [customMarkedArea, setCustomMarkedArea] = useState(null) // Array of [lat, lng]

  // Address Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMarker, setSearchMarker] = useState(null)

  // Focal Radius Inspection Area Tool
  const [focalMode, setFocalMode] = useState(false)
  const [focalRadius, setFocalRadius] = useState(1000)
  const [focalCenter, setFocalCenter] = useState(null)

  // Boundary Configuration Dialog
  const [boundaryModalOpen, setBoundaryModalOpen] = useState(false)
  const [boundarySource, setBoundarySource] = useState('current_city')
  const [customBoundaryName, setCustomBoundaryName] = useState('')
  const [boundaryError, setBoundaryError] = useState(null)
  const [boundarySuccess, setBoundarySuccess] = useState(false)

  // Determine current active city and zone objects
  const currentCity = BANGLADESH_CITIES.find((c) => c.id === selectedCityId) || BANGLADESH_CITIES[0]
  const cityZones = currentCity.zones || []
  const currentZone = cityZones.find((z) => z.id === selectedZoneId) || cityZones[0] || {}

  // Bounding box for fetching issues
  const activeBBox =
    viewport?.bbox ||
    currentZone.bbox ||
    currentCity.bbox ||
    (boundaryFeature ? boundaryBBox(boundaryFeature) : '90.30,23.65,90.52,23.90')
  const activeZoom = viewport?.zoom ?? mapZoom ?? 12

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

  // Filter features if custom marked area polygon or focal circle is active
  let features = rawFeatures

  if (customMarkedArea && customMarkedArea.length >= 3) {
    features = features.filter((f) => {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) return false
      const [lng, lat] = coords
      return isPointInPolygon({ lat, lng }, customMarkedArea)
    })
  }

  if (focalCenter) {
    features = features.filter((f) => {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) return false
      const [lng, lat] = coords
      return haversineDistanceMeters(focalCenter.lat, focalCenter.lng, lat, lng) <= focalRadius
    })
  }

  const hasFilters = Boolean(
    category ||
    severity ||
    status ||
    focalCenter ||
    customMarkedArea ||
    (currentZone && !currentZone.id.endsWith('_all'))
  )

  const clearAllFilters = () => {
    setCategory('')
    setSeverity('')
    setStatus('')
    const defaultZone = cityZones[0]?.id || 'all'
    setSelectedZoneId(defaultZone)
    setCustomBounds(currentCity.bounds)
    setMapCenter(currentCity.center)
    setMapZoom(currentCity.zoom)
    setFocalCenter(null)
    setFocalMode(false)
    setCustomMarkedArea(null)
    setDrawnPoints([])
    setIsDrawingArea(false)
    setSearchMarker(null)
    setSearchQuery('')
  }

  // Handle City Change
  const handleCitySelect = (cityId) => {
    setSelectedCityId(cityId)
    const city = BANGLADESH_CITIES.find((c) => c.id === cityId)
    if (city) {
      const firstZone = city.zones?.[0]?.id || 'all'
      setSelectedZoneId(firstZone)
      setCustomBounds(city.bounds)
      setMapCenter(city.center)
      setMapZoom(city.zoom)
      setCustomMarkedArea(null)
      setDrawnPoints([])
      setIsDrawingArea(false)
      setFocalCenter(null)
      setFocalMode(false)
      setSearchMarker(null)
    }
  }

  // Handle Zone Selection
  const handleZoneSelect = (zoneId) => {
    setSelectedZoneId(zoneId)
    const zone = cityZones.find((z) => z.id === zoneId)
    if (zone) {
      if (zone.bounds) {
        setCustomBounds(zone.bounds)
        setMapCenter(zone.center)
        setMapZoom(zone.zoom)
      } else {
        setCustomBounds(currentCity.bounds)
        setMapCenter(currentCity.center)
        setMapZoom(currentCity.zoom)
      }
    }
  }

  // Handle Location Search
  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const cityQuery = `${searchQuery.trim()}, ${currentCity.nameEn.split(' ')[0]}, Bangladesh`
      const result = await forwardGeocode(cityQuery)
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

  // Handle Map Click for Polygon Drawing or Focal Circle
  const handleMapClick = (latlng) => {
    if (isDrawingArea) {
      setDrawnPoints((prev) => [...prev, [latlng.lat, latlng.lng]])
      return
    }
    if (focalMode) {
      setFocalCenter(latlng)
      setFocalMode(false)
      return
    }
  }

  // Polygon Drawing Actions
  const handleToggleDrawMode = () => {
    if (isDrawingArea) {
      setIsDrawingArea(false)
      setDrawnPoints([])
    } else {
      setIsDrawingArea(true)
      setFocalMode(false)
      setFocalCenter(null)
    }
  }

  const handleUndoPoint = () => {
    setDrawnPoints((prev) => prev.slice(0, -1))
  }

  const handleClearDrawing = () => {
    setDrawnPoints([])
  }

  const handleCompleteDrawing = () => {
    if (drawnPoints.length < 3) return
    setCustomMarkedArea([...drawnPoints])
    setIsDrawingArea(false)
    setDrawnPoints([])
  }

  const handleClearMarkedArea = () => {
    setCustomMarkedArea(null)
    setDrawnPoints([])
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
    let selectedPolygon = null
    let name = ''

    if (boundarySource === 'custom') {
      if (!customMarkedArea || customMarkedArea.length < 3) {
        setBoundaryError('Please mark at least 3 vertices on the map first.')
        return
      }
      name = customBoundaryName.trim() || `Custom Marked Area (${currentCity.nameEn} - ${new Date().toLocaleDateString()})`
      selectedPolygon = customMarkedArea
    } else if (boundarySource === 'current_city') {
      name = customBoundaryName.trim() || `${currentCity.nameEn} Municipal Boundary`
      selectedPolygon = currentCity.boundaryPolygon
    } else {
      // Find preset city
      const city = BANGLADESH_CITIES.find((c) => c.id === boundarySource)
      if (city) {
        name = customBoundaryName.trim() || `${city.nameEn} Municipal Boundary`
        selectedPolygon = city.boundaryPolygon
      } else if (boundarySource === 'dncc') {
        name = customBoundaryName.trim() || 'Dhaka North City Corporation (DNCC)'
        selectedPolygon = BANGLADESH_CITIES[0].zones.find((z) => z.id === 'dncc')?.polygon
      } else if (boundarySource === 'dscc') {
        name = customBoundaryName.trim() || 'Dhaka South City Corporation (DSCC)'
        selectedPolygon = BANGLADESH_CITIES[0].zones.find((z) => z.id === 'dscc')?.polygon
      }
    }

    if (!selectedPolygon || selectedPolygon.length < 3) {
      setBoundaryError('Selected boundary does not contain sufficient polygon coordinates.')
      return
    }

    const geoJson = pointsToGeoJsonMultiPolygon(selectedPolygon)
    if (!geoJson) {
      setBoundaryError('Failed to convert polygon coordinates to GeoJSON MultiPolygon.')
      return
    }

    replaceBoundaryMutation.mutate({
      name,
      geometry: geoJson,
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
        subtitle="Multi-city administrative map overview, jurisdictional sub-zones, and interactive boundary marking."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCustomBounds(currentCity.bounds)
                setSelectedZoneId(cityZones[0]?.id || 'all')
                setMapCenter(currentCity.center)
                setMapZoom(currentCity.zoom)
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fit {currentCity.nameEn.split(' ')[0]}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setBoundarySource(customMarkedArea ? 'custom' : 'current_city')
                setBoundaryModalOpen(true)
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Settings className="h-3.5 w-3.5" />
              Boundary Settings
            </Button>
          </div>
        }
      />

      {/* TOP CONTROL 1: City & Sub-Zone Selection Bar */}
      <Card className="p-3 sm:p-4">
        <div className="space-y-3">
          {/* Row 1: City Switcher & Address Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                Select City / Division:
              </span>
              <div className="w-52">
                <Select
                  aria-label="Select City"
                  value={selectedCityId}
                  onChange={(e) => handleCitySelect(e.target.value)}
                  options={BANGLADESH_CITIES.map((c) => ({
                    value: c.id,
                    label: `${c.nameEn} (${c.division})`,
                  }))}
                  className="text-xs font-semibold"
                />
              </div>
            </div>

            {/* Address / Location Search Bar */}
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative w-64 sm:w-80">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search road, ward, landmark in ${currentCity.nameEn.split(' ')[0]}...`}
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

          {/* Quick City Pills for 1-click Switching */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line/50 pt-2">
            <span className="text-[11px] font-semibold text-ink-muted mr-1">Major Cities:</span>
            {BANGLADESH_CITIES.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => handleCitySelect(city.id)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-all ${
                  selectedCityId === city.id
                    ? 'bg-primary text-white shadow-sm font-semibold'
                    : 'bg-surface-sunken text-ink hover:bg-surface-sunken/80 border border-line/60'
                }`}
              >
                {city.nameBn || city.nameEn}
              </button>
            ))}
          </div>

          {/* Sub-Zones for Selected City */}
          {cityZones.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line/50 pt-2">
              <span className="text-[11px] font-semibold text-ink-muted mr-1">
                {currentCity.nameEn.split(' ')[0]} Zones:
              </span>
              {cityZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => handleZoneSelect(zone.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                    selectedZoneId === zone.id
                      ? 'bg-ink text-white shadow-sm font-semibold'
                      : 'bg-surface text-ink-muted hover:text-ink hover:bg-surface-sunken border border-line/50'
                  }`}
                >
                  {zone.nameEn}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* TOP CONTROL 2: Incident Filters & Interactive Tools */}
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

          {/* Interactive Custom Area Polygon Drawing Tool */}
          <Button
            variant={isDrawingArea ? 'primary' : customMarkedArea ? 'outline' : 'secondary'}
            size="sm"
            onClick={handleToggleDrawMode}
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              customMarkedArea ? 'border-primary text-primary bg-primary-soft/30' : ''
            }`}
          >
            <PenTool className="h-3.5 w-3.5" />
            {isDrawingArea
              ? `Drawing Mode (${drawnPoints.length} pts)`
              : customMarkedArea
              ? `Area Marked (${customMarkedArea.length} pts)`
              : 'Mark / Draw Area'}
          </Button>

          {/* Focal Area Radius Inspection Toggle */}
          <div className="flex items-center gap-1.5">
            <Button
              variant={focalMode || focalCenter ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                if (focalCenter) {
                  setFocalCenter(null)
                  setFocalMode(false)
                } else {
                  setFocalMode(!focalMode)
                  setIsDrawingArea(false)
                }
              }}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Crosshair className="h-3.5 w-3.5" />
              {focalCenter ? 'Clear Radius' : focalMode ? 'Click Map' : 'Radius Tool'}
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

      {/* DRAWING MODE HUD BAR */}
      {isDrawingArea && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border-2 border-primary bg-primary-soft p-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-bold text-white text-[11px] animate-pulse">
              ✏️
            </span>
            <div>
              <span className="font-bold text-primary text-sm">Interactive Polygon Drawing Active</span>
              <p className="text-ink-muted text-[11px]">
                Click anywhere on the map to add boundary corner vertices (minimum 3 points needed). Current points:{' '}
                <strong className="text-ink">{drawnPoints.length}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={drawnPoints.length === 0}
              onClick={handleUndoPoint}
              className="flex items-center gap-1 text-xs"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo Last
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={drawnPoints.length === 0}
              onClick={handleClearDrawing}
              className="flex items-center gap-1 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear Points
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={drawnPoints.length < 3}
              onClick={handleCompleteDrawing}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              <Check className="h-3.5 w-3.5" />
              Complete &amp; Filter Incidents ({drawnPoints.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleDrawMode}
              className="text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* CUSTOM MARKED AREA ACTIVE HUD BANNER */}
      {customMarkedArea && !isDrawingArea && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-status-resolved/50 bg-status-resolved/10 p-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-status-resolved text-white">
              <Check className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink text-sm">Custom Area Filtered on Map</span>
                <span className="rounded bg-status-resolved/20 px-2 py-0.5 text-[10px] font-bold text-status-resolved uppercase tracking-wider">
                  {customMarkedArea.length} Vertices
                </span>
              </div>
              <p className="text-ink-muted text-[11px] mt-0.5">
                Incidents are now filtered specifically inside this custom boundary (
                <strong className="text-ink">{features.length} incident{features.length === 1 ? '' : 's'}</strong> inside).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setBoundarySource('custom')
                setCustomBoundaryName(`${currentCity.nameEn.split(' ')[0]} Custom Sector (${customMarkedArea.length} pts)`)
                setBoundaryModalOpen(true)
              }}
              className="flex items-center gap-1.5 text-xs font-semibold bg-status-resolved hover:bg-status-resolved/90 text-white"
            >
              <Save className="h-3.5 w-3.5" />
              Save as Official Boundary
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleDrawMode}
              className="flex items-center gap-1 text-xs"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit / Redraw
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearMarkedArea}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-status-critical"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Area
            </Button>
          </div>
        </div>
      )}

      {/* FOCAL HUD BANNER */}
      {(focalMode || focalCenter) && (
        <div className="flex items-center justify-between rounded-panel border border-primary/30 bg-primary-soft/50 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-ink">
            <Crosshair className="h-4 w-4 text-primary flex-shrink-0" />
            <div>
              <span className="font-bold text-primary">
                {focalCenter
                  ? `Focal Radius Inspection: ${(focalRadius / 1000).toFixed(1)} km Radius`
                  : 'Place Focal Center'}
              </span>
              <span className="ml-2 text-ink-muted">
                {focalCenter
                  ? `Center (${focalCenter.lat.toFixed(4)}, ${focalCenter.lng.toFixed(4)}) • ${features.length} incident${features.length === 1 ? '' : 's'} in radius`
                  : 'Click anywhere on the map to place inspection center pin'}
              </span>
            </div>
          </div>
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
          isDrawingArea || focalMode ? 'cursor-crosshair' : ''
        }`}
      >
        {/* Floating City & Jurisdiction Overlay Badge */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 rounded-panel border border-line/80 bg-surface/90 backdrop-blur-md px-3 py-1.5 text-xs shadow-md">
          <div className="flex items-center gap-1.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#0e7c6d] animate-pulse" />
            <span className="font-bold text-ink">{currentCity.nameBn || currentCity.nameEn}</span>
          </div>
          <span className="text-[11px] text-ink-muted hidden sm:inline">
            ({currentCity.corpName || currentCity.division})
          </span>
          <div className="h-3 w-px bg-line" />
          <span className="text-[11px] font-semibold text-primary">
            {currentZone.id && !currentZone.id.endsWith('_all')
              ? currentZone.nameBn || currentZone.nameEn
              : `${cityZones.length - 1} Marked Wards/Zones`}
          </span>
          <button
            type="button"
            onClick={() => setShowAllZones(!showAllZones)}
            className="ml-1 rounded px-2 py-0.5 text-[10px] font-medium border border-line bg-surface-sunken hover:bg-surface text-ink-muted hover:text-ink transition-colors"
            title="Toggle display of all ward boundary outlines"
          >
            {showAllZones ? 'Hide Wards' : 'Show All Wards'}
          </button>
        </div>

        <InteractiveMap
          center={mapCenter || currentCity.center || center || DHAKA_CENTER}
          zoom={mapZoom}
          bounds={customBounds}
          polygons={polygons}
          boundaryPolygon={currentCity.boundaryPolygon}
          cityName={currentCity.nameBn || currentCity.nameEn}
          cityZones={cityZones}
          activeZoneId={selectedZoneId}
          activeZonePolygon={currentZone?.polygon}
          activeZoneName={currentZone?.nameBn || currentZone?.nameEn}
          showAllZones={showAllZones}
          onZoneClick={handleZoneSelect}
          drawnPolygonPoints={drawnPoints}
          customMarkedArea={customMarkedArea}
          focalCircle={focalCenter ? { center: focalCenter, radius: focalRadius } : null}
          searchMarker={searchMarker}
          features={features}
          onViewportChange={setViewport}
          onMapClick={handleMapClick}
          getDetailLink={() => `/admin/queue`}
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
              Current Active City Boundary in Database
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
              Select Boundary Source or Preset
            </label>
            <Select
              className="mt-1 w-full"
              value={boundarySource}
              onChange={(e) => setBoundarySource(e.target.value)}
              options={[
                ...(customMarkedArea
                  ? [
                      {
                        value: 'custom',
                        label: `⭐ Use Custom Marked Area on Map (${customMarkedArea.length} vertices)`,
                      },
                    ]
                  : []),
                {
                  value: 'current_city',
                  label: `📍 Selected City: ${currentCity.nameEn} (${currentCity.nameBn})`,
                },
                { value: 'dhaka', label: 'Dhaka Metropolitan Area (Greater DMA)' },
                { value: 'dncc', label: 'Dhaka North City Corporation (DNCC)' },
                { value: 'dscc', label: 'Dhaka South City Corporation (DSCC)' },
                { value: 'chattogram', label: 'Chattogram City Corporation (Chittagong)' },
                { value: 'rajshahi', label: 'Rajshahi City Corporation' },
                { value: 'khulna', label: 'Khulna City Corporation' },
                { value: 'sylhet', label: 'Sylhet City Corporation' },
                { value: 'barishal', label: 'Barishal City Corporation' },
                { value: 'rangpur', label: 'Rangpur City Corporation' },
                { value: 'mymensingh', label: 'Mymensingh City Corporation' },
                { value: 'gazipur', label: 'Gazipur City Corporation' },
                { value: 'cumilla', label: 'Cumilla City Corporation' },
              ]}
            />
            <p className="mt-1 text-ink-muted text-[11px]">
              Sets the official administrative boundary polygon saved in the PostGIS database. Citizen incident submissions will be validated against this boundary.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-ink">
              Boundary Label / Title (Optional)
            </label>
            <Input
              value={customBoundaryName}
              onChange={(e) => setCustomBoundaryName(e.target.value)}
              placeholder={`e.g. ${currentCity.nameEn.split(' ')[0]} Municipal Boundary 2026`}
              className="mt-1"
            />
          </div>

          {boundarySource === 'custom' && customMarkedArea && (
            <div className="rounded border border-primary/30 bg-primary-soft/40 p-2 text-[11px] text-ink">
              <span className="font-semibold text-primary">Marked Polygon Preview: </span>
              {customMarkedArea.length} vertices captured. Coordinates will be serialized to a standard GeoJSON MultiPolygon with closed rings.
            </div>
          )}

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
