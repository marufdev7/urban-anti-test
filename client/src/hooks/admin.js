import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------- Users / authorities (API §6.2) ----------

export function useUsers(params = {}, options = {}) {
  const searchParams = new URLSearchParams()
  for (const [key, val] of Object.entries(params || {})) {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, val)
    }
  }
  const qs = searchParams.toString()
  return useQuery({
    queryKey: ['users', qs],
    queryFn: () => api(`/users${qs ? `?${qs}` : ''}`),
    placeholderData: (prev) => prev,
    ...options,
  })
}

/** List authorities (GET /users?role=authority) for the provisioning table. */
export function useAuthorities(params = {}) {
  return useUsers({ role: 'authority', ...params })
}

export function useProvisionAuthority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/users/authorities', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

/** Admin edit of status / category scope (PATCH /users/{id}). */
export function useUpdateUser(userId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api(`/users/${userId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['authority-profile', userId] })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

/** Dynamic Admin edit of any user (PATCH /users/{id}). */
export function useAdminUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, ...body }) => api(`/users/${userId}`, { method: 'PATCH', body }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['authority-profile', variables?.userId] })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

/** Fetch full authority profile, performance metrics, and activity log (GET /users/{id}). */
export function useAuthorityProfile(userId, options = {}) {
  return useQuery({
    queryKey: ['authority-profile', userId],
    queryFn: () => api(`/users/${userId}`),
    enabled: !!userId,
    ...options,
  })
}

// ---------- Analytics (API §6.9) ----------

export function useAnalytics(groupBy, params = {}, options = {}) {
  const searchParams = new URLSearchParams({ groupBy })
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, val)
    }
  }
  const qs = searchParams.toString()
  return useQuery({
    queryKey: ['analytics', groupBy, qs],
    queryFn: () => api(`/analytics/summary?${qs}`),
    staleTime: 30_000,
    ...options,
  })
}

// ---------- Moderation (API §6.13) ----------

export function useModerate(kind) {
  const queryClient = useQueryClient()
  return useMutation({
    // kind ∈ report | issue
    mutationFn: ({ id, action, reason }) =>
      api(`/${kind}s/${id}/moderation`, { method: 'POST', body: { action, reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

// ---------- Exports (API §6.12) ----------

export function useCreateExport() {
  return useMutation({
    mutationFn: (body) => api('/exports', { method: 'POST', body }),
  })
}

export function useExportStatus(exportId, enabled = false) {
  return useQuery({
    queryKey: ['exports', exportId],
    queryFn: () => api(`/exports/${exportId}`),
    enabled: enabled && !!exportId,
    refetchInterval: (query) =>
      query.state.data?.state === 'ready' || query.state.data?.state === 'failed'
        ? false
        : 2000,
  })
}

// ---------- Audit log (API §6.10) ----------

export function useAuditEvents(params = {}) {
  const searchParams = new URLSearchParams()
  for (const [key, val] of Object.entries(params || {})) {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, val)
    }
  }
  const qs = searchParams.toString()
  return useQuery({
    queryKey: ['audit-events', qs],
    queryFn: () => api(`/audit-events${qs ? `?${qs}` : ''}`),
    placeholderData: (prev) => prev,
  })
}
