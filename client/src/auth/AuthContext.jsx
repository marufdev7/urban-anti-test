import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { onAuthStateChanged } from 'firebase/auth'
import { api, ApiError } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { auth, firebaseSignOut } from '../lib/firebase'

const AuthContext = createContext(null)

export const ROLE_HOME = {
  citizen: '/citizen/dashboard',
  authority: '/authority/dashboard',
  admin: '/admin/dashboard',
}

export function AuthProvider({ children }) {
  const [googleProfile, setGoogleProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('urbanmend_google_profile')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const profile = {
          fullName: fbUser.displayName || '',
          photoUrl: fbUser.photoURL || '',
          email: fbUser.email || '',
        }
        setGoogleProfile(profile)
        try {
          localStorage.setItem('urbanmend_google_profile', JSON.stringify(profile))
        } catch {
          // ignore
        }
      }
    })
    return () => unsubscribe()
  }, [])

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return await api('/users/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            localStorage.removeItem('urbanmend_google_profile')
          } catch {
            // ignore
          }
          setGoogleProfile(null)
          return null
        }
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })

  const login = useMutation({
    mutationFn: (credentials) =>
      api('/auth/login', { method: 'POST', body: credentials }),
  })

  const firebaseLogin = useMutation({
    mutationFn: (payload) =>
      api('/auth/firebase-login', { method: 'POST', body: payload }),
  })

  const verifyTwoFactor = useMutation({
    mutationFn: (code) =>
      api('/auth/2fa/verify', { method: 'POST', body: { code } }),
  })

  const completeLogin = async (user, extraProfile = null) => {
    if (extraProfile) {
      setGoogleProfile(extraProfile)
      try {
        localStorage.setItem('urbanmend_google_profile', JSON.stringify(extraProfile))
      } catch {
        // ignore
      }
    }
    queryClient.setQueryData(['session'], user)
    await queryClient.invalidateQueries()
  }

  const logout = useMutation({
    mutationFn: async () => {
      try {
        localStorage.removeItem('urbanmend_google_profile')
      } catch {
        // ignore
      }
      setGoogleProfile(null)
      await firebaseSignOut()
      return await api('/auth/logout', { method: 'POST' })
    },
    // Even a failed logout call (expired session, network drop) must leave the
    // UI logged out; the cookie can be cleaned up later.
    onSettled: () => {
      try {
        localStorage.removeItem('urbanmend_google_profile')
      } catch {
        // ignore
      }
      setGoogleProfile(null)
      queryClient.setQueryData(['session'], null)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })

  const rawUser = session.data ?? null
  const user = useMemo(() => {
    if (!rawUser) return null
    return {
      ...rawUser,
      fullName: rawUser.fullName || googleProfile?.fullName || '',
      avatarUrl: rawUser.avatarUrl || rawUser.photoUrl || googleProfile?.photoUrl || '',
      photoUrl: rawUser.photoUrl || rawUser.avatarUrl || googleProfile?.photoUrl || '',
      email: rawUser.email || googleProfile?.email || '',
    }
  }, [rawUser, googleProfile])

  const value = {
    user,
    googleProfile,
    isLoading: session.isLoading,
    isAuthenticated: !!user,
    login,
    firebaseLogin,
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
