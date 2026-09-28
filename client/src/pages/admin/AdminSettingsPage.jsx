import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  Building,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit2,
  FolderTree,
  Globe,
  KeyRound,
  Layers,
  Lock,
  Mail,
  MapPin,
  Network,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
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
import { useCategories } from '../../hooks/data'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'
import TabLoadingSkeleton from '../../components/ui/TabLoadingSkeleton'

const ADMIN_PRESET_AVATARS = [
  {
    id: 'admin-seal',
    name: 'Municipal Executive Seal',
    role: 'Central Governance',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="%23005a4c" rx="64"/><circle cx="64" cy="64" r="48" fill="none" stroke="%23fbbf24" stroke-width="4"/><path d="M64 24 L94 38 L94 74 C94 94 64 106 64 106 C64 106 34 94 34 74 L34 38 Z" fill="%23fbbf24" opacity="0.95"/><path d="M52 64 L60 72 L76 54" fill="none" stroke="%23005a4c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    id: 'official-shield',
    name: 'Municipal Shield',
    role: 'Official Insignia',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="%230f172a" rx="64"/><path d="M64 28 L94 40 L94 72 C94 92 64 104 64 104 C64 104 34 92 34 72 L34 40 Z" fill="%2338bdf8" opacity="0.95"/><path d="M54 64 L62 72 L76 56" fill="none" stroke="%230f172a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
]

export default function AdminSettingsPage() {
  const { user, updateAvatar, updateDisplayName } = useAuth()
  const { data: categories } = useCategories()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Active Settings Tab: 'profile' | 'reference' | 'security' | 'health' | 'notifications'
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    ['profile', 'reference', 'security', 'health', 'notifications'].includes(tabParam)
      ? tabParam
      : 'profile',
  )
  const [isTabLoading, setIsTabLoading] = useState(false)
  const tabTimerRef = useRef(null)

  const TAB_LABELS = {
    profile: 'Profile & Credentials',
    reference: 'Reference Data & Taxonomies',
    security: 'Security & 2FA',
    health: 'Infrastructure & Health',
    notifications: 'Notifications',
  }

  useEffect(() => {
    if (tabParam && ['profile', 'reference', 'security', 'health', 'notifications'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    return () => {
      if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    }
  }, [])

  const handleTabChange = (tabId) => {
    if (tabId === activeTab && !isTabLoading) return
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
    setIsTabLoading(true)
    if (tabTimerRef.current) clearTimeout(tabTimerRef.current)
    tabTimerRef.current = setTimeout(() => {
      setIsTabLoading(false)
    }, 500)
  }

  // Profile Form state
  const [displayName, setDisplayName] = useState(user?.fullName || '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState(null)

  // Avatar Modal States
  const [avatarSuccess, setAvatarSuccess] = useState(null)
  const [avatarError, setAvatarError] = useState(null)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const userPhoto = user?.photoUrl || user?.avatarUrl

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
      setTimeout(() => setProfileSuccess(false), 3500)
    },
    onError: (err) => {
      setProfileError(err.message || 'Failed to update administrator preferences.')
      setProfileSuccess(false)
    },
  })

  const handleSaveProfile = (e) => {
    e.preventDefault()
    setProfileError(null)

    // 1. Update Display Name locally (persists instantly to header and profile)
    if (displayName.trim()) {
      updateDisplayName(displayName.trim())
    }

    // 2. Validate and update Phone and Language to backend
    const trimmedPhone = phone.trim()
    const payload = { preferredLanguage }
    if (trimmedPhone) {
      if (!/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
        setProfileError('Please enter a valid phone number in E.164 format (e.g. +8801712345678).')
        return
      }
      payload.phone = trimmedPhone
    } else if (user?.phone) {
      payload.phone = ''
    }

    updateProfile.mutate(payload)
  }

  const handleAvatarUpload = (e) => {
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
          setAvatarSuccess('Administrator profile photo updated successfully!')
          setAvatarModalOpen(false)
          setTimeout(() => setAvatarSuccess(null), 3500)
        } catch {
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

  const handleSelectPreset = (url) => {
    updateAvatar(url)
    setAvatarSuccess('Official Municipal Seal insignia selected!')
    setAvatarModalOpen(false)
    setTimeout(() => setAvatarSuccess(null), 3500)
  }

  const handleRemoveAvatar = () => {
    updateAvatar('')
    setAvatarSuccess('Profile photo reset to default initials.')
    setAvatarModalOpen(false)
    setTimeout(() => setAvatarSuccess(null), 3500)
  }

  // System Health query
  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: () => api('/health'),
    staleTime: 60_000,
  })

  // Reference Data: Clustering rules query
  const clusteringQuery = useQuery({
    queryKey: ['clustering-rules'],
    queryFn: () => api('/clustering-rules?limit=100'),
    staleTime: 60_000,
  })

  // Reference Data: Severity keywords query
  const severityQuery = useQuery({
    queryKey: ['severity-keywords'],
    queryFn: () => api('/severity-keywords?limit=100'),
    staleTime: 60_000,
  })

  // Reference data tabs: 'categories' | 'keywords' | 'clustering'
  const [refTab, setRefTab] = useState('categories')

  // Categories mutations & form
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [catForm, setCatForm] = useState({ key: '', labelEn: '', labelBn: '' })
  const [catError, setCatError] = useState(null)

  const toggleCategory = useMutation({
    mutationFn: ({ key, active }) =>
      api(`/categories/${key}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })

  const createCategory = useMutation({
    mutationFn: (body) => api('/categories', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setAddCatOpen(false)
      setCatForm({ key: '', labelEn: '', labelBn: '' })
      setCatError(null)
    },
    onError: (err) => setCatError(err.message),
  })

  // Severity Keywords mutations & form
  const [addKeywordOpen, setAddKeywordOpen] = useState(false)
  const [keywordForm, setKeywordForm] = useState({
    term: '',
    severity: 'medium',
    language: 'en',
    category: '',
  })
  const [keywordError, setKeywordError] = useState(null)

  const createKeyword = useMutation({
    mutationFn: (body) => api('/severity-keywords', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['severity-keywords'] })
      setAddKeywordOpen(false)
      setKeywordForm({ term: '', severity: 'medium', language: 'en', category: '' })
      setKeywordError(null)
    },
    onError: (err) => setKeywordError(err.message),
  })

  const deleteKeyword = useMutation({
    mutationFn: (id) => api(`/severity-keywords/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['severity-keywords'] }),
  })

  // Clustering Rules mutations & form
  const [editRule, setEditRule] = useState(null)
  const [ruleForm, setRuleForm] = useState({ radiusM: 50, timeWindowHours: 24 })
  const [ruleError, setRuleError] = useState(null)

  const [addRuleOpen, setAddRuleOpen] = useState(false)
  const [newRuleForm, setNewRuleForm] = useState({ category: '', radiusM: 50, timeWindowHours: 24 })
  const [newRuleError, setNewRuleError] = useState(null)

  const createRule = useMutation({
    mutationFn: (body) => api('/clustering-rules', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clustering-rules'] })
      setAddRuleOpen(false)
      setNewRuleForm({ category: '', radiusM: 50, timeWindowHours: 24 })
      setNewRuleError(null)
    },
    onError: (err) => setNewRuleError(err.message),
  })

  const updateRule = useMutation({
    mutationFn: ({ id, ...body }) =>
      api(`/clustering-rules/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clustering-rules'] })
      setEditRule(null)
      setRuleError(null)
    },
    onError: (err) => setRuleError(err.message),
  })

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

  const rawKeywords = severityQuery.data?.data ?? severityQuery.data
  const keywords = Array.isArray(rawKeywords) ? rawKeywords : []

  const rawRules = clusteringQuery.data?.data ?? clusteringQuery.data
  const clusteringRules = Array.isArray(rawRules) ? rawRules : []

  // Filters for severity keywords
  const [kwSearch, setKwSearch] = useState('')
  const [kwSeverityFilter, setKwSeverityFilter] = useState('all')
  const [kwLangFilter, setKwLangFilter] = useState('all')

  // Filter for clustering rules
  const [ruleSearch, setRuleSearch] = useState('')

  const filteredKeywords = keywords.filter((kw) => {
    if (kwSeverityFilter !== 'all' && kw.severity !== kwSeverityFilter) return false
    if (kwLangFilter !== 'all' && kw.language !== kwLangFilter) return false
    if (kwSearch.trim()) {
      const q = kwSearch.toLowerCase()
      const matchesTerm = kw.term?.toLowerCase().includes(q)
      const matchesCat = kw.category?.toLowerCase().includes(q)
      if (!matchesTerm && !matchesCat) return false
    }
    return true
  })

  const filteredRules = clusteringRules.filter((r) => {
    if (ruleSearch.trim()) {
      return r.category?.toLowerCase().includes(ruleSearch.toLowerCase())
    }
    return true
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 1. HEADER */}
      <PageHeader
        title="Admin Profile &amp; Settings"
        subtitle="Manage administrator identity, credentials, reference taxonomies, and platform health."
      />

      {/* SUCCESS / ERROR TOASTS */}
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

      {/* 2. EXECUTIVE HERO PROFILE CARD */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-panel shadow-sm">
        {/* Banner with Municipal Watermark Outline */}
        <div className="relative h-36 sm:h-44 md:h-48 bg-gradient-to-r from-[#002d25] via-[#005043] to-[#087f6e] p-5 sm:p-6 overflow-hidden flex flex-col justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-15" />

          {/* Decorative Seal Silhouette */}
          <div className="pointer-events-none absolute -right-6 -bottom-10 opacity-10 text-white">
            <svg width="220" height="220" viewBox="0 0 128 128" fill="currentColor">
              <path d="M64 12 L108 28 L108 72 C108 98 64 116 64 116 C64 116 20 98 20 72 L20 28 Z" />
            </svg>
          </div>

          {/* Top Bar inside Banner */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-black/25 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-white/90 border border-white/15 shadow-xs">
              <Building className="h-3 w-3 text-emerald-300" />
              <span className="tracking-wide">Central Administration Command</span>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-black/35 backdrop-blur-md px-3.5 py-1 text-[11px] font-semibold text-white/90 border border-white/20 shadow-xs">
              <span className={`h-2 w-2 rounded-full ${user?.status === 'suspended' ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`} />
              <span>{user?.status === 'suspended' ? 'Account Suspended' : 'Active Duty'}</span>
            </div>
          </div>
        </div>

        {/* Profile Details Bar */}
        <div className="relative px-6 pb-6 pt-0 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
            {/* Avatar & Personnel Identifiers */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-5 text-center md:text-left">
              {/* Circular Avatar Container with Photo Edit Trigger */}
              <div className="-mt-14 sm:-mt-18 relative shrink-0 flex flex-col items-center self-center md:self-start">
                <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full border-4 border-surface-panel bg-surface-sunken shadow-xl ring-2 ring-black/5">
                  <div
                    onClick={() => setAvatarModalOpen(true)}
                    className="group relative h-full w-full rounded-full overflow-hidden flex items-center justify-center cursor-pointer"
                    title="Click to update profile photo"
                  >
                    {userPhoto ? (
                      <img
                        src={userPhoto}
                        alt={user?.fullName || 'System Administrator'}
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

                    {/* Circular Hover Overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-2xs">
                      <Camera className="h-6 w-6" />
                      <span className="text-[10px] font-bold mt-1 tracking-wide">Change</span>
                    </div>
                  </div>

                  {/* Badge button at bottom-right of avatar */}
                  <button
                    type="button"
                    onClick={() => setAvatarModalOpen(true)}
                    className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#005a4c] text-white shadow-md border-2 border-surface-panel hover:bg-[#00483c] hover:scale-105 transition active:scale-95 cursor-pointer z-10"
                    title="Change photo"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                {/* Dynamic account status placed under profile picture */}
                <span className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  user?.status === 'suspended'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${user?.status === 'suspended' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  {user?.status === 'suspended' ? 'Suspended' : 'Active Account'}
                </span>
              </div>

              {/* Title & Metadata */}
              <div className="min-w-0 pt-3 sm:pt-4 text-center md:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-ink tracking-tight">
                    {user?.fullName || 'System Administrator'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#005a4c]/20 bg-[#005a4c]/10 px-3 py-1 text-xs font-bold text-[#005a4c]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>System Administrator</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    <Shield className="h-3 w-3" />
                    <span>Unrestricted Scope</span>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1.5 text-xs text-ink-muted">
                  <span className="font-mono text-ink-muted">{user?.email}</span>
                  <span>•</span>
                  <span className="font-medium text-ink">Central Administration &amp; Governance</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#005a4c] bg-[#005a4c]/5 px-2 py-0.5 rounded-md">
                    <MapPin className="h-3 w-3" />
                    <span>National Jurisdiction (All Cities)</span>
                  </span>
                </div>

                <p className="mt-1 text-[11px] font-medium text-ink-faint">
                  Master Administrative Access • Full Authority Provisioning, Taxonomy &amp; Audit Oversight
                </p>
              </div>
            </div>
          </div>

          {/* Quick Platform Highlights Bar */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3.5 border-t border-line/80 pt-5 text-xs">
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <FolderTree className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Categories</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">
                {(categories ?? []).filter((c) => c.active).length} Active Taxonomies
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <Tag className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Severity Keywords</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">
                {(keywords ?? []).filter((k) => k.active).length} Active Keywords
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <Activity className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Health Status</span>
              </div>
              <p className="mt-1 font-bold text-sm text-status-resolved truncate flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-status-resolved animate-pulse" />
                Operational (All Services)
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-sunken/70 p-3 hover:bg-surface-sunken transition">
              <div className="flex items-center gap-2 text-ink-faint">
                <ShieldCheck className="h-3.5 w-3.5 text-[#005a4c]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Security State</span>
              </div>
              <p className="mt-1 font-bold text-sm text-ink truncate">2FA Enabled &amp; Monitored</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SETTINGS & PROFILE TAB SELECTOR */}
      <div className="flex border-b border-line overflow-x-auto text-xs font-semibold gap-1 bg-surface-panel p-1 rounded-xl border border-line shadow-xs">
        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#005a4c] text-white shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
          }`}
        >
          <User className="h-4 w-4" />
          <span>Profile &amp; Credentials</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('reference')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'reference'
              ? 'bg-[#005a4c] text-white shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          <span>Reference Data &amp; Taxonomies</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'bg-[#005a4c] text-white shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Security &amp; 2FA</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('health')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'health'
              ? 'bg-[#005a4c] text-white shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
          }`}
        >
          <Server className="h-4 w-4" />
          <span>Infrastructure &amp; Health</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-[#005a4c] text-white shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
        </button>
      </div>

      {/* 4. TAB CONTENT PANELS */}
      {isTabLoading ? (
        <TabLoadingSkeleton title={TAB_LABELS[activeTab] || 'Section'} />
      ) : (
        <>
          {/* TAB 1: PROFILE & CREDENTIALS */}
          {activeTab === 'profile' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" aria-hidden="true" />
                  Personal Information &amp; Contact Preferences
                </span>
              }
            />
            <CardBody className="space-y-5">
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="admin-name" className="block text-xs font-semibold text-ink">
                      Full Display Name
                    </label>
                    <Input
                      id="admin-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Chief Executive Administrator"
                      className="mt-1.5"
                      required
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Displayed on governance dashboards, authority audits, and system streams.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="admin-email" className="block text-xs font-semibold text-ink">
                      Admin Email Address
                    </label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={user?.email ?? ''}
                      readOnly
                      disabled
                      className="mt-1.5 cursor-not-allowed bg-surface-sunken font-mono text-ink-muted"
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Primary administrative identity. Fixed for security audit integrity.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="admin-phone" className="block text-xs font-semibold text-ink">
                      Emergency Phone Number
                    </label>
                    <Input
                      id="admin-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+8801700000000"
                      className="mt-1.5 font-mono"
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      E.164 format with country code (+880 for Bangladesh). Used for high-priority outage alerts.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="admin-lang" className="block text-xs font-semibold text-ink">
                      Preferred Interface Language
                    </label>
                    <Select
                      id="admin-lang"
                      className="mt-1.5 w-full"
                      value={preferredLanguage}
                      onChange={(e) => setPreferredLanguage(e.target.value)}
                      options={[
                        { value: 'en', label: 'English (Default)' },
                        { value: 'bn', label: 'বাংলা (Bengali)' },
                      ]}
                    />
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Select your preferred dashboard language for menus and audit logs.
                    </p>
                  </div>
                </div>

                {profileError && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={updateProfile.isPending}>
                      {updateProfile.isPending ? <Spinner size="sm" /> : 'Save Profile Changes'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setAvatarModalOpen(true)}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Change Avatar
                    </Button>
                  </div>

                  {profileSuccess && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-status-resolved animate-fade-in">
                      <CheckCircle2 className="h-4 w-4" /> Profile updated successfully!
                    </span>
                  )}
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: REFERENCE DATA & TAXONOMIES */}
      {activeTab === 'reference' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader
              title={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                    Municipal Reference Taxonomies
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    healthQuery.isError ? 'bg-status-critical-soft text-status-critical' : 'bg-status-resolved-soft text-status-resolved'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${healthQuery.isError ? 'bg-status-critical' : 'bg-status-resolved'}`} />
                    {healthQuery.isError ? 'System Degraded' : 'Active & Synced'}
                  </span>
                </div>
              }
            />
            <CardBody className="space-y-6">
              {/* Reference Sub-Tabs */}
              <div className="flex border-b border-line gap-2">
                <button
                  type="button"
                  onClick={() => setRefTab('categories')}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    refTab === 'categories'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                  Taxonomy Categories ({categories?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRefTab('keywords')}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    refTab === 'keywords'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  Severity Keywords ({keywords?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRefTab('clustering')}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    refTab === 'clustering'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" />
                  Clustering Rules ({clusteringRules?.length ?? 0})
                </button>
              </div>

              {/* TAB: Categories */}
              {refTab === 'categories' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">
                      Municipal issue classifications. Deactivating a category hides it from citizen submission forms.
                    </p>
                    <Button size="sm" onClick={() => setAddCatOpen(true)} className="flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Category
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-panel border border-line">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-surface-sunken text-ink-muted">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Key / Slug</th>
                          <th className="px-4 py-2.5 font-semibold">English Label</th>
                          <th className="px-4 py-2.5 font-semibold">Bengali Label</th>
                          <th className="px-4 py-2.5 font-semibold">Status</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {(categories ?? []).map((cat) => (
                          <tr key={cat.key} className="hover:bg-surface-sunken/40">
                            <td className="px-4 py-2.5 font-mono text-ink font-medium">{cat.key}</td>
                            <td className="px-4 py-2.5 text-ink">{cat.label?.en ?? cat.key}</td>
                            <td className="px-4 py-2.5 text-ink">{cat.label?.bn ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  cat.active
                                    ? 'bg-status-resolved-soft text-status-resolved'
                                    : 'bg-surface-sunken text-ink-muted'
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${cat.active ? 'bg-status-resolved' : 'bg-ink-muted'}`} />
                                {cat.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={toggleCategory.isPending}
                                onClick={() => toggleCategory.mutate({ key: cat.key, active: !cat.active })}
                                className="text-xs"
                              >
                                <Power className={`h-3 w-3 mr-1 ${cat.active ? 'text-status-critical' : 'text-status-resolved'}`} />
                                {cat.active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: Keywords */}
              {refTab === 'keywords' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-48">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                        <Input
                          placeholder="Filter keywords..."
                          value={kwSearch}
                          onChange={(e) => setKwSearch(e.target.value)}
                          className="pl-8 text-xs py-1"
                        />
                      </div>
                      <Select
                        value={kwSeverityFilter}
                        onChange={(e) => setKwSeverityFilter(e.target.value)}
                        className="text-xs py-1"
                        options={[
                          { value: 'all', label: 'All Severities' },
                          { value: 'critical', label: 'Critical' },
                          { value: 'high', label: 'High' },
                          { value: 'medium', label: 'Medium' },
                          { value: 'low', label: 'Low' },
                        ]}
                      />
                      <Select
                        value={kwLangFilter}
                        onChange={(e) => setKwLangFilter(e.target.value)}
                        className="text-xs py-1"
                        options={[
                          { value: 'all', label: 'All Languages' },
                          { value: 'en', label: 'English' },
                          { value: 'bn', label: 'Bengali' },
                        ]}
                      />
                    </div>
                    <Button size="sm" onClick={() => setAddKeywordOpen(true)} className="flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Keyword
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-panel border border-line max-h-96">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 border-b border-line bg-surface-sunken text-ink-muted">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Term / Keyword</th>
                          <th className="px-4 py-2.5 font-semibold">Assigned Severity</th>
                          <th className="px-4 py-2.5 font-semibold">Language</th>
                          <th className="px-4 py-2.5 font-semibold">Category Scope</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredKeywords.map((kw) => (
                          <tr key={kw.id} className="hover:bg-surface-sunken/40">
                            <td className="px-4 py-2 text-ink font-semibold">{kw.term}</td>
                            <td className="px-4 py-2">
                              <StatusBadge
                                tone={
                                  kw.severity === 'critical'
                                    ? 'critical'
                                    : kw.severity === 'high'
                                      ? 'high'
                                      : kw.severity === 'medium'
                                        ? 'medium'
                                        : 'low'
                                }
                              >
                                {kw.severity}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-2 uppercase font-mono text-[11px] text-ink-muted">{kw.language}</td>
                            <td className="px-4 py-2 text-ink-muted">{kw.category || 'Global (All)'}</td>
                            <td className="px-4 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deleteKeyword.isPending}
                                onClick={() => deleteKeyword.mutate(kw.id)}
                                className="text-xs text-status-critical hover:bg-status-critical-soft"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: Clustering */}
              {refTab === 'clustering' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">
                      Spatial &amp; temporal parameters used by PostGIS ST_DWithin to group nearby citizen reports into unified issues.
                    </p>
                    <Button size="sm" onClick={() => setAddRuleOpen(true)} className="flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Rule
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-panel border border-line">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-surface-sunken text-ink-muted">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Category</th>
                          <th className="px-4 py-2.5 font-semibold">Spatial Radius</th>
                          <th className="px-4 py-2.5 font-semibold">Time Window</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredRules.map((rule) => (
                          <tr key={rule.id} className="hover:bg-surface-sunken/40">
                            <td className="px-4 py-2.5 font-semibold text-ink">
                              {rule.category ? (categories?.find((c) => c.key === rule.category)?.label?.en ?? rule.category) : 'Default (Fallback)'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-ink">{rule.radiusM} meters</td>
                            <td className="px-4 py-2.5 font-mono text-ink">{rule.timeWindowHours} hours</td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditRule(rule)
                                  setRuleForm({ radiusM: rule.radiusM, timeWindowHours: rule.timeWindowHours })
                                }}
                                className="text-xs"
                              >
                                <Edit2 className="h-3 w-3 mr-1" /> Edit
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 3: SECURITY & 2FA */}
      {activeTab === 'security' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  Two-Factor Authentication (2FA Enforcement)
                </span>
              }
            />
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3 rounded-panel border border-emerald-200 bg-emerald-50/70 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold text-sm text-emerald-950">2FA Active on Administrator Credentials</p>
                  <p className="mt-1 leading-relaxed">
                    All administrative actions (authority provisioning, scope updates, and governance moderation) are bound to two-factor verification.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink">TOTP Authenticator Device</p>
                  <p className="text-[11px] text-ink-muted">Google Authenticator, Microsoft Authenticator, or Bitwarden</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => enroll2FA.mutate()}
                  disabled={enroll2FA.isPending}
                  className="flex items-center gap-1.5"
                >
                  {enroll2FA.isPending ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Enroll / Re-key 2FA Device
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
                  Security Governance &amp; Session Management
                </span>
              }
            />
            <CardBody className="space-y-3 text-xs text-ink-muted">
              <p className="leading-relaxed">
                System administrative sessions are strictly time-bound. Passwords must adhere to standard resilience guidelines (minimum 12 characters, non-dictionary credentials).
              </p>
              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <div className="rounded-panel border border-line bg-surface-sunken p-3">
                  <p className="font-semibold text-ink">Session Lifetime</p>
                  <p className="mt-1 text-[11px] text-ink-muted">Standard 8 hours active token duration with sliding renewal.</p>
                </div>
                <div className="rounded-panel border border-line bg-surface-sunken p-3">
                  <p className="font-semibold text-ink">Audit Trail Logging</p>
                  <p className="mt-1 text-[11px] text-ink-muted">Every configuration mutation is persisted into the immutable audit log stream.</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 4: SYSTEM TELEMETRY & HEALTH */}
      {activeTab === 'health' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader
              title={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" aria-hidden="true" />
                    Infrastructure &amp; Service Health Telemetry
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => healthQuery.refetch()}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </Button>
                </div>
              }
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-panel border border-line bg-surface-sunken p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">API Gateway</span>
                    <span className="h-2 w-2 rounded-full bg-status-resolved" />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-muted">/api/v1 (FastAPI/Uvicorn)</p>
                  <p className="mt-2 text-[11px] font-medium text-status-resolved">Operational</p>
                </div>

                <div className="rounded-panel border border-line bg-surface-sunken p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Spatial Database</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        healthQuery.data?.dependencies?.database?.status === 'ok'
                          ? 'bg-status-resolved'
                          : 'bg-status-critical'
                      }`}
                    />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-muted">PostgreSQL 17 + PostGIS</p>
                  <p className="mt-2 text-[11px] font-medium text-status-resolved">
                    {healthQuery.data?.dependencies?.database?.status === 'ok'
                      ? 'Connected & Healthy'
                      : 'Degraded'}
                  </p>
                </div>

                <div className="rounded-panel border border-line bg-surface-sunken p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Cache &amp; Broker</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        healthQuery.data?.dependencies?.cache?.status === 'ok'
                          ? 'bg-status-resolved'
                          : 'bg-status-critical'
                      }`}
                    />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-muted">Redis 8-alpine</p>
                  <p className="mt-2 text-[11px] font-medium text-status-resolved">
                    {healthQuery.data?.dependencies?.cache?.status === 'ok'
                      ? 'Connected & Healthy'
                      : 'Degraded'}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 5: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="space-y-6 animate-fade-in">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                  Administrator Notification Channels
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
                  <label className="flex items-start gap-3 rounded-panel border border-line bg-surface-sunken p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inApp}
                      onChange={(e) => setInApp(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">In-App Alerts &amp; Banner Notifications</p>
                      <p className="text-xs text-ink-muted">
                        Receive instant notifications for critical escalations and high-severity safety incidents.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-panel border border-line bg-surface-sunken p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailNotif}
                      onChange={(e) => setEmailNotif(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">Email Alerts &amp; Daily Digests</p>
                      <p className="text-xs text-ink-muted">
                        Receive daily moderation summaries and system error reports directly to your admin inbox.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" disabled={updateNotif.isPending}>
                    {updateNotif.isPending ? <Spinner size="sm" /> : 'Save Notification Preferences'}
                  </Button>
                  {notifSaved && (
                    <span className="flex items-center gap-1 text-xs font-medium text-status-resolved animate-fade-in">
                      <Check className="h-4 w-4" /> Preferences saved!
                    </span>
                  )}
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}
        </>
      )}

      {/* 5. AVATAR UPLOAD & SELECTION MODAL */}
      <Dialog
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Update Administrator Photo"
      >
        <div className="space-y-4 py-2 text-xs">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarUpload}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
          />

          {/* Option 1: Upload from Computer */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-ink">Upload Custom Image</h4>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs bg-[#005a4c] hover:bg-[#00483c] text-white"
              >
                <Upload className="h-4 w-4" />
                Choose Image File
              </Button>
              {userPhoto && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRemoveAvatar}
                  className="flex items-center gap-1.5 text-xs text-status-critical hover:bg-status-critical-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Custom Avatar
                </Button>
              )}
            </div>
            <p className="text-[11px] text-ink-muted">
              Auto-resized and optimized directly in your browser (JPG, PNG, WebP up to 8MB).
            </p>
          </div>

          {/* Option 2: Choose Official Presets */}
          <div className="space-y-2 pt-3 border-t border-line">
            <h4 className="text-xs font-bold text-ink">Official Administrative Insignias</h4>
            <p className="text-[11px] text-ink-muted">
              Select one of the official administrative seals for your municipal profile:
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {ADMIN_PRESET_AVATARS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.url)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition cursor-pointer hover:border-[#005a4c] hover:bg-[#005a4c]/5 ${
                    userPhoto === preset.url
                      ? 'border-[#005a4c] bg-[#005a4c]/10 ring-2 ring-[#005a4c]'
                      : 'border-line bg-surface-panel'
                  }`}
                >
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="h-10 w-10 rounded-full object-cover shadow-2xs shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink truncate">{preset.name}</p>
                    <p className="text-[10px] text-ink-muted truncate">{preset.role}</p>
                  </div>
                  {userPhoto === preset.url && (
                    <Check className="h-4 w-4 text-[#005a4c] shrink-0" />
                  )}
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

        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="secondary" onClick={() => setAvatarModalOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* 6. 2FA ENROLLMENT MODAL */}
      <Dialog
        open={twoFactorOpen}
        onClose={() => setTwoFactorOpen(false)}
        title="Admin 2FA Device Setup"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p>
            Scan or copy this key into your authenticator app (Google Authenticator, Microsoft Authenticator, or Bitwarden):
          </p>

          <div className="rounded-panel border border-line bg-surface-sunken p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Base32 Secret Key
            </p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="font-mono text-base font-bold tracking-wider text-primary select-all">
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
            <label htmlFor="admin-totp-input" className="block font-medium text-ink">
              Enter the 6-digit code from your app:
            </label>
            <Input
              id="admin-totp-input"
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

        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="secondary" onClick={() => setTwoFactorOpen(false)}>
            Close
          </Button>
          <Button
            disabled={totpCode.length !== 6 || verify2FA.isPending || totpSuccess}
            onClick={() => verify2FA.mutate(totpCode)}
          >
            {verify2FA.isPending ? <Spinner size="sm" /> : 'Confirm & Activate 2FA'}
          </Button>
        </div>
      </Dialog>

      {/* Add Category Modal */}
      <Dialog
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        title="Add Issue Category"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!catForm.key.trim() || !catForm.labelEn.trim() || !catForm.labelBn.trim()) {
              setCatError('All fields (Key, English, Bengali) are required.')
              return
            }
            createCategory.mutate({
              key: catForm.key.trim().toLowerCase().replace(/\s+/g, '-'),
              label: { en: catForm.labelEn.trim(), bn: catForm.labelBn.trim() },
            })
          }}
          className="space-y-3 py-2 text-xs"
        >
          <div>
            <label className="block font-medium text-ink">Category Key / Slug</label>
            <Input
              value={catForm.key}
              onChange={(e) => setCatForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="e.g. water-leakage"
              className="mt-1 font-mono"
              required
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">Lowercase alphanumeric with hyphens.</p>
          </div>

          <div>
            <label className="block font-medium text-ink">English Label</label>
            <Input
              value={catForm.labelEn}
              onChange={(e) => setCatForm((f) => ({ ...f, labelEn: e.target.value }))}
              placeholder="e.g. Water Leakage"
              className="mt-1"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Bengali Label</label>
            <Input
              value={catForm.labelBn}
              onChange={(e) => setCatForm((f) => ({ ...f, labelBn: e.target.value }))}
              placeholder="e.g. পানির পাইপ লিকেজ"
              className="mt-1"
              required
            />
          </div>

          {catError && (
            <p className="text-xs text-status-critical" role="alert">
              {catError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" type="button" onClick={() => setAddCatOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? <Spinner size="sm" /> : 'Create Category'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Keyword Modal */}
      <Dialog
        open={addKeywordOpen}
        onClose={() => setAddKeywordOpen(false)}
        title="Add Severity Keyword"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!keywordForm.term.trim()) {
              setKeywordError('Keyword term is required.')
              return
            }
            createKeyword.mutate({
              term: keywordForm.term.trim(),
              severity: keywordForm.severity,
              language: keywordForm.language,
              category: keywordForm.category || null,
            })
          }}
          className="space-y-3 py-2 text-xs"
        >
          <div>
            <label className="block font-medium text-ink">Keyword / Term</label>
            <Input
              value={keywordForm.term}
              onChange={(e) => setKeywordForm((f) => ({ ...f, term: e.target.value }))}
              placeholder="e.g. fire, explosion, ধস"
              className="mt-1"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Severity</label>
            <Select
              value={keywordForm.severity}
              onChange={(e) => setKeywordForm((f) => ({ ...f, severity: e.target.value }))}
              className="mt-1 w-full"
              options={[
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Language</label>
            <Select
              value={keywordForm.language}
              onChange={(e) => setKeywordForm((f) => ({ ...f, language: e.target.value }))}
              className="mt-1 w-full"
              options={[
                { value: 'en', label: 'English' },
                { value: 'bn', label: 'Bengali' },
              ]}
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Category (Optional)</label>
            <Select
              value={keywordForm.category}
              onChange={(e) => setKeywordForm((f) => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full"
              options={[
                { value: '', label: 'Global (All Categories)' },
                ...(categories ?? []).map((c) => ({
                  value: c.key,
                  label: `${c.label?.en ?? c.key} (${c.key})`,
                })),
              ]}
            />
          </div>

          {keywordError && (
            <p className="text-xs text-status-critical" role="alert">
              {keywordError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" type="button" onClick={() => setAddKeywordOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createKeyword.isPending}>
              {createKeyword.isPending ? <Spinner size="sm" /> : 'Add Keyword'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Rule Modal */}
      <Dialog
        open={Boolean(editRule)}
        onClose={() => setEditRule(null)}
        title={`Edit Rule: ${editRule?.category ?? 'Default'}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const radius = Number(ruleForm.radiusM)
            const hours = Number(ruleForm.timeWindowHours)
            if (radius <= 0 || hours <= 0) {
              setRuleError('Radius and time window must be positive numbers.')
              return
            }
            updateRule.mutate({
              id: editRule.id,
              radiusM: radius,
              timeWindowHours: hours,
            })
          }}
          className="space-y-3 py-2 text-xs"
        >
          <div>
            <label className="block font-medium text-ink">Spatial Radius (meters)</label>
            <Input
              type="number"
              min={1}
              value={ruleForm.radiusM}
              onChange={(e) => setRuleForm((f) => ({ ...f, radiusM: e.target.value }))}
              className="mt-1"
              required
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">Reports within this distance are considered proximate.</p>
          </div>

          <div>
            <label className="block font-medium text-ink">Time Window (hours)</label>
            <Input
              type="number"
              min={1}
              value={ruleForm.timeWindowHours}
              onChange={(e) => setRuleForm((f) => ({ ...f, timeWindowHours: e.target.value }))}
              className="mt-1"
              required
            />
            <p className="mt-0.5 text-[11px] text-ink-muted">Maximum hours apart for reports to merge into one issue.</p>
          </div>

          {ruleError && (
            <p className="text-xs text-status-critical" role="alert">
              {ruleError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" type="button" onClick={() => setEditRule(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateRule.isPending}>
              {updateRule.isPending ? <Spinner size="sm" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Clustering Rule Modal */}
      <Dialog
        open={addRuleOpen}
        onClose={() => setAddRuleOpen(false)}
        title="Add Clustering Rule"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newRuleForm.category) {
              setNewRuleError('Please select a category.')
              return
            }
            const radius = Number(newRuleForm.radiusM)
            const hours = Number(newRuleForm.timeWindowHours)
            if (radius <= 0 || hours <= 0) {
              setNewRuleError('Radius and time window must be positive numbers.')
              return
            }
            createRule.mutate({
              category: newRuleForm.category,
              radiusM: radius,
              timeWindowHours: hours,
            })
          }}
          className="space-y-3 py-2 text-xs"
        >
          <div>
            <label className="block font-medium text-ink">Category</label>
            <Select
              value={newRuleForm.category}
              onChange={(e) => setNewRuleForm((f) => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full"
              options={[
                { value: '', label: 'Select Category...' },
                ...(categories ?? []).map((c) => ({
                  value: c.key,
                  label: `${c.label?.en ?? c.key} (${c.key})`,
                })),
              ]}
              required
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Spatial Radius (meters)</label>
            <Input
              type="number"
              min={1}
              value={newRuleForm.radiusM}
              onChange={(e) => setNewRuleForm((f) => ({ ...f, radiusM: e.target.value }))}
              className="mt-1"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-ink">Time Window (hours)</label>
            <Input
              type="number"
              min={1}
              value={newRuleForm.timeWindowHours}
              onChange={(e) => setNewRuleForm((f) => ({ ...f, timeWindowHours: e.target.value }))}
              className="mt-1"
              required
            />
          </div>

          {newRuleError && (
            <p className="text-xs text-status-critical" role="alert">
              {newRuleError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" type="button" onClick={() => setAddRuleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRule.isPending}>
              {createRule.isPending ? <Spinner size="sm" /> : 'Create Rule'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
