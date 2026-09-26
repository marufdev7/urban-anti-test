import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  QrCode,
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
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="%23005a4c" rx="64"/><path d="M64 28 L94 40 L94 72 C94 92 64 104 64 104 C64 104 34 92 34 72 L34 40 Z" fill="%23ffffff" opacity="0.95"/><path d="M54 64 L62 72 L76 56" fill="none" stroke="%23005a4c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    id: 'officer-1',
    name: 'Field Lead',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-2',
    name: 'Operations Director',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-3',
    name: 'Safety Inspector',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&auto=format&fit=crop&q=80',
  },
  {
    id: 'officer-4',
    name: 'Civic Coordinator',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&auto=format&fit=crop&q=80',
  },
]

export default function AuthoritySettingsPage() {
  const { user, updateAvatar, updateDisplayName } = useAuth()
  const { data: categories } = useCategories()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 1. PAGE HEADER */}
      <PageHeader
        title="Authority Profile & Operations Hub"
        subtitle="Manage personnel credentials, authority profile picture, jurisdictional command scope, and security standards."
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
        <div className="relative h-28 sm:h-36 bg-gradient-to-r from-[#00382e] via-[#005a4c] to-[#0e7c6d] p-4 flex items-end justify-end">
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
          <div className="relative z-10 flex items-center gap-2 rounded-full bg-black/30 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-white/90 border border-white/15">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active Operational Duty</span>
          </div>
        </div>

        {/* Profile Details Bar */}
        <div className="relative px-5 pb-5 pt-0 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 sm:-mt-16">
            {/* Avatar & Identifiers */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
              {/* Profile Avatar with Photo Edit Trigger */}
              <div className="relative group shrink-0">
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-surface-panel bg-surface-sunken shadow-md overflow-hidden flex items-center justify-center">
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
                    <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-3xl">
                      {(user?.fullName || 'A').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Hover overlay button to change picture */}
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer backdrop-blur-2xs"
                  title="Update profile photo"
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-[10px] font-bold mt-1">Change</span>
                </button>

                {/* Badge button at bottom-right of avatar */}
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(true)}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#005a4c] text-white shadow-md border-2 border-surface-panel hover:bg-[#00483c] transition active:scale-95 cursor-pointer"
                  title="Change photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>

              {/* Personnel Title & Badges */}
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-ink">
                    {user?.fullName || 'Municipal Operations Official'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#005a4c]/20 bg-[#005a4c]/10 px-2.5 py-0.5 text-xs font-bold text-[#005a4c]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Authority</span>
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-ink-muted flex items-center justify-center sm:justify-start gap-2">
                  <span>{user?.email}</span>
                  <span>•</span>
                  <span className="capitalize font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200 text-[11px]">
                    Verified Staff
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Action Button */}
            <div className="flex items-center justify-center gap-2 pt-2 sm:pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAvatarModalOpen(true)}
                className="gap-1.5"
              >
                <Camera className="h-3.5 w-3.5 text-ink-muted" />
                <span>Update Photo</span>
              </Button>
            </div>
          </div>

          {/* Quick Jurisdictional Highlights Bar */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line pt-4 text-xs">
            <div className="rounded-xl border border-line bg-surface-sunken p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Jurisdiction</span>
              <p className="mt-0.5 font-bold text-ink truncate">{jurisdictionTitle}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Authorized Sectors</span>
              <p className="mt-0.5 font-bold text-ink truncate">
                {user?.categoryScope?.length ? `${user.categoryScope.length} Active Categories` : 'All Municipal'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Operational Access</span>
              <p className="mt-0.5 font-bold text-ink truncate">Triage, Dispatch &amp; Resolve</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">2FA Protection</span>
              <p className="mt-0.5 font-bold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>TOTP Security</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SETTINGS NAVIGATION TABS */}
      <div className="flex border-b border-line gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'profile'
              ? 'border-[#005a4c] text-[#005a4c]'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <User className="h-4 w-4" />
          <span>Profile &amp; Contact</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scope')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'scope'
              ? 'border-[#005a4c] text-[#005a4c]'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Jurisdiction &amp; Scope</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'security'
              ? 'border-[#005a4c] text-[#005a4c]'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <Lock className="h-4 w-4" />
          <span>Security &amp; 2FA</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'notifications'
              ? 'border-[#005a4c] text-[#005a4c]'
              : 'border-transparent text-ink-muted hover:text-ink hover:border-line'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Notification Alerts</span>
        </button>
      </div>

      {/* 4. TAB 1: PROFILE & CONTACT DETAILS */}
      {activeTab === 'profile' && (
        <Card className="animate-fade-in">
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
      )}

      {/* 5. TAB 2: JURISDICTION & MANDATE SCOPE */}
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

      {/* 6. TAB 3: SECURITY & TWO-FACTOR AUTH (2FA) */}
      {activeTab === 'security' && (
        <Card className="animate-fade-in">
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
      )}

      {/* 7. TAB 4: NOTIFICATION SETTINGS */}
      {activeTab === 'notifications' && (
        <Card className="animate-fade-in">
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
      )}

      {/* 8. AVATAR UPLOAD & SELECTION MODAL */}
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
            Cancel
          </Button>
        </div>
      </Dialog>

      {/* 9. 2FA ENROLLMENT MODAL */}
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
