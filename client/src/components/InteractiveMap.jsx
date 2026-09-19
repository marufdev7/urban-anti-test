import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Circle, MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
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

function MapEventsListener({ onViewportChange, onMapClick }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const bbox = boundsToBBox(bounds)
      if (bbox) onViewportChange?.({ bbox, zoom })
    },
    click: (e) => {
      onMapClick?.(e.latlng)
    },
  })

  // Initial report of bounds once map loads
  useEffect(() => {
    const bounds = map.getBounds()
    const zoom = map.getZoom()
    const bbox = boundsToBBox(bounds)
    if (bbox) onViewportChange?.({ bbox, zoom })
  }, [map, onViewportChange])

  return null
}

function MapViewController({ center, zoom, bounds }) {
  const map = useMap()
  const prevBoundsRef = useRef(null)

  useEffect(() => {
    if (bounds && bounds !== prevBoundsRef.current) {
      prevBoundsRef.current = bounds
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true })
      } catch {}
    } else if (center) {
      map.setView([center.lat, center.lng], zoom || map.getZoom(), { animate: true })
    }
  }, [map, center, zoom, bounds])

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
  activeZonePolygon = null,
  focalCircle = null,
  searchMarker = null,
  features = [],
  onViewportChange,
  onMapClick,
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

      {/* Default city boundary polygons */}
      {polygons.map((polygon, index) => (
        <Polygon
          key={index}
          positions={polygon}
          pathOptions={{ color: '#0e7c6d', weight: 1.8, fillOpacity: 0.03 }}
        />
      ))}

      {/* Highlighted active zone polygon */}
      {activeZonePolygon && (
        <Polygon
          positions={activeZonePolygon}
          pathOptions={{
            color: '#2563eb',
            weight: 2.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.12,
            dashArray: '6, 6',
          }}
        />
      )}

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
