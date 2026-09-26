import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { boundaryCenter, boundaryToLatLngs, DHAKA_CENTER } from '../lib/geo'

const SEV_TONES = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }
const STATUS_TONES = {
  submitted: 'neutral',
  processing: 'processing',
  triaged: 'neutral',
  acknowledged: 'processing',
  dispatched: 'processing',
  in_progress: 'processing',
  resolved: 'resolved',
  closed: 'resolved',
  hidden: 'neutral',
  removed: 'neutral',
}
const SEV_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const STATUS_LABELS = {
  submitted: 'Submitted',
  processing: 'In Progress',
  triaged: 'Under Review',
  acknowledged: 'Acknowledged',
  dispatched: 'In Progress',
  in_progress: 'In Progress',
  resolved: 'Solved',
  closed: 'Closed',
  hidden: 'Hidden',
  removed: 'Removed',
}

/** Determines if a report's issue has been resolved / completed. */
export function isReportSolved(report) {
  const isStatus = report?.issueStatus || report?.issue?.status || report?.status
  return isStatus === 'resolved' || isStatus === 'closed'
}

/** Optional secondary badge for hazard severity level. */
export function severityBadgeFor(report) {
  const severity = report?.classification?.severitySignal?.toLowerCase()
  if (severity && SEV_TONES[severity]) {
    return { tone: SEV_TONES[severity], label: SEV_LABELS[severity] }
  }
  return null
}

/** { tone, label } for a report row — resolution status takes absolute precedence. */
export function badgeFor(report) {
  const issueStatus = report?.issueStatus || report?.issue?.status
  const status = report?.status

  // 1. If issue is resolved or closed -> SOLVED
  if (issueStatus === 'resolved' || status === 'resolved') {
    return { tone: 'resolved', label: 'Solved' }
  }
  if (issueStatus === 'closed' || status === 'closed') {
    return { tone: 'resolved', label: 'Closed' }
  }

  // 2. In progress / dispatched
  if (issueStatus === 'in_progress') {
    return { tone: 'processing', label: 'In Progress' }
  }
  if (issueStatus === 'acknowledged' || issueStatus === 'dispatched') {
    return { tone: 'processing', label: 'In Progress' }
  }

  // 3. Triaged / Under Review
  if (status === 'triaged' || issueStatus === 'triaged') {
    return { tone: 'neutral', label: 'Under Review' }
  }

  // 4. Processing -> In Progress
  if (status === 'processing') {
    return { tone: 'processing', label: 'In Progress' }
  }

  // 5. Default
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

  const center = useMemo(() => {
    return feature ? boundaryCenter(feature) : DHAKA_CENTER
  }, [feature])

  const polygons = useMemo(() => {
    return feature ? boundaryToLatLngs(feature) : []
  }, [feature])

  return {
    ...query,
    center,
    polygons,
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
