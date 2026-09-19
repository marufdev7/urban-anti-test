import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Issue workflow statuses (backend IssueStatus enum, moderation-only pair
// excluded — they are not filterable, per IssueStatusQuerySerializer).
export const ISSUE_STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'triaged', label: 'Under Review' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'insufficient_info', label: 'Needs More Info' },
]

export const SEVERITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const ISSUE_SORTS = [
  { value: '', label: 'Severity (default)' },
  { value: 'age', label: 'Oldest first' },
  { value: '-createdAt', label: 'Newest first' },
  { value: 'corroborationCount', label: 'Most reports' },
]

export function issueStatusLabel(status) {
  return ISSUE_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function issueStatusTone(status) {
  switch (status) {
    case 'resolved':
    case 'closed':
      return 'resolved'
    case 'submitted':
    case 'triaged':
      return 'processing'
    case 'acknowledged':
    case 'in_progress':
      return 'medium'
    case 'rejected':
    case 'duplicate':
    case 'insufficient_info':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** Build the /issues query string from the URL-synced filter state. */
export function issuesQueryString(filters) {
  const params = new URLSearchParams()
  params.set('limit', '20')
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  return params.toString()
}

export function useIssues(filters, options = {}) {
  const qs = issuesQueryString(filters)
  return useQuery({
    queryKey: ['issues', qs],
    queryFn: () => api(`/issues?${qs}`),
    placeholderData: (prev) => prev,
    ...options,
  })
}

export function useIssue(issueId, options = {}) {
  return useQuery({
    queryKey: ['issues', issueId],
    queryFn: () => api(`/issues/${issueId}`),
    enabled: !!issueId,
    ...options,
  })
}

export function useIssueReports(issueId) {
  return useQuery({
    queryKey: ['issues', issueId, 'memberReports'],
    queryFn: () => api(`/issues/${issueId}/reports`),
    enabled: !!issueId,
  })
}

export function useStatusEvents(issueId) {
  return useQuery({
    queryKey: ['issues', issueId, 'status-events'],
    queryFn: () => api(`/issues/${issueId}/status-events`),
    enabled: !!issueId,
  })
}

/**
 * Shared mutator helper: runs the PATCH, then invalidates every issue query
 * so the queue, detail and dashboard all reflect the change. Optimistic
 * patching (FRONTEND_PLAN §8) applies to the detail read.
 */
export function useIssueMutation(issueId, suffix, invalidates = []) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api(`/issues/${issueId}/${suffix}`, { method: 'PATCH', body }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] })
      for (const key of invalidates) queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useSetStatus(issueId) {
  return useIssueMutation(issueId, 'status')
}

export function useSetAssignment(issueId) {
  return useIssueMutation(issueId, 'assignment')
}

export function useSetSeverity(issueId) {
  return useIssueMutation(issueId, 'severity')
}

export function useAddComment(issueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ body, visibility }) =>
      api(`/issues/${issueId}/comments`, { method: 'POST', body: { body, visibility } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues', issueId] }),
  })
}

export function useMergeIssue(issueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api(`/issues/${issueId}/merge`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues'] }),
  })
}

export function useSplitIssue(issueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api(`/issues/${issueId}/split`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues'] }),
  })
}

/** GET /analytics/summary — scoped operational aggregates (authority/admin). */
export function useAnalyticsSummary(params, queryOptions = {}) {
  const qs = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: ['analytics', 'summary', qs],
    queryFn: () => api(`/analytics/summary?${qs}`),
    staleTime: 5_000,
    ...queryOptions,
  })
}
