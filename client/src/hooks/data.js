import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { boundaryCenter, boundaryToLatLngs, DHAKA_CENTER } from '../lib/geo'

const SEV_TONES = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }
const STATUS_TONES = {
  submitted: 'processing',
  processing: 'processing',
  triaged: 'resolved',
  resolved: 'resolved',
  hidden: 'neutral',
  removed: 'neutral',
}
const SEV_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const STATUS_LABELS = {
  submitted: 'Submitted',
  processing: 'Processing',
  triaged: 'Under Review',
  resolved: 'Resolved',
  hidden: 'Hidden',
  removed: 'Removed',
}

/** { tone, label } for a report row — severity wins when classified. */
export function badgeFor(report) {
  const severity = report?.classification?.severitySignal
  if (severity && SEV_TONES[severity]) {
    return { tone: SEV_TONES[severity], label: SEV_LABELS[severity] }
  }
  const status = report?.status
  return {
    tone: STATUS_TONES[status] ?? 'neutral',
    label: STATUS_LABELS[status] ?? 'Submitted',
  }
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    // GET /categories is a plain JSON array (not the collection envelope).
    queryFn: () => api('/categories'),
    staleTime: 10 * 60_000,
  })
}

export function categoryLabel(categories, slug) {
  if (!slug) return 'Uncategorized'
  return categories?.find((c) => c.key === slug)?.label?.en ?? slug
}

export function useCityBoundary() {
  const query = useQuery({
    queryKey: ['city-boundary'],
    queryFn: () => api('/meta/city-boundary'),
    staleTime: 30 * 60_000,
  })
  const feature = query.data
  return {
    ...query,
    center: feature ? boundaryCenter(feature) : DHAKA_CENTER,
    polygons: feature ? boundaryToLatLngs(feature) : [],
  }
}

/** Human-readable upload errors, split exactly like API §6.4 says. */
export function mediaErrorMessage(error) {
  if (error.status === 413) return 'Photo is too large (max 10 MB).'
  if (error.status === 415) return 'Unsupported format — use JPEG, PNG or WebP.'
  if (error.status === 422) return 'The file could not be read as an image.'
  if (error.status === 429) return 'Too many uploads — wait a moment.'
  return 'Upload failed. Please try again.'
}
