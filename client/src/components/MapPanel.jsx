import { useCallback, useEffect, useRef } from 'react'
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function getSeverityPinIcon(severity = 'medium') {
  const colors = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#d97706',
    low: '#16a34a',
  }
  const color = colors[severity] || colors.medium
  return L.divIcon({
    className: 'custom-severity-pin',
    html: `
      <div style="position: relative; width: 24px; height: 30px; transform: translate(-12px, -30px); cursor: pointer;">
        <svg width="24" height="30" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="${color}"/>
          <circle cx="12" cy="12" r="5" fill="#ffffff"/>
          <circle cx="12" cy="12" r="2.5" fill="${color}"/>
        </svg>
      </div>
    `,
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    popupAnchor: [0, -28],
  })
}

// Custom vector teardrop pin matching media_1789770150954.png
const customPinIcon = L.divIcon({
  className: 'custom-urbanmend-pin',
  html: `
    <div style="position: relative; width: 34px; height: 42px; transform: translate(-17px, -42px); cursor: grab;">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.61 0 0 7.61 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61 26.39 0 17 0Z" fill="#005a4c"/>
        <circle cx="17" cy="17" r="7" fill="#ffffff"/>
        <circle cx="17" cy="17" r="3.5" fill="#005a4c"/>
      </svg>
      <div style="position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 14px; height: 5px; background: rgba(0,0,0,0.3); border-radius: 50%; filter: blur(1px);"></div>
    </div>
  `,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
})

function MapEventsHandler({ interactive, onMarkerChange }) {
  useMapEvents({
    click(e) {
      if (interactive) {
        onMarkerChange?.({ lat: e.latlng.lat, lng: e.latlng.lng })
      }
    },
  })
  return null
}

function MapRecenter({ center, zoom }) {
  const map = useMap()
  const prevRef = useRef(null)

  useEffect(() => {
    if (center?.lat && center?.lng) {
      const prev = prevRef.current
      const latDelta = prev ? Math.abs(center.lat - prev.lat) : Infinity
      const lngDelta = prev ? Math.abs(center.lng - prev.lng) : Infinity
      const changed = !prev || latDelta > 0.0001 || lngDelta > 0.0001

      if (changed) {
        // Large jump (> ~5 km) = city switch → fly with the city's default zoom.
        // Small move = user clicked nearby or dragged pin → keep current zoom.
        const isCitySwitch = latDelta > 0.05 || lngDelta > 0.05
        const targetZoom = isCitySwitch ? (zoom || map.getZoom()) : map.getZoom()

        prevRef.current = { lat: center.lat, lng: center.lng }
        if (isCitySwitch) {
          map.flyTo([center.lat, center.lng], targetZoom, { duration: 0.8 })
        } else {
          // For nearby clicks, just pan without changing zoom — instant and non-disruptive
          map.panTo([center.lat, center.lng], { animate: false })
        }
      }
    }
  }, [center?.lat, center?.lng, zoom, map])
  return null
}

/**
 * Leaflet map wrapped for UrbanMend.
 * - Interactive: click anywhere to drop/move pin, drag pin, zoom controls.
 * - City boundary polygons drawn so users see municipal service perimeter.
 */
export default function MapPanel({
  center,
  marker,
  markers = [],
  onMarkerChange,
  polygons = [],
  boundaryPolygon = null,
  interactive = true,
  zoom = 13,
  zoomPosition = 'bottomright',
  className = '',
}) {
  const markerRef = useRef(null)

  const onDragEnd = useCallback(() => {
    const position = markerRef.current?.getLatLng()
    if (position) onMarkerChange?.({ lat: position.lat, lng: position.lng })
  }, [onMarkerChange])

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={`z-0 h-full w-full ${className}`}
      dragging={interactive}
      zoomControl={false}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      attributionControl={false}
      role="application"
      aria-label={
        interactive
          ? 'Interactive city map — click or drag the pin to set the report location'
          : 'City map showing the reported location and city boundary'
      }
    >
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapRecenter center={marker ?? center} zoom={zoom} />
      <MapEventsHandler interactive={interactive} onMarkerChange={onMarkerChange} />
      {interactive && <ZoomControl position={zoomPosition} />}
      {boundaryPolygon && (
        <Polygon
          positions={boundaryPolygon}
          pathOptions={{
            color: '#0e7c6d',
            weight: 2.8,
            fillColor: '#0e7c6d',
            fillOpacity: 0.08,
            dashArray: '6, 6',
          }}
        />
      )}
      {polygons.map((polygon, index) => (
        <Polygon
          key={index}
          positions={polygon}
          pathOptions={{ color: '#0e7c6d', weight: 1.5, fillOpacity: 0.04 }}
        />
      ))}
      {marker && (
        <Marker
          ref={interactive ? markerRef : undefined}
          position={[marker.lat, marker.lng]}
          draggable={interactive}
          icon={customPinIcon}
          eventHandlers={interactive ? { dragend: onDragEnd } : undefined}
        />
      )}
      {markers.map((m) => (
        <Marker
          key={m.id || `${m.lat}-${m.lng}`}
          position={[m.lat, m.lng]}
          icon={getSeverityPinIcon(m.severity)}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        >
          {m.title && (
            <Popup>
              <div className="p-1 text-xs">
                <p className="font-bold text-slate-900 leading-tight">{m.title}</p>
                {m.subtitle && <p className="text-slate-500 text-[10px] mt-0.5">{m.subtitle}</p>}
                {m.link && (
                  <a
                    href={m.link}
                    className="inline-block mt-1.5 font-semibold text-[#005a4c] hover:underline text-[11px]"
                  >
                    View Details &rarr;
                  </a>
                )}
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  )
}
