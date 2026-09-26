import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe,
  HelpCircle,
  Lock,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

export default function CitizenSettingsPage() {
  const { user, logout, updateAvatar, updateDisplayName } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  // Active Tab
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'notifications' | 'privacy'

  // Profile Form state
  const [displayName, setDisplayName] = useState(user?.fullName || '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState(null)

  // Avatar Modal State
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [avatarSuccess, setAvatarSuccess] = useState(null)
  const [avatarError, setAvatarError] = useState(null)

  useEffect(() => {
    if (user) {
      setDisplayName(user.fullName || '')
      setPhone(user.phone ?? '')
      setPreferredLanguage(user.preferredLanguage ?? 'en')
    }
  }, [user])

  // Profile update mutation (phone & language to backend, displayName to local storage)
  const updateProfile = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session'], updated)
      setProfileSuccess(true)
      setProfileError(null)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
    onError: (err) => {
      setProfileError(err.message || 'Failed to update profile settings.')
      setProfileSuccess(false)
    },
  })

  const onSaveProfile = (e) => {
    e.preventDefault()
    setProfileError(null)

    // Update display name
    if (displayName.trim()) {
      updateDisplayName(displayName.trim())
    }

    // Update phone & language
    const trimmed = phone.trim()
    const payload = { preferredLanguage }
    if (trimmed) {
      if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
        setProfileError('Please enter a valid phone number in E.164 format (e.g. +8801712345678).')
        return
      }
      payload.phone = trimmed
    } else if (user?.phone) {
      payload.phone = ''
    }

    updateProfile.mutate(payload)
  }

  // Handle Photo Upload with Client-Side Canvas Compression
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
    e.target.value = ''
  }

  const handleRemoveAvatar = () => {
    updateAvatar('')
    setAvatarSuccess('Profile picture reset to default initials.')
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

  const onSaveNotifs = (e) => {
    e.preventDefault()
    updateNotif.mutate({ inApp, email: emailNotif })
  }

  // Citizen Reports Count for Civic Impact Stats
  const { data: reportsData } = useQuery({
    queryKey: ['reports', 'mine', 'settings-stats'],
    queryFn: () => api('/reports?limit=100'),
    staleTime: 60_000,
  })

  const reports = reportsData?.data ?? []
  const totalReports = reports.length
  const resolvedReports = useMemo(
    () => reports.filter((r) => r.status === 'resolved' || r.status === 'closed').length,
    [reports],
  )

  // Account Deletion Dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const deleteAccount = useMutation({
    mutationFn: () => api('/users/me', { method: 'DELETE' }),
    onSuccess: async () => {
      await logout.mutateAsync()
      navigate('/auth/login')
    },
  })

  const userPhoto = user?.photoUrl || user?.avatarUrl

  return (
    <div className="w-full space-y-6 animate-fade-in pb-10">
      {/* 1. PAGE HEADER */}
      <PageHeader
        title="Citizen Profile & Account Settings"
        subtitle="Manage your personal credentials, profile picture, contact channels, and data privacy."
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

      {/* 2. CITIZEN HERO PROFILE CARD WITH INTERACTIVE CIRCULAR AVATAR */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-panel shadow-sm">
        {/* Civic Emerald Banner */}
        <div className="relative h-32 sm:h-40 bg-gradient-to-r from-[#00382e] via-[#005a4c] to-[#0e7c6d] p-5 sm:p-6 overflow-hidden flex flex-col justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-black/25 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-white/90 border border-white/15 shadow-xs">
              <Shield className="h-3 w-3 text-emerald-300" />
              <span>UrbanMend Civic Network</span>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-black/35 backdrop-blur-md px-3.5 py-1 text-[11px] font-semibold text-white/90 border border-white/20 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Active Citizen Member</span>
            </div>
          </div>
        </div>

        {/* Profile Details Bar */}
        <div className="relative px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-5 text-center md:text-left">
              {/* Profile Avatar with 100% Circular Hover */}
              <div className="-mt-14 sm:-mt-16 relative shrink-0 flex flex-col items-center self-center md:self-start">
                <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full border-4 border-surface-panel bg-surface-sunken shadow-xl ring-2 ring-black/5">
                  <div
                    onClick={() => setAvatarModalOpen(true)}
                    className="group relative h-full w-full rounded-full overflow-hidden flex items-center justify-center cursor-pointer"
                    title="Click to change profile picture"
                  >
                    {userPhoto ? (
                      <img
                        src={userPhoto}
                        alt={user?.fullName || 'Citizen User'}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-4xl">
                        {(user?.fullName || 'C').charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Perfectly Circular Hover Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-2xs">
                      <Camera className="h-6 w-6" />
                      <span className="text-[10px] font-bold mt-1 tracking-wide">Change</span>
                    </div>
                  </div>

                  {/* Camera icon badge */}
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#005a4c] text-white shadow-md border-2 border-surface-panel hover:bg-[#00483c] hover:scale-105 transition active:scale-95 cursor-pointer z-10"
                    title="Update photo"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <span className="mt-2 hidden sm:inline-block text-[10px] font-bold tracking-wider uppercase text-ink-faint">
                  Citizen Member
                </span>
              </div>

              {/* Title & Metadata */}
              <div className="min-w-0 pt-3 sm:pt-4 text-center md:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-ink tracking-tight">
                    {user?.fullName || 'Citizen User'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Verified Citizen</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#005a4c]/20 bg-[#005a4c]/10 px-2.5 py-1 text-xs font-bold text-[#005a4c]">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Civic Contributor</span>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                  <span className="font-mono text-ink-muted">{user?.email || 'No email registered'}</span>
                  <span>•</span>
                  <span className="font-medium text-ink">Dhaka Metropolitan Area</span>
                  <span>•</span>
                  <span className="font-medium text-[#005a4c]">UrbanMend Civic Community</span>
                </div>

                <p className="mt-1 text-[11px] font-medium text-ink-faint">
                  Active participation in local municipal infrastructure reporting &amp; community safety.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Civic Metrics Bar */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-line/80 pt-5 text-xs">
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <User className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Account Status</span>
              </div>
              <p className="mt-1 font-bold text-sm text-emerald-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active &amp; Verified</span>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <FileText className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Reports Submitted</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink">{totalReports} Civic Reports</p>
            </div>

            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Resolved Issues</span>
              </div>
              <p className="mt-1 font-bold text-sm text-emerald-700">{resolvedReports} Fixed / Solved</p>
            </div>

            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <MapPin className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Regional Coverage</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">Dhaka Central, Bangladesh</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. EXECUTIVE TWO-COLUMN SETTINGS WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Rail: Navigation Tabs & Citizen Info (lg:col-span-4 xl:col-span-3) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-5">
          {/* Vertical Settings Tabs */}
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
                  <p className="leading-tight font-bold">Profile &amp; Identity</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'profile' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Personal Details &amp; Contact
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'profile' ? 'text-white' : 'text-ink-faint'}`} />
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
                    In-App &amp; Email Digests
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'notifications' ? 'text-white' : 'text-ink-faint'}`} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-[#005a4c] text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldAlert className={`h-4 w-4 shrink-0 ${activeTab === 'privacy' ? 'text-white' : 'text-[#005a4c]'}`} />
                <div className="truncate">
                  <p className="leading-tight font-bold">Privacy &amp; Security</p>
                  <p className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === 'privacy' ? 'text-white/80' : 'text-ink-faint'}`}>
                    Data Rights &amp; Deletion
                  </p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${activeTab === 'privacy' ? 'text-white' : 'text-ink-faint'}`} />
            </button>
          </div>

          {/* Citizen Civic Card */}
          <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-line/60">
              <ShieldCheck className="h-4 w-4 text-[#005a4c]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">Civic Membership</h4>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Citizen ID:</span>
                <span className="font-mono font-bold text-ink">CTZN-{user?.id?.slice(0, 8) || '8492'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Account Tier:</span>
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                  Verified Resident
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Data Privacy:</span>
                <span className="font-semibold text-ink text-[11px]">
                  Anonymized Public Reports
                </span>
              </div>
            </div>
          </div>

          {/* Citizen Helpdesk & Emergency */}
          <div className="rounded-2xl border border-[#005a4c]/20 bg-gradient-to-br from-[#005a4c]/5 to-teal-500/5 p-4 text-xs space-y-2.5">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-[#005a4c]" />
              <h4 className="font-bold text-ink">Citizen Support Hotline</h4>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              For civic inquiries, report follow-ups, or community feedback:
            </p>
            <div className="space-y-1 font-mono text-[11px] text-[#005a4c] font-bold">
              <p>Email: support@urbanmend.gov.bd</p>
              <p>Emergency Services: 999</p>
            </div>
          </div>
        </div>

        {/* Right Rail: Active Settings Panels (lg:col-span-8 xl:col-span-9) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* TAB 1: PROFILE & IDENTITY */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Personal Information &amp; Contact</span>
                    </span>
                  }
                />
                <CardBody className="space-y-6">
                  <form onSubmit={onSaveProfile} className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* Display Name */}
                      <div>
                        <label htmlFor="settings-name" className="block text-xs font-semibold text-ink">
                          Full Name / Display Name
                        </label>
                        <Input
                          id="settings-name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Maruf Hasan"
                          className="mt-1"
                        />
                        <p className="mt-1 text-[11px] text-ink-muted">
                          Your public or official name shown on your profile and dashboard.
                        </p>
                      </div>

                      {/* Email Address */}
                      <div>
                        <label className="block text-xs font-semibold text-ink">
                          Email Address
                        </label>
                        <div className="mt-1 flex items-center justify-between rounded-panel border border-line bg-surface-sunken px-3.5 py-2 text-sm">
                          <span className="font-medium text-ink">{user?.email ?? '—'}</span>
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <Check className="h-3 w-3" /> Verified
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          Account email used for secure login and incident update digests.
                        </p>
                      </div>

                      {/* Phone Number */}
                      <div>
                        <label htmlFor="settings-phone" className="block text-xs font-semibold text-ink">
                          Contact Phone Number
                        </label>
                        <div className="relative mt-1">
                          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                          <Input
                            id="settings-phone"
                            type="tel"
                            placeholder="+88017XXXXXXXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          E.164 standard format (e.g. +8801712345678) used for urgent report clarifications.
                        </p>
                      </div>

                      {/* Preferred Language */}
                      <div>
                        <label htmlFor="settings-lang" className="block text-xs font-semibold text-ink">
                          Preferred Interface Language
                        </label>
                        <div className="relative mt-1">
                          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted z-10" />
                          <Select
                            id="settings-lang"
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
                          Sets the display language for notifications, reports, and UI.
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
                        <span>Profile details saved successfully!</span>
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

          {/* TAB 2: NOTIFICATION CHANNELS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Notification Channels &amp; Preferences</span>
                    </span>
                  }
                />
                <CardBody>
                  <form onSubmit={onSaveNotifs} className="space-y-4">
                    <p className="text-xs text-ink-muted">
                      Select which channels you want to receive alerts through when your submitted municipal reports are acknowledged, assigned, or solved.
                    </p>

                    <div className="space-y-3 pt-1">
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
                            Show real-time badge updates and toasts in your dashboard header when authorities update status.
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
                          <p className="text-sm font-bold text-ink">Email Status Notifications</p>
                          <p className="text-xs text-ink-muted mt-0.5">
                            Receive email digests whenever your reported issue moves to In Progress or Solved.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="submit"
                        disabled={updateNotif.isPending}
                        className="bg-[#005a4c] hover:bg-[#00483c] text-white"
                      >
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

          {/* TAB 3: PRIVACY & DANGER ZONE */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 animate-fade-in">
              {/* Privacy Information */}
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
                      <span>Civic Data Protection &amp; Privacy Policy</span>
                    </span>
                  }
                />
                <CardBody className="space-y-4 text-xs text-ink-muted leading-relaxed">
                  <p>
                    UrbanMend protects citizen reporter identities. When you file a public report regarding potholes, drainage leaks, or streetlight outages, only the municipal description, GPS coordinates, and media evidence are publicly displayed on the Jurisdiction Map.
                  </p>
                  <div className="rounded-xl border border-line bg-surface-sunken p-3.5 space-y-2 text-ink">
                    <p className="font-bold text-xs">Your privacy guarantees:</p>
                    <ul className="list-disc pl-4 space-y-1 text-ink-muted">
                      <li>Personal phone numbers and email addresses are never revealed publicly.</li>
                      <li>Authority officials only contact you if critical clarification is needed for public safety.</li>
                      <li>You can request permanent account anonymization at any time below.</li>
                    </ul>
                  </div>
                </CardBody>
              </Card>

              {/* Danger Zone: Account Deletion */}
              <Card className="border-rose-200">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2 text-rose-700">
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      <span>Account Deletion &amp; Data Anonymization</span>
                    </span>
                  }
                />
                <CardBody className="space-y-3">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Requesting account deletion will immediately sign you out and completely anonymize your personal identifying information (name, email, phone). Historical reports and safety issues will remain in the public municipal record with author anonymity preserved.
                  </p>
                  <div>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDeleteConfirmText('')
                        setDeleteOpen(true)
                      }}
                    >
                      Request Account Deletion
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* 4. AVATAR UPLOAD & RESET MODAL */}
      <Dialog
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Update Profile Picture"
      >
        <div className="space-y-4 py-2">
          {/* Current Avatar Preview */}
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-sunken p-3.5">
            <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-[#005a4c] bg-surface-panel shadow-sm shrink-0 flex items-center justify-center">
              {userPhoto ? (
                <img src={userPhoto} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#005a4c] text-white font-black text-xl">
                  {(user?.fullName || 'C').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-ink">Active Photo</h4>
              <p className="text-[11px] text-ink-muted mt-0.5 truncate">
                {userPhoto ? 'Custom profile photo active' : 'Default system initials avatar'}
              </p>
              {userPhoto && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Reset to Initials</span>
                </button>
              )}
            </div>
          </div>

          {/* Option: Upload from Device */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-ink">Upload Photo From Computer</h4>
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
            <p className="text-[11px] text-ink-muted">
              Auto-resized and securely stored in your browser (max 8MB).
            </p>
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

      {/* 5. CONFIRM ACCOUNT DELETION MODAL */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Account & Anonymize Data?"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p className="leading-relaxed">
            This action is permanent and cannot be undone. All your active sessions will be revoked, and your personal data will be completely detached from any past reports.
          </p>
          <div>
            <label htmlFor="confirm-delete-input" className="block font-medium text-ink">
              Type <span className="font-mono font-bold text-rose-600">DELETE</span> to confirm:
            </label>
            <Input
              id="confirm-delete-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-1 font-mono"
            />
          </div>
          {deleteAccount.isError && (
            <p className="text-xs text-rose-600 font-semibold">
              {deleteAccount.error.message}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteConfirmText !== 'DELETE' || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? <Spinner size="sm" /> : 'Confirm Deletion'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
