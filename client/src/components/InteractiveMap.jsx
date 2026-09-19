import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Circle, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { boundsToBBox } from '../lib/geo'
import { shortId } from '../lib/format'

function createPinIcon(severity = 'medium') {
  const colors = {
    critical: { bg: '#dc2626' },
    high: { bg: '#ea580c' },
    medium: { bg: '#d97706' },
    low: { bg: '#16a34a' },
  }
  const c = colors[severity] || colors.medium
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="
      background-color: ${c.bg};
      width: 26px;
      height: 26px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        transform: rotate(45deg);
      "></div>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -26],
  })
}

function createClusterIcon(count) {
  return L.divIcon({
    className: 'custom-cluster',
    html: `<div style="
      background: #0e7c6d;
      color: white;
      font-weight: 700;
      font-size: 13px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 3px 8px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
    ">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

function areBoundsEqual(b1, b2) {
  if (!b1 && !b2) return true
  if (!b1 || !b2) return false
  const getCoords = (b) => {
    if (Array.isArray(b) && Array.isArray(b[0])) {
      return [b[0][0], b[0][1], b[1][0], b[1][1]]
    }
    if (b && typeof b.getSouthWest === 'function' && typeof b.getNorthEast === 'function') {
      const sw = b.getSouthWest()
      const ne = b.getNorthEast()
      return [sw.lat, sw.lng, ne.lat, ne.lng]
    }
    return null
  }
  const c1 = getCoords(b1)
  const c2 = getCoords(b2)
  if (!c1 || !c2) return b1 === b2
  return c1.every((val, idx) => Math.abs(val - c2[idx]) < 0.0001)
}

function MapEventsListener({ onViewportChange, onMapClick }) {
  const onViewportChangeRef = useRef(onViewportChange)
  const onMapClickRef = useRef(onMapClick)

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
    onMapClickRef.current = onMapClick
  })

  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const bbox = boundsToBBox(bounds)
      if (bbox) onViewportChangeRef.current?.({ bbox, zoom })
    },
    click: (e) => {
      onMapClickRef.current?.(e.latlng)
    },
  })

  // Initial report of bounds once map loads
  useEffect(() => {
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    const bbox = boundsToBBox(bounds)
    if (bbox) onViewportChangeRef.current?.({ bbox, zoom })
  }, [map])

  return null
}

function MapViewController({ center, zoom, bounds }) {
  const map = useMap()
  const prevBoundsRef = useRef(null)
  const prevCenterRef = useRef(null)
  const prevZoomRef = useRef(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // 1. Initial render: MapContainer already initializes with center & zoom
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (bounds) {
        prevBoundsRef.current = bounds
        try {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false })
        } catch {}
      }
      if (center && center.lat != null && center.lng != null) {
        prevCenterRef.current = { lat: center.lat, lng: center.lng }
      }
      prevZoomRef.current = zoom
      return
    }

    // 2. Bounds change: only if bounds genuinely changed to a different geographic box
    if (bounds) {
      if (!areBoundsEqual(bounds, prevBoundsRef.current)) {
        prevBoundsRef.current = bounds
        try {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true })
        } catch {}
      }
      return
    }

    // 3. Center or Zoom change: only if props changed from previous prop values
    if (center && center.lat != null && center.lng != null) {
      const prevCenter = prevCenterRef.current
      const prevZoom = prevZoomRef.current

      const centerChanged =
        !prevCenter ||
        Math.abs(center.lat - prevCenter.lat) > 0.0001 ||
        Math.abs(center.lng - prevCenter.lng) > 0.0001

      // Zoom prop changed externally (e.g. searching address or clicking preset)
      const zoomChanged =
        zoom != null &&
        prevZoom != null &&
        zoom !== prevZoom

      if (centerChanged || zoomChanged) {
        prevCenterRef.current = { lat: center.lat, lng: center.lng }
        prevZoomRef.current = zoom
        const targetZoom = zoomChanged ? zoom : map.getZoom()
        map.setView([center.lat, center.lng], targetZoom, { animate: true })
      }
    }
  }, [map, center?.lat, center?.lng, zoom, bounds])

  return null
}

function ClusterMarker({ feature, map }) {
  const [lng, lat] = feature.geometry.coordinates
  const count = feature.properties?.count ?? 2
  const icon = useMemo(() => createClusterIcon(count), [count])

  const handleClick = () => {
    map.setView([lat, lng], Math.min(map.getZoom() + 2, 18))
  }

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={{ click: handleClick }}
    />
  )
}

function IssueMarker({ feature, onSelect, getDetailLink }) {
  const [lng, lat] = feature.geometry.coordinates
  const props = feature.properties ?? {}
  const sev = props.severity ?? 'medium'
  const icon = useMemo(() => createPinIcon(sev), [sev])
  const detailLink = getDetailLink ? getDetailLink(feature.id, props) : null

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={{
        click: () => onSelect?.(feature),
      }}
    >
      <Popup className="custom-popup">
        <div className="p-1 text-xs">
          <p className="font-semibold text-ink">
            Issue #{shortId(feature.id)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-medium capitalize text-ink-muted">
              {props.status === 'triaged' ? 'Under Review' : (props.status?.replaceAll('_', ' ') ?? 'Under Review')}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-medium uppercase text-white ${
                sev === 'critical' || sev === 'high'
                  ? 'bg-status-critical'
                  : sev === 'medium'
                    ? 'bg-status-medium'
                    : 'bg-status-low'
              }`}
            >
              {sev}
            </span>
          </div>
          {props.corroborationCount > 1 && (
            <p className="mt-1 text-ink-muted">
              Confirmed by {props.corroborationCount} citizens
            </p>
          )}
          {detailLink && (
            <Link
              to={detailLink}
              className="mt-2 inline-block font-semibold text-primary hover:underline"
            >
              View details &rarr;
            </Link>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

function MarkersLayer({ features, onSelectIssue, getDetailLink }) {
  const map = useMap()
  return (
    <>
      {features.map((f) => {
        const count = f.properties?.count ?? 1
        if (count > 1) {
          return <ClusterMarker key={f.id || `${f.geometry.coordinates[0]}-${f.geometry.coordinates[1]}`} feature={f} map={map} />
        }
        return (
          <IssueMarker
            key={f.id}
            feature={f}
            onSelect={onSelectIssue}
            getDetailLink={getDetailLink}
          />
        )
      })}
    </>
  )
}

export default function InteractiveMap({
  center,
  zoom = 13,
  bounds = null,
  polygons = [],
  boundaryPolygon = null,
  cityName = '',
  cityZones = [],
  activeZoneId = '',
  activeZonePolygon = null,
  activeZoneName = '',
  showAllZones = true,
  focalCircle = null,
  searchMarker = null,
  drawnPolygonPoints = [],
  customMarkedArea = null,
  features = [],
  onViewportChange,
  onMapClick,
  onZoneClick,
  onSelectIssue,
  getDetailLink,
  className = 'h-full w-full',
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={`z-0 rounded-panel border border-line ${className}`}
      scrollWheelZoom={true}
      attributionControl={false}
      role="application"
      aria-label="City incidents map"
    >
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapViewController center={center} zoom={zoom} bounds={bounds} />

      {/* Database city boundary polygons (if any) */}
      {polygons.map((polygon, index) => (
        <Polygon
          key={`db-poly-${index}`}
          positions={polygon}
          pathOptions={{ color: '#0e7c6d', weight: 1.8, fillOpacity: 0.03 }}
        />
      ))}

      {/* Selected City Corporation Official Boundary Outline */}
      {boundaryPolygon && (
        <Polygon
          positions={boundaryPolygon}
          pathOptions={{
            color: '#0e7c6d',
            weight: 2.8,
            fillColor: '#0e7c6d',
            fillOpacity: 0.06,
            dashArray: '6, 6',
          }}
        >
          {cityName && (
            <Tooltip sticky direction="top">
              <div className="px-1 py-0.5 text-xs font-bold text-[#0e7c6d]">
                🏛️ {cityName} Municipal Boundary
              </div>
            </Tooltip>
          )}
        </Polygon>
      )}

      {/* All Sub-Zone / Ward Polygons across the selected City */}
      {showAllZones &&
        cityZones &&
        cityZones.map((zone) => {
          if (!zone.polygon || zone.id === activeZoneId) return null
          return (
            <Polygon
              key={`zone-poly-${zone.id}`}
              positions={zone.polygon}
              pathOptions={{
                color: '#64748b',
                weight: 1.5,
                fillColor: '#94a3b8',
                fillOpacity: 0.06,
                dashArray: '4, 4',
              }}
              eventHandlers={{
                click: () => onZoneClick?.(zone.id),
              }}
            >
              <Tooltip sticky direction="center">
                <div className="p-0.5 text-center text-xs font-semibold text-ink">
                  📍 {zone.nameBn || zone.nameEn}
                  <div className="text-[10px] text-primary font-normal">Click to filter zone</div>
                </div>
              </Tooltip>
            </Polygon>
          )
        })}

      {/* Highlighted active zone polygon */}
      {activeZonePolygon && (
        <Polygon
          positions={activeZonePolygon}
          pathOptions={{
            color: '#2563eb',
            weight: 3,
            fillColor: '#3b82f6',
            fillOpacity: 0.16,
            dashArray: '6, 6',
          }}
        >
          {activeZoneName && (
            <Tooltip permanent direction="top">
              <div className="px-1 py-0.5 text-xs font-bold text-primary">
                📌 {activeZoneName} (Active Jurisdiction)
              </div>
            </Tooltip>
          )}
        </Polygon>
      )}

      {/* Completed Custom Marked Area Polygon */}
      {customMarkedArea && (
        <Polygon
          positions={customMarkedArea}
          pathOptions={{
            color: '#059669',
            weight: 2.8,
            fillColor: '#10b981',
            fillOpacity: 0.18,
          }}
        >
          <Tooltip permanent direction="top">
            <div className="px-1 py-0.5 text-xs font-bold text-status-resolved">
              📐 Custom Marked Area ({customMarkedArea.length} vertices)
            </div>
          </Tooltip>
        </Polygon>
      )}

      {/* In-Progress Drawn Polygon Lines & Filled Shape */}
      {drawnPolygonPoints.length >= 2 && (
        <Polyline
          positions={drawnPolygonPoints}
          pathOptions={{
            color: '#2563eb',
            weight: 2.5,
            dashArray: '6, 6',
          }}
        />
      )}
      {drawnPolygonPoints.length >= 3 && (
        <Polygon
          positions={drawnPolygonPoints}
          pathOptions={{
            color: '#2563eb',
            weight: 1.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
          }}
        />
      )}

      {/* Drawn Polygon Vertex Markers */}
      {drawnPolygonPoints.map((pt, idx) => (
        <Marker
          key={`vertex-${idx}`}
          position={pt}
          icon={L.divIcon({
            className: 'vertex-marker',
            html: `<div style="
              background: #2563eb;
              color: white;
              font-weight: bold;
              font-size: 10px;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 1px 4px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">${idx + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          })}
        />
      ))}

      {/* Focal Inspection Circle */}
      {focalCircle && (
        <Circle
          center={[focalCircle.center.lat, focalCircle.center.lng]}
          radius={focalCircle.radius}
          pathOptions={{
            color: focalCircle.color || '#ef4444',
            weight: 2,
            fillColor: focalCircle.color || '#ef4444',
            fillOpacity: 0.12,
          }}
        />
      )}

      {/* Temporary Search Pin */}
      {searchMarker && (
        <Marker
          position={[searchMarker.lat, searchMarker.lng]}
          icon={L.divIcon({
            className: 'search-pin',
            html: `<div style="
              background: #2563eb;
              width: 30px;
              height: 30px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 3px 8px rgba(0,0,0,0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
            ">📍</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
          })}
        >
          {searchMarker.label && (
            <Popup>
              <div className="p-1 text-xs font-medium text-ink">
                {searchMarker.label}
              </div>
            </Popup>
          )}
        </Marker>
      )}

      <MapEventsListener onViewportChange={onViewportChange} onMapClick={onMapClick} />
      <MarkersLayer
        features={features}
        onSelectIssue={onSelectIssue}
        getDetailLink={getDetailLink}
      />
    </MapContainer>
  )
}
