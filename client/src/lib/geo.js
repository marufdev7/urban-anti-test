// Client-side GeoJSON helpers for the city boundary returned by
// GET /api/v1/meta/city-boundary (a single GeoJSON Feature, MultiPolygon,
// coordinates in [lng, lat] order).

export const DHAKA_CENTER = { lat: 23.78, lng: 90.41 }

/** Leaflet wants [lat, lng]; GeoJSON gives [lng, lat]. */
export function boundaryToLatLngs(feature) {
  const polygons = feature?.geometry?.coordinates
  if (!Array.isArray(polygons)) return []
  return polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([lng, lat]) => [lat, lng])),
  )
}

/** Rough visual centre of the boundary — good enough to frame the map. */
export function boundaryCenter(feature) {
  const rings = boundaryToLatLngs(feature)
  const first = rings[0]?.[0] ?? []
  if (first.length === 0) return DHAKA_CENTER
  const sum = first.reduce(
    (acc, [lat, lng]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 },
  )
  return { lat: sum.lat / first.length, lng: sum.lng / first.length }
}

/** Convert Leaflet LatLngBounds to "minLng,minLat,maxLng,maxLat" string. */
export function boundsToBBox(bounds) {
  if (!bounds) return null
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  return `${sw.lng.toFixed(6)},${sw.lat.toFixed(6)},${ne.lng.toFixed(6)},${ne.lat.toFixed(6)}`
}

/** Compute overall bounding box for the city boundary feature. */
export function boundaryBBox(feature) {
  const rings = boundaryToLatLngs(feature)
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  let found = false
  for (const polygon of rings) {
    for (const ring of polygon) {
      for (const [lat, lng] of ring) {
        found = true
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      }
    }
  }
  if (!found) return '90.30,23.65,90.52,23.90'
  return `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`
}

/** Check if a {lat, lng} point lies within the city boundary MultiPolygon. */
export function isPointInBoundary(point, feature) {
  if (!point || !feature) return true
  const rings = boundaryToLatLngs(feature)
  if (rings.length === 0) return true
  const { lat, lng } = point
  for (const polygon of rings) {
    const outerRing = polygon[0]
    if (!outerRing) continue
    let inPoly = false
    for (let i = 0, j = outerRing.length - 1; i < outerRing.length; j = i++) {
      const [xi, yi] = outerRing[i] // [lat, lng]
      const [xj, yj] = outerRing[j]
      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi)
      if (intersect) inPoly = !inPoly
    }
    if (inPoly) return true
  }
  return false
}

/**
 * Reverse geocode {lat, lng} into a human-readable street address.
 * Primary: /nominatim-proxy (OpenStreetMap Nominatim via Vite server-side proxy).
 * Secondary: BigDataCloud client API (CORS enabled).
 * Tertiary: Exact coordinate representation.
 */
export async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return 'Location pinned'
  try {
    const res = await fetch(
      `/nominatim-proxy/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
    )
    if (res.ok) {
      const data = await res.json()
      if (data.address) {
        const a = data.address
        const house = a.house_number || a.building
        const road = a.road || a.pedestrian || a.footway || a.path || a.street
        const neighborhood = a.neighbourhood || a.suburb || a.residential || a.quarter
        const city = a.city || a.town || a.county || 'Dhaka'
        const parts = [
          house ? `House ${house}` : null,
          road,
          neighborhood,
          city,
        ].filter(Boolean)
        if (parts.length > 0) return parts.join(', ')
      }
      if (data.display_name) {
        return data.display_name.split(',').slice(0, 3).join(', ')
      }
    }
  } catch {}

  // Fallback: BigDataCloud client reverse geocoding API
  try {
    const fallbackRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
    )
    if (fallbackRes.ok) {
      const b = await fallbackRes.json()
      const parts = [b.locality, b.city, b.principalSubdivision].filter(Boolean)
      if (parts.length > 0) return parts.join(', ')
    }
  } catch {}

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/**
 * Forward geocode an address query into {lat, lng, displayName} coordinates.
 */
export async function forwardGeocode(query) {
  if (!query?.trim()) return null
  try {
    const res = await fetch(
      `/nominatim-proxy/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&accept-language=en`,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.length === 0) return null
    const item = data[0]
    return {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name?.split(',').slice(0, 3).join(', ') || item.display_name,
    }
  } catch {
    return null
  }
}


