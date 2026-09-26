import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// All known backend Issue statuses for label lookup
export const ALL_ISSUE_STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'triaged', label: 'Under Review' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Solved' },
  { value: 'closed', label: 'Solved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'insufficient_info', label: 'Needs More Info' },
]

// Active workflow statuses displayed in Work Queue filters and standard issue management
export const ISSUE_STATUSES = [
  { value: 'triaged', label: 'Under Review' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Solved' },
  { value: 'rejected', label: 'Rejected' },
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
  return ALL_ISSUE_STATUSES.find((s) => s.value === status)?.label ?? status
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
  params.set('limit', '10')
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

/** Helper to optimistically update issue confirmation state in all React Query caches */
function applyIssueConfirmation(queryClient, issueId, confirmed) {
  if (!issueId) return

  const updateItem = (item) => {
    if (!item) return item
    const currentCount = Number(item.corroborationCount) || 1
    const newCount = confirmed ? currentCount + 1 : Math.max(1, currentCount - 1)
    return {
      ...item,
      corroborationCount: newCount,
      hasConfirmed: confirmed,
    }
  }

  // 1. Exact issue query: ['issues', issueId]
  queryClient.setQueryData(['issues', issueId], (old) => {
    if (!old) return old
    return updateItem(old)
  })

  // 2. All issues collection queries (e.g. ['issues', qs], ['issues', 'public', 'dashboard'], ['issues', 'processing-queue'])
  queryClient.setQueriesData({ queryKey: ['issues'] }, (old) => {
    if (!old) return old
    if (Array.isArray(old.data)) {
      return {
        ...old,
        data: old.data.map((item) => (item.id === issueId ? updateItem(item) : item)),
      }
    }
    if (Array.isArray(old)) {
      return old.map((item) => (item.id === issueId ? updateItem(item) : item))
    }
    if (old.id === issueId) {
      return updateItem(old)
    }
    return old
  })

  // 3. Reports queries
  queryClient.setQueriesData({ queryKey: ['reports'] }, (old) => {
    if (!old) return old
    if (Array.isArray(old.data)) {
      return {
        ...old,
        data: old.data.map((item) => {
          if (item.id === issueId || item.issueId === issueId) {
            return updateItem(item)
          }
          return item
        }),
      }
    }
    if (Array.isArray(old)) {
      return old.map((item) => {
        if (item.id === issueId || item.issueId === issueId) {
          return updateItem(item)
        }
        return item
      })
    }
    if (old.id === issueId || old.issueId === issueId) {
      return updateItem(old)
    }
    return old
  })

  // 4. Map issues queries
  queryClient.setQueriesData({ queryKey: ['map-issues'] }, (old) => {
    if (!old || !Array.isArray(old.features)) return old
    return {
      ...old,
      features: old.features.map((f) => {
        const fId = f.id || f.properties?.id
        if (fId === issueId) {
          const currentCount = Number(f.properties?.corroborationCount) || 1
          const newCount = confirmed ? currentCount + 1 : Math.max(1, currentCount - 1)
          return {
            ...f,
            properties: {
              ...f.properties,
              corroborationCount: newCount,
            },
          }
        }
        return f
      }),
    }
  })
}

function applyIssueConfirmationCount(queryClient, issueId, exactCount, confirmed) {
  if (!issueId) return

  const updateItem = (item) => {
    if (!item) return item
    return {
      ...item,
      corroborationCount: exactCount,
      hasConfirmed: confirmed,
    }
  }

  queryClient.setQueryData(['issues', issueId], (old) => {
    if (!old) return old
    return updateItem(old)
  })

  queryClient.setQueriesData({ queryKey: ['issues'] }, (old) => {
    if (!old) return old
    if (Array.isArray(old.data)) {
      return {
        ...old,
        data: old.data.map((item) => (item.id === issueId ? updateItem(item) : item)),
      }
    }
    if (Array.isArray(old)) {
      return old.map((item) => (item.id === issueId ? updateItem(item) : item))
    }
    if (old.id === issueId) {
      return updateItem(old)
    }
    return old
  })

  queryClient.setQueriesData({ queryKey: ['reports'] }, (old) => {
    if (!old) return old
    if (Array.isArray(old.data)) {
      return {
        ...old,
        data: old.data.map((item) => {
          if (item.id === issueId || item.issueId === issueId) {
            return updateItem(item)
          }
          return item
        }),
      }
    }
    if (Array.isArray(old)) {
      return old.map((item) => {
        if (item.id === issueId || item.issueId === issueId) {
          return updateItem(item)
        }
        return item
      })
    }
    if (old.id === issueId || old.issueId === issueId) {
      return updateItem(old)
    }
    return old
  })

  queryClient.setQueriesData({ queryKey: ['map-issues'] }, (old) => {
    if (!old || !Array.isArray(old.features)) return old
    return {
      ...old,
      features: old.features.map((f) => {
        const fId = f.id || f.properties?.id
        if (fId === issueId) {
          return {
            ...f,
            properties: {
              ...f.properties,
              corroborationCount: exactCount,
            },
          }
        }
        return f
      }),
    }
  })
}

/** POST /issues/{issueId}/confirmations — citizen "Me Too / Confirm" (API §6.6, FR-16). */
export function useConfirmIssue(issueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/issues/${issueId}/confirmations`, { method: 'POST', body: {} }),
    onMutate: async () => {
      if (!issueId) return {}
      await queryClient.cancelQueries({ queryKey: ['issues'] })
      await queryClient.cancelQueries({ queryKey: ['reports'] })
      await queryClient.cancelQueries({ queryKey: ['map-issues'] })

      const prevIssues = queryClient.getQueriesData({ queryKey: ['issues'] })
      const prevReports = queryClient.getQueriesData({ queryKey: ['reports'] })
      const prevMap = queryClient.getQueriesData({ queryKey: ['map-issues'] })

      applyIssueConfirmation(queryClient, issueId, true)

      return { prevIssues, prevReports, prevMap }
    },
    onError: (err, variables, context) => {
      if (err?.code === 'ALREADY_CONFIRMED') {
        applyIssueConfirmation(queryClient, issueId, true)
        return
      }
      if (context?.prevIssues) {
        context.prevIssues.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
      if (context?.prevReports) {
        context.prevReports.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
      if (context?.prevMap) {
        context.prevMap.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
    },
    onSuccess: (data) => {
      if (data?.corroborationCount !== undefined) {
        applyIssueConfirmationCount(queryClient, issueId, data.corroborationCount, true)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['map-issues'] })
    },
  })
}

/** DELETE /issues/{issueId}/confirmations/me — revoke citizen confirmation. */
export function useWithdrawConfirmation(issueId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/issues/${issueId}/confirmations/me`, { method: 'DELETE' }),
    onMutate: async () => {
      if (!issueId) return {}
      await queryClient.cancelQueries({ queryKey: ['issues'] })
      await queryClient.cancelQueries({ queryKey: ['reports'] })
      await queryClient.cancelQueries({ queryKey: ['map-issues'] })

      const prevIssues = queryClient.getQueriesData({ queryKey: ['issues'] })
      const prevReports = queryClient.getQueriesData({ queryKey: ['reports'] })
      const prevMap = queryClient.getQueriesData({ queryKey: ['map-issues'] })

      applyIssueConfirmation(queryClient, issueId, false)

      return { prevIssues, prevReports, prevMap }
    },
    onError: (err, variables, context) => {
      if (context?.prevIssues) {
        context.prevIssues.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
      if (context?.prevReports) {
        context.prevReports.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
      if (context?.prevMap) {
        context.prevMap.forEach(([key, val]) => queryClient.setQueryData(key, val))
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['map-issues'] })
    },
  })
}

