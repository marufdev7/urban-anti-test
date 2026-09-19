import { createContext, useContext } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { queryClient } from '../lib/queryClient'

const AuthContext = createContext(null)

export const ROLE_HOME = {
  citizen: '/citizen/dashboard',
  authority: '/authority/dashboard',
  admin: '/admin/dashboard',
}

export function AuthProvider({ children }) {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api('/users/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })

  const login = useMutation({
    mutationFn: (credentials) =>
      api('/auth/login', { method: 'POST', body: credentials }),
  })

  const verifyTwoFactor = useMutation({
    mutationFn: (code) =>
      api('/auth/2fa/verify', { method: 'POST', body: { code } }),
  })

  const completeLogin = async (user) => {
    queryClient.setQueryData(['session'], user)
    await queryClient.invalidateQueries()
  }

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    // Even a failed logout call (expired session, network drop) must leave the
    // UI logged out; the cookie can be cleaned up later.
    onSettled: () => {
      queryClient.setQueryData(['session'], null)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })

  const user = session.data ?? null

  const value = {
    user,
    isLoading: session.isLoading,
    isAuthenticated: !!user,
    login,
    verifyTwoFactor,
    completeLogin,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
