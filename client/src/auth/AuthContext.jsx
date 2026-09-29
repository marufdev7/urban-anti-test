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

export const GUEST_USER = {
  id: 'guest',
  email: 'guest@urbanmend.local',
  fullName: 'Guest Citizen',
  role: 'citizen',
  isGuest: true,
  status: 'active',
  preferredLanguage: 'en',
}

export function AuthProvider({ children }) {
  const [isGuest, setIsGuest] = useState(() => {
    try {
      return localStorage.getItem('urbanmend_guest_mode') === 'true'
    } catch {
      return false
    }
  })

  const [googleProfile, setGoogleProfile] = useState(() => {
    try {
      const stored = localStorage.getItem('urbanmend_google_profile')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  // Purge legacy global avatar/name keys on startup so they don't bleed across users
  useEffect(() => {
    try {
      localStorage.removeItem('urbanmend_custom_avatar')
      localStorage.removeItem('urbanmend_custom_name')
    } catch {
      // ignore
    }
  }, [])

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
      } else {
        setGoogleProfile(null)
        try {
          localStorage.removeItem('urbanmend_google_profile')
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
        if (localStorage.getItem('urbanmend_guest_mode') === 'true') {
          return GUEST_USER
        }
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

  const loginAsGuest = () => {
    try {
      localStorage.setItem('urbanmend_guest_mode', 'true')
    } catch {
      // ignore
    }
    setIsGuest(true)
    queryClient.setQueryData(['session'], GUEST_USER)
  }

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
    try {
      localStorage.removeItem('urbanmend_guest_mode')
    } catch {
      // ignore
    }
    setIsGuest(false)

    if (extraProfile) {
      setGoogleProfile(extraProfile)
      try {
        localStorage.setItem('urbanmend_google_profile', JSON.stringify(extraProfile))
      } catch {
        // ignore
      }
    } else {
      // If logging in via password/credentials and NOT Google, clear any mismatched googleProfile
      if (
        user?.email &&
        googleProfile?.email &&
        user.email.toLowerCase() !== googleProfile.email.toLowerCase()
      ) {
        setGoogleProfile(null)
        try {
          localStorage.removeItem('urbanmend_google_profile')
        } catch {
          // ignore
        }
      }
    }
    queryClient.setQueryData(['session'], user)
    await queryClient.invalidateQueries()
  }

  const logout = useMutation({
    mutationFn: async () => {
      try {
        localStorage.removeItem('urbanmend_google_profile')
        localStorage.removeItem('urbanmend_guest_mode')
      } catch {
        // ignore
      }
      setGoogleProfile(null)
      setIsGuest(false)
      await firebaseSignOut()
      if (isGuest) return null
      return await api('/auth/logout', { method: 'POST' })
    },
    onSettled: () => {
      try {
        localStorage.removeItem('urbanmend_google_profile')
        localStorage.removeItem('urbanmend_guest_mode')
      } catch {
        // ignore
      }
      setGoogleProfile(null)
      setIsGuest(false)
      queryClient.setQueryData(['session'], null)
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' })
    },
  })

  // State tick to immediately re-render components when avatar or display name changes
  const [profileTick, setProfileTick] = useState(0)

  const rawUser = isGuest ? GUEST_USER : session.data ?? null

  const updateAvatar = (newAvatarUrl) => {
    if (!rawUser || isGuest) return
    const idKey = rawUser.id ? String(rawUser.id) : ''
    const emailKey = rawUser.email ? rawUser.email.toLowerCase() : ''
    try {
      if (newAvatarUrl) {
        if (idKey) localStorage.setItem(`urbanmend_avatar_${idKey}`, newAvatarUrl)
        if (emailKey) localStorage.setItem(`urbanmend_avatar_${emailKey}`, newAvatarUrl)
      } else {
        if (idKey) {
          localStorage.removeItem(`urbanmend_avatar_${idKey}`)
          localStorage.removeItem(`urbanmend_custom_avatar_${idKey}`)
        }
        if (emailKey) {
          localStorage.removeItem(`urbanmend_avatar_${emailKey}`)
        }
      }
      // Purge any legacy global avatar
      localStorage.removeItem('urbanmend_custom_avatar')
    } catch {
      // ignore
    }
    setProfileTick((t) => t + 1)
  }

  const updateDisplayName = (newName) => {
    if (!rawUser || isGuest) return
    const idKey = rawUser.id ? String(rawUser.id) : ''
    const emailKey = rawUser.email ? rawUser.email.toLowerCase() : ''
    try {
      if (newName) {
        if (idKey) localStorage.setItem(`urbanmend_name_${idKey}`, newName)
        if (emailKey) localStorage.setItem(`urbanmend_name_${emailKey}`, newName)
      } else {
        if (idKey) {
          localStorage.removeItem(`urbanmend_name_${idKey}`)
          localStorage.removeItem(`urbanmend_custom_name_${idKey}`)
        }
        if (emailKey) {
          localStorage.removeItem(`urbanmend_name_${emailKey}`)
        }
      }
      // Purge any legacy global name
      localStorage.removeItem('urbanmend_custom_name')
    } catch {
      // ignore
    }
    setProfileTick((t) => t + 1)
  }

  const user = useMemo(() => {
    if (isGuest) return GUEST_USER
    if (!rawUser) return null

    const idKey = rawUser.id ? String(rawUser.id) : ''
    const emailKey = rawUser.email ? rawUser.email.toLowerCase() : ''

    // 1. User-specific custom avatar and name (STRICTLY scoped to this user)
    let userSpecificAvatar = ''
    let userSpecificName = ''
    try {
      if (idKey) {
        userSpecificAvatar =
          localStorage.getItem(`urbanmend_avatar_${idKey}`) ||
          localStorage.getItem(`urbanmend_custom_avatar_${idKey}`) ||
          ''
        userSpecificName =
          localStorage.getItem(`urbanmend_name_${idKey}`) ||
          localStorage.getItem(`urbanmend_custom_name_${idKey}`) ||
          ''
      }
      if (!userSpecificAvatar && emailKey) {
        userSpecificAvatar =
          localStorage.getItem(`urbanmend_avatar_${emailKey}`) || ''
      }
      if (!userSpecificName && emailKey) {
        userSpecificName =
          localStorage.getItem(`urbanmend_name_${emailKey}`) || ''
      }
    } catch {
      // ignore
    }

    // 2. Check if this active session matches Google Auth
    const isGoogleAuthUser = Boolean(
      emailKey &&
      googleProfile?.email &&
      emailKey === googleProfile.email.toLowerCase()
    )

    // 3. Effective Avatar resolution:
    // - User-specific custom avatar takes priority
    // - If it's a verified Google login, use authentic Google profile photo
    // - Backend avatar / photo url if present
    // - None (empty, defaults to role initials or icon)
    const effectiveAvatar =
      userSpecificAvatar ||
      (isGoogleAuthUser ? googleProfile?.photoUrl : '') ||
      rawUser.avatarUrl ||
      rawUser.photoUrl ||
      ''

    // 4. Effective Display Name resolution:
    // - User-specific custom display name takes priority
    // - If it's a verified Google login, use authentic Google displayName
    // - Backend fullName
    // - Sensible role-tailored default
    const defaultRoleName =
      rawUser.role === 'admin'
        ? 'System Administrator'
        : rawUser.role === 'authority'
          ? (rawUser.assignedArea ? `Authority (${rawUser.assignedArea})` : 'Municipal Officer')
          : (emailKey ? emailKey.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Citizen User')

    const effectiveName =
      userSpecificName ||
      (isGoogleAuthUser ? googleProfile?.fullName : '') ||
      rawUser.fullName ||
      defaultRoleName

    return {
      ...rawUser,
      fullName: effectiveName,
      avatarUrl: effectiveAvatar,
      photoUrl: effectiveAvatar,
      email: rawUser.email || (isGoogleAuthUser ? googleProfile?.email : '') || '',
      isGoogleAuth: isGoogleAuthUser,
    }
  }, [rawUser, isGuest, googleProfile, profileTick])

  const value = {
    user,
    googleProfile,
    isLoading: session.isLoading && !isGuest,
    isAuthenticated: Boolean(user),
    isGuest,
    loginAsGuest,
    login,
    firebaseLogin,
    verifyTwoFactor,
    completeLogin,
    logout,
    updateAvatar,
    updateDisplayName,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
