import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, useCategories } from '../../hooks/data'
import { BANGLADESH_CITIES, getJurisdictionLabel } from '../../lib/zones'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

const PRESET_AVATARS = [
  {
    id: 'official-shield',
    name: 'Municipal Shield',
    role: 'Official Insignia',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="%23005a4c" rx="64"/><path d="M64 28 L94 40 L94 72 C94 92 64 104 64 104 C64 104 34 92 34 72 L34 40 Z" fill="%23ffffff" opacity="0.95"/><path d="M54 64 L62 72 L76 56" fill="none" stroke="%23005a4c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    id: 'officer-1',
    name: 'Field Lead',
    role: 'Operations Command',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-2',
    name: 'Operations Director',
    role: 'Public Works Head',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-3',
    name: 'Safety Inspector',
    role: 'Civic Triage Lead',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-4',
    name: 'Civic Coordinator',
    role: 'Community Liaison',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&auto=format&fit=crop&q=80',
  },
]

export default function AuthoritySettingsPage() {
  const { user, updateAvatar, updateDisplayName } = useAuth()
  const { data: categories } = useCategories()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const inlineFileInputRef = useRef(null)

  // Active Settings Tab
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'scope' | 'security' | 'notifications'

  // Profile Form state
  const [displayName, setDisplayName] = useState(user?.fullName || '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState(null)

  // Avatar Upload States
  const [avatarSuccess, setAvatarSuccess] = useState(null)
  const [avatarError, setAvatarError] = useState(null)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)

  useEffect(() => {
    if (user) {
      setDisplayName(user.fullName || '')
      setPhone(user.phone ?? '')
      setPreferredLanguage(user.preferredLanguage ?? 'en')
    }
  }, [user])

  const updateProfile = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session'], updated)
      setProfileSuccess(true)
      setProfileError(null)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
    onError: (err) => {
      setProfileError(err.message || 'Failed to update contact preferences.')
      setProfileSuccess(false)
    },
  })

  const handleSaveProfile = (e) => {
    e.preventDefault()
    setProfileError(null)

    // 1. Update display name in custom storage
    if (displayName.trim()) {
      updateDisplayName(displayName.trim())
    }

    // 2. Update phone and language on backend
    const trimmedPhone = phone.trim()
    const payload = { preferredLanguage }
    if (trimmedPhone) {
      if (!/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
        setProfileError('Please enter a valid official phone number in E.164 format (e.g. +8801712345678).')
        return
      }
      payload.phone = trimmedPhone
    } else if (user?.phone) {
      payload.phone = ''
    }

    updateProfile.mutate(payload)
  }

  // Handle Local Photo Upload via Canvas Compression
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (PNG, JPG, WebP).')
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setAvatarError('Image is too large. Please select an image under 8MB.')
      return
    }

    setAvatarError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const MAX_SIZE = 256
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width)
              width = MAX_SIZE
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height)
              height = MAX_SIZE
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          const compressed = canvas.toDataURL('image/jpeg', 0.88)
          updateAvatar(compressed)
          setAvatarSuccess('Profile picture updated successfully!')
          setAvatarModalOpen(false)
          setTimeout(() => setAvatarSuccess(null), 3500)
        } catch (err) {
          setAvatarError('Could not process photo. Please try a different image.')
        }
      }
      img.onerror = () => {
        setAvatarError('Invalid image data. Please try another photo.')
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)

    // Reset input
    e.target.value = ''
  }

  const handleSelectPreset = (url) => {
    updateAvatar(url)
    setAvatarSuccess('Official avatar selected!')
    setAvatarModalOpen(false)
    setTimeout(() => setAvatarSuccess(null), 3500)
  }

  const handleRemoveAvatar = () => {
    updateAvatar('')
    setAvatarSuccess('Profile picture removed.')
    setAvatarModalOpen(false)
    setTimeout(() => setAvatarSuccess(null), 3500)
  }

  // Notification Preferences
  const notifQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api('/notification-preferences'),
  })

  const [inApp, setInApp] = useState(true)
  const [emailNotif, setEmailNotif] = useState(true)
  const [notifSaved, setNotifSaved] = useState(false)

  useEffect(() => {
    if (notifQuery.data) {
      setInApp(Boolean(notifQuery.data.inApp))
      setEmailNotif(Boolean(notifQuery.data.email))
    }
  }, [notifQuery.data])

  const updateNotif = useMutation({
    mutationFn: (body) => api('/notification-preferences', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['notification-preferences'], updated)
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 3000)
    },
  })

  // 2FA Enrollment State & Modal
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)
  const [enrollData, setEnrollData] = useState(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState(null)
  const [totpSuccess, setTotpSuccess] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  const enroll2FA = useMutation({
    mutationFn: () => api('/auth/2fa/enroll', { method: 'POST' }),
    onSuccess: (res) => {
      setEnrollData(res)
      setTotpError(null)
      setTwoFactorOpen(true)
    },
  })

  const verify2FA = useMutation({
    mutationFn: (code) => api('/auth/2fa/verify', { method: 'POST', body: { code } }),
    onSuccess: () => {
      setTotpSuccess(true)
      setTotpError(null)
      setTimeout(() => {
        setTwoFactorOpen(false)
        setEnrollData(null)
        setTotpCode('')
      }, 2000)
    },
    onError: (err) => setTotpError(err.message),
  })

  const copySecret = () => {
    if (enrollData?.secret) {
      navigator.clipboard.writeText(enrollData.secret)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  // Assigned City & Scopes
  const assignedCity = useMemo(() => {
    if (!user?.assignedArea) return null
    return BANGLADESH_CITIES.find(
      (c) => c.id.toLowerCase() === user.assignedArea.toLowerCase(),
    )
  }, [user?.assignedArea])

  const jurisdictionTitle = getJurisdictionLabel(user?.assignedArea) || 'Municipal Operations Hub'
  const userPhoto = user?.photoUrl || user?.avatarUrl

  return (
    <div className="w-full space-y-6 animate-fade-in pb-10">
      {/* 1. PAGE HEADER */}
      <PageHeader
        title="Authority Profile & Operations Hub"
        subtitle="Manage personnel credentials, authority profile picture, jurisdictional command scope, and security standards."
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/authority/map"
              className="inline-flex items-center gap-1.5 rounded-panel border border-line bg-surface-panel px-3 py-1.5 text-xs font-semibold text-ink shadow-xs hover:bg-surface-sunken transition"
            >
              <MapPin className="h-3.5 w-3.5 text-[#005a4c]" />
              <span>Jurisdiction Map</span>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAvatarModalOpen(true)}
              className="gap-1.5"
            >
              <Camera className="h-3.5 w-3.5 text-[#005a4c]" />
              <span>Change Photo</span>
            </Button>
          </div>
        }
      />

      {/* FEEDBACK ALERTS */}
      {avatarSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 animate-fade-in shadow-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{avatarSuccess}</span>
        </div>
      )}
      {avatarError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 animate-fade-in shadow-xs">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{avatarError}</span>
        </div>
      )}

      {/* 2. EXECUTIVE HERO PROFILE CARD WITH AVATAR CONTROLS */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-panel shadow-sm">
        {/* Decorative Municipal Header Banner */}
        <div className="relative h-36 sm:h-44 md:h-48 bg-gradient-to-r from-[#002d25] via-[#005043] to-[#087f6e] p-5 sm:p-6 overflow-hidden flex flex-col justify-between">
          {/* Subtle Geometric Dot Grid */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />
          
          {/* Decorative Municipal Watermark Outline */}
          <div className="pointer-events-none absolute -right-6 -bottom-10 opacity-10 text-white">
            <svg width="220" height="220" viewBox="0 0 128 128" fill="currentColor">
              <path d="M64 12 L108 28 L108 72 C108 98 64 116 64 116 C64 116 20 98 20 72 L20 28 Z" />
            </svg>
          </div>

          {/* Top Bar inside Banner */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-black/25 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-white/90 border border-white/15 shadow-xs">
              <Building className="h-3 w-3 text-emerald-300" />
              <span className="tracking-wide">Municipal Command Division</span>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-black/35 backdrop-blur-md px-3.5 py-1 text-[11px] font-semibold text-white/90 border border-white/20 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active Operational Duty</span>
            </div>
          </div>

          {/* Bottom subtle banner note */}
          <div className="relative z-10 hidden sm:block">
            <span className="text-[11px] font-medium text-white/70 tracking-wider uppercase">
              UrbanMend Municipal Resilience &amp; Dispatch Authority
            </span>
          </div>
        </div>

        {/* Profile Details Bar - Generous spacing between banner and text */}
        <div className="relative px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            {/* Avatar & Personnel Identifiers */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-5 text-center md:text-left">
              {/* Profile Avatar with Photo Edit Trigger (Only the avatar has negative margin) */}
              <div className="-mt-14 sm:-mt-18 relative group shrink-0 self-center md:self-start">
                <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-full border-4 border-surface-panel bg-surface-sunken shadow-xl overflow-hidden flex items-center justify-center ring-2 ring-black/5">
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt={user?.fullName || 'Authority Official'}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-4xl">
                      {(user?.fullName || 'A').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Hover overlay button to change picture */}
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer backdrop-blur-2xs"
                  title="Update profile photo"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-[10px] font-bold mt-1">Change</span>
                </button>

                {/* Badge button at bottom-right of avatar */}
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#005a4c] text-white shadow-md border-2 border-surface-panel hover:bg-[#00483c] hover:scale-105 transition active:scale-95 cursor-pointer"
                  title="Change photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Personnel Title & Badges with ample, clean breathing room below the banner */}
              <div className="min-w-0 pt-3 sm:pt-4 text-center md:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-ink tracking-tight">
                    {user?.fullName || 'Municipal Operations Official'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#005a4c]/20 bg-[#005a4c]/10 px-3 py-1 text-xs font-bold text-[#005a4c]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Authority Command</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Verified Staff</span>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                  <span className="font-mono text-ink-muted">{user?.email}</span>
                  <span>•</span>
                  <span className="font-medium text-ink">
                    {user?.department || 'Department of Public Safety & Works'}
                  </span>
                  {user?.assignedArea && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#005a4c] bg-[#005a4c]/5 px-2 py-0.5 rounded-md">
                        <MapPin className="h-3 w-3" />
                        <span>{jurisdictionTitle}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions on the Right */}
            <div className="flex items-center justify-center md:justify-end gap-2.5 pt-2 md:pt-4 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAvatarModalOpen(true)}
                className="gap-2 shadow-xs"
              >
                <Camera className="h-4 w-4 text-[#005a4c]" />
                <span>Update Photo</span>
              </Button>
            </div>
          </div>

          {/* Quick Jurisdictional Highlights Bar - Spanning full width */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-line/80 pt-5 text-xs">
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <MapPin className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Command Jurisdiction</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">{jurisdictionTitle}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <Wrench className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Authorized Sectors</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">
                {user?.categoryScope?.length ? `${user.categoryScope.length} Active Categories` : '7 Municipal Sectors'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <Layers className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Operational Mandate</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">Triage, Dispatch &amp; Resolve</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Security Protocol</span>
              </div>
              <p className="mt-1 font-bold text-sm text-emerald-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>TOTP 2FA Enforced</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. EXECUTIVE TWO-COLUMN SETTINGS WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Rail: Navigation Menu & Operational Status (lg:col-span-4 xl:col-span-3) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-5">
          {/* Vertical Settings Tab Navigation */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-panel p-2 shadow-xs space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <User className={`h-4 w-4 shrink-0 ${activeTab === 'profile' ? 'text-white' : 'text-[#005a4c]'}`} />
                <div className="truncate">
                  <p className="leading-tight font-bold">Profile &amp; Contact</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'profile' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Credentials &amp; Avatar
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'profile' ? 'text-white' : 'text-ink-faint'}`} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scope')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'scope'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers className={`h-4 w-4 shrink-0 ${activeTab === 'scope' ? 'text-white' : 'text-[#005a4c]'}`} />
                <div className="truncate">
                  <p className="leading-tight font-bold">Jurisdiction &amp; Scope</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'scope' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Mandate &amp; Category Zones
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'scope' ? 'text-white' : 'text-ink-faint'}`} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Lock className={`h-4 w-4 shrink-0 ${activeTab === 'security' ? 'text-white' : 'text-[#005a4c]'}`} />
                <div className="truncate">
                  <p className="leading-tight font-bold">Security &amp; 2FA</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'security' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Authenticator &amp; Sessions
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'security' ? 'text-white' : 'text-ink-faint'}`} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Bell className={`h-4 w-4 shrink-0 ${activeTab === 'notifications' ? 'text-white' : 'text-[#005a4c]'}`} />
                <div className="truncate">
                  <p className="leading-tight font-bold">Notification Alerts</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'notifications' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Live Dispatches &amp; Emails
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'notifications' ? 'text-white' : 'text-ink-faint'}`} />
            </button>
          </div>

          {/* Official Authority Clearance Card */}
          <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-line/60">
              <ShieldCheck className="h-4 w-4 text-[#005a4c]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">Operational Clearance</h4>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Authority ID:</span>
                <span className="font-mono font-bold text-ink">AUTH-{user?.id?.slice(0, 8) || '8492'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Assigned Zone:</span>
                <span className="font-semibold text-ink">{assignedCity?.id?.toUpperCase() || 'DHAKA-CENTRAL'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Clearance Tier:</span>
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                  Tier-3 Field Command
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Status:</span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Operational Duty
                </span>
              </div>
            </div>
          </div>

          {/* Municipal Emergency Line & Helpdesk */}
          <div className="rounded-2xl border border-[#005a4c]/20 bg-gradient-to-br from-[#005a4c]/5 to-teal-500/5 p-4 text-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#005a4c]" />
              <h4 className="font-bold text-ink">Dispatch Central Hotline</h4>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              For urgent inter-agency cross-jurisdiction escalations or technical system interruptions:
            </p>
            <div className="space-y-1 font-mono text-[11px] text-[#005a4c] font-bold">
              <p>Radio: VHF Channel 14</p>
              <p>Hotline: +880 2-9888888</p>
            </div>
          </div>
        </div>

        {/* Right Rail: Settings Panels (lg:col-span-8 xl:col-span-9) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* TAB 1: PROFILE & CONTACT DETAILS */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              {/* Photo & Avatar Customization Card (Inline Management) */}
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Authority Profile Picture &amp; Visual Identity</span>
                    </span>
                  }
                  action={
                    userPhoto ? (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Reset to Initials</span>
                      </button>
                    ) : null
                  }
                />
                <CardBody className="space-y-5">
                  <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl border border-line bg-surface-sunken">
                    <div className="relative group shrink-0">
                      <div className="h-20 w-20 rounded-full border-2 border-[#005a4c] bg-surface-panel shadow-sm overflow-hidden flex items-center justify-center">
                        {userPhoto ? (
                          <img src={userPhoto} alt="Current profile" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-2xl">
                            {(user?.fullName || 'A').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 text-center sm:text-left space-y-1">
                      <h4 className="text-sm font-bold text-ink">
                        {userPhoto ? 'Custom Profile Photo Active' : 'Default Official Initials Avatar'}
                      </h4>
                      <p className="text-xs text-ink-muted">
                        Upload a professional official headshot from your device, or choose from our verified municipal preset avatars below.
                      </p>
                      <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                        <input
                          type="file"
                          ref={inlineFileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => inlineFileInputRef.current?.click()}
                          className="gap-1.5 text-xs shadow-xs"
                        >
                          <Upload className="h-3.5 w-3.5 text-[#005a4c]" />
                          <span>Upload From Computer</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Preset Avatars Selection Row */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-ink">
                        Or Select an Official Municipal Avatar
                      </h5>
                      <span className="text-[11px] text-ink-muted">Instant one-click activation</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {PRESET_AVATARS.map((preset) => {
                        const isSelected = userPhoto === preset.url
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectPreset(preset.url)}
                            className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition cursor-pointer hover:border-[#005a4c] hover:bg-[#005a4c]/5 ${
                              isSelected
                                ? 'border-[#005a4c] bg-[#005a4c]/10 ring-2 ring-[#005a4c]'
                                : 'border-line bg-surface-panel'
                            }`}
                          >
                            <div className="relative">
                              <img
                                src={preset.url}
                                alt={preset.name}
                                className="h-12 w-12 rounded-full object-cover shadow-2xs group-hover:scale-105 transition"
                              />
                              {isSelected && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#005a4c] text-white">
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 w-full">
                              <p className="text-xs font-bold text-ink truncate">{preset.name}</p>
                              <p className="text-[10px] text-ink-muted truncate">{preset.role}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Personnel Credentials Form */}
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Operational Personnel Credentials</span>
                    </span>
                  }
                />
                <CardBody className="space-y-6">
                  <form onSubmit={handleSaveProfile} className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* Full Name / Official Title */}
                      <div>
                        <label htmlFor="auth-name" className="block text-xs font-semibold text-ink">
                          Official Display Name / Title
                        </label>
                        <Input
                          id="auth-name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Md. Maruf - Municipal Operations Lead"
                          className="mt-1"
                        />
                        <p className="mt-1 text-[11px] text-ink-muted">
                          This official name is displayed in the top bar, incident work logs, and dispatch audit entries.
                        </p>
                      </div>

                      {/* Email (System ID) */}
                      <div>
                        <label className="block text-xs font-semibold text-ink">
                          Official System Email
                        </label>
                        <div className="mt-1 flex items-center justify-between rounded-panel border border-line bg-surface-sunken px-3.5 py-2 text-sm">
                          <span className="font-medium text-ink">{user?.email ?? '—'}</span>
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <Check className="h-3 w-3" /> System Verified
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          Government domain account tied to municipal security protocols.
                        </p>
                      </div>

                      {/* Phone / Emergency Hotline Contact */}
                      <div>
                        <label htmlFor="auth-phone" className="block text-xs font-semibold text-ink">
                          Duty Contact Phone Number
                        </label>
                        <div className="relative mt-1">
                          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                          <Input
                            id="auth-phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+88017XXXXXXXX"
                            className="pl-9"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          E.164 standard format (e.g. +8801712345678) used for urgent dispatch calls.
                        </p>
                      </div>

                      {/* Preferred Language */}
                      <div>
                        <label htmlFor="auth-lang" className="block text-xs font-semibold text-ink">
                          Preferred Interface Language
                        </label>
                        <div className="relative mt-1">
                          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted z-10" />
                          <Select
                            id="auth-lang"
                            className="pl-9 w-full"
                            value={preferredLanguage}
                            onChange={(e) => setPreferredLanguage(e.target.value)}
                            options={[
                              { value: 'en', label: 'English (Default)' },
                              { value: 'bn', label: 'বাংলা (Bengali)' },
                            ]}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          Controls dashboard UI language and incident status notifications.
                        </p>
                      </div>
                    </div>

                    {profileError && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>{profileError}</span>
                      </div>
                    )}

                    {profileSuccess && (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Your operational profile preferences were saved successfully!</span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="submit"
                        disabled={updateProfile.isPending}
                        className="bg-[#005a4c] hover:bg-[#00483c] text-white"
                      >
                        {updateProfile.isPending ? <Spinner size="sm" /> : 'Save Profile Changes'}
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 2: JURISDICTION & MANDATE SCOPE */}
          {activeTab === 'scope' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Jurisdictional Command Area</span>
                    </span>
                  }
                  action={
                    <Link
                      to="/authority/map"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#005a4c] hover:underline"
                    >
                      <span>Open Jurisdiction Map</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  }
                />
                <CardBody className="space-y-4">
                  <div className="rounded-2xl border border-line bg-surface-sunken p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Assigned Operations City</span>
                        <h3 className="text-base font-bold text-ink mt-0.5 flex items-center gap-2">
                          <Building className="h-4 w-4 text-[#005a4c]" />
                          <span>{jurisdictionTitle}</span>
                        </h3>
                        <p className="text-xs text-ink-muted mt-1">
                          All citizen reports, hotlines, and manual incident entries inside this geographic bounding box are routed to your authority dashboard.
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <span className="rounded-full bg-[#005a4c] text-white px-3 py-1 text-xs font-bold shadow-xs">
                          Official Jurisdiction
                        </span>
                      </div>
                    </div>

                    {assignedCity && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-line/60 pt-3 text-[11px]">
                        <div>
                          <span className="text-ink-faint">Division:</span>{' '}
                          <strong className="text-ink">{assignedCity.division}</strong>
                        </div>
                        <div>
                          <span className="text-ink-faint">Center GPS:</span>{' '}
                          <strong className="text-ink font-mono">{assignedCity.center.lat.toFixed(4)}, {assignedCity.center.lng.toFixed(4)}</strong>
                        </div>
                        <div>
                          <span className="text-ink-faint">City Code:</span>{' '}
                          <strong className="text-ink uppercase">{assignedCity.id}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Category Scope Breakdown */}
                  <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-2xs">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink">Authorized Municipal Sectors</h4>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Your account is designated to review, assign field units, and resolve issues within the following municipal categories:
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {user?.categoryScope?.length ? (
                        user.categoryScope.map((slug) => (
                          <span
                            key={slug}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#005a4c]/20 bg-[#005a4c]/5 px-3 py-1.5 text-xs font-bold text-[#005a4c]"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            <span>{categoryLabel(categories, slug)}</span>
                          </span>
                        ))
                      ) : (
                        <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                          ★ Unrestricted — Full Municipal Category Access
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operational Permissions Checklist */}
                  <div className="rounded-2xl border border-line bg-surface-sunken p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">Authority Privileges &amp; Actions</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="flex items-center gap-2 rounded-lg bg-surface-panel border border-line p-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span><strong>Incident Triage:</strong> Review and verify raw citizen reports</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-surface-panel border border-line p-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span><strong>Field Dispatch:</strong> Assign specialized repair and emergency teams</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-surface-panel border border-line p-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span><strong>Hotline Intake:</strong> Manually log phone and radio dispatches</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-surface-panel border border-line p-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span><strong>Work Queue:</strong> Update incident status to In Progress &amp; Solved</span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 3: SECURITY & TWO-FACTOR AUTH (2FA) */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Account Protection &amp; Two-Factor Authentication</span>
                    </span>
                  }
                />
                <CardBody className="space-y-5">
                  <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-sunken p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#005a4c] text-white shadow-xs">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink">Two-Factor Authentication (TOTP)</h4>
                      <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                        Two-factor authentication adds an imperative layer of defense to municipal authority accounts.
                        When signing in from a new workstation or session, you will be prompted for a 6-digit one-time code from your authenticator app (Google Authenticator, Microsoft Authenticator, or Bitwarden).
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <Button
                          onClick={() => enroll2FA.mutate()}
                          disabled={enroll2FA.isPending}
                          className="bg-[#005a4c] hover:bg-[#00483c] text-white"
                        >
                          {enroll2FA.isPending ? <Spinner size="sm" /> : 'Enroll / Re-Enroll Authenticator'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Security Audit Checklist */}
                  <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-2xs space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink">Security Compliance Verification</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-line/60 pb-2">
                        <span className="text-ink-muted">Transport Security</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Enforced TLS / HTTPS
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-line/60 pb-2">
                        <span className="text-ink-muted">Role-Based Access Control</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Authority Tier RBAC
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-muted">Audit Logging</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Immutable Activity Trail
                        </span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* TAB 4: NOTIFICATION SETTINGS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Operational Alert Preferences</span>
                    </span>
                  }
                />
                <CardBody>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      updateNotif.mutate({ inApp, email: emailNotif })
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-sunken p-4 cursor-pointer hover:border-line-focus transition">
                        <input
                          type="checkbox"
                          checked={inApp}
                          onChange={(e) => setInApp(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-line text-[#005a4c] focus:ring-[#005a4c]"
                        />
                        <div>
                          <p className="text-sm font-bold text-ink">In-App Live Alerts</p>
                          <p className="text-xs text-ink-muted mt-0.5">
                            Display real-time notification toasts and badge alerts when new high-priority reports or citizen confirmations occur.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-sunken p-4 cursor-pointer hover:border-line-focus transition">
                        <input
                          type="checkbox"
                          checked={emailNotif}
                          onChange={(e) => setEmailNotif(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-line text-[#005a4c] focus:ring-[#005a4c]"
                        />
                        <div>
                          <p className="text-sm font-bold text-ink">Email Dispatch Notifications</p>
                          <p className="text-xs text-ink-muted mt-0.5">
                            Receive daily shift briefings and critical escalation emails directly to your verified address.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button type="submit" disabled={updateNotif.isPending} className="bg-[#005a4c] hover:bg-[#00483c] text-white">
                        {updateNotif.isPending ? <Spinner size="sm" /> : 'Save Notification Preferences'}
                      </Button>
                      {notifSaved && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-status-resolved">
                          <Check className="h-4 w-4" /> Preferences Saved
                        </span>
                      )}
                    </div>
                  </form>
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* 4. AVATAR UPLOAD & SELECTION MODAL */}
      <Dialog
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Update Authority Profile Picture"
      >
        <div className="space-y-4 py-2">
          {/* Current Avatar Preview */}
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-sunken p-3">
            <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-[#005a4c] bg-surface-panel shadow-sm shrink-0 flex items-center justify-center">
              {userPhoto ? (
                <img src={userPhoto} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-xl">
                  {(user?.fullName || 'A').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink">Active Photo</h4>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {userPhoto ? 'Custom official picture active' : 'Default initials avatar'}
              </p>
              {userPhoto && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Remove Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Option 1: Upload from Computer */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-ink">Upload From Device</h4>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-center gap-2 border-dashed py-3"
            >
              <Upload className="h-4 w-4 text-[#005a4c]" />
              <span>Browse Computer Photo (PNG, JPG, WebP)</span>
            </Button>
          </div>

          {/* Option 2: Select from Curated Official Avatars */}
          <div className="space-y-2 pt-1 border-t border-line">
            <h4 className="text-xs font-bold text-ink">Or Choose an Official Avatar</h4>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_AVATARS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.url)}
                  className={`group flex flex-col items-center gap-1 p-1.5 rounded-xl border transition cursor-pointer hover:border-[#005a4c] hover:bg-[#005a4c]/5 ${
                    userPhoto === preset.url ? 'border-[#005a4c] bg-[#005a4c]/10' : 'border-line'
                  }`}
                  title={preset.name}
                >
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="h-10 w-10 rounded-full object-cover shadow-2xs group-hover:scale-105 transition"
                  />
                  <span className="text-[9px] font-medium text-ink-muted truncate w-full text-center">
                    {preset.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {avatarError && (
            <p className="text-xs font-semibold text-status-critical" role="alert">
              {avatarError}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAvatarModalOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* 5. 2FA ENROLLMENT MODAL */}
      <Dialog
        open={twoFactorOpen}
        onClose={() => setTwoFactorOpen(false)}
        title="Enroll Two-Factor Authenticator"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p>
            Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, or Bitwarden):
          </p>

          <div className="rounded-panel border border-line bg-surface-sunken p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Base32 Secret Key
            </p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="font-mono text-base font-bold tracking-wider text-[#005a4c] select-all">
                {enrollData?.secret}
              </span>
              <button
                type="button"
                onClick={copySecret}
                className="rounded p-1 text-ink-muted hover:bg-surface hover:text-ink cursor-pointer"
                title="Copy secret key"
              >
                {copiedKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <label htmlFor="totp-input" className="block font-medium text-ink">
              Enter the 6-digit code from your app to verify:
            </label>
            <Input
              id="totp-input"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.trim())}
              placeholder="000000"
              maxLength={6}
              className="mt-1 font-mono text-center text-lg tracking-widest"
            />
          </div>

          {totpError && (
            <p className="text-xs text-status-critical" role="alert">
              {totpError}
            </p>
          )}

          {totpSuccess && (
            <p className="flex items-center gap-1 text-xs font-semibold text-status-resolved">
              <ShieldCheck className="h-4 w-4" /> 2FA successfully enrolled and confirmed!
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTwoFactorOpen(false)}>
            Close
          </Button>
          <Button
            disabled={totpCode.length !== 6 || verify2FA.isPending || totpSuccess}
            onClick={() => verify2FA.mutate(totpCode)}
            className="bg-[#005a4c] hover:bg-[#00483c] text-white"
          >
            {verify2FA.isPending ? <Spinner size="sm" /> : 'Confirm & Activate 2FA'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
