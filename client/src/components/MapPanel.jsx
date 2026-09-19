import { useCallback, useEffect, useRef } from 'react'
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

function MapRecenter({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center?.lat && center?.lng) {
      map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.8 })
    }
  }, [center?.lat, center?.lng, map])
  return null
}

/**
 * Leaflet map wrapped for UrbanMend.
 * - Interactive: click anywhere to drop/move pin, drag pin, zoom controls.
 * - City boundary polygons drawn so users see Dhaka service perimeter.
 */
export default function MapPanel({
  center,
  marker,
  onMarkerChange,
  polygons = [],
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
      <MapRecenter center={marker ?? center} />
      <MapEventsHandler interactive={interactive} onMarkerChange={onMarkerChange} />
      {interactive && <ZoomControl position={zoomPosition} />}
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
    </MapContainer>
  )
}
