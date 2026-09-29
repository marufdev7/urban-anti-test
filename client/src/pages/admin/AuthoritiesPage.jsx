import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useAuthorities, useAdminUpdateUser } from '../../hooks/admin'
import { categoryLabel, useCategories } from '../../hooks/data'
import { exportAuthoritiesPdf } from '../../lib/pdfExport'
import { JURISDICTION_AREAS, getJurisdictionLabel } from '../../lib/zones'
import { shortId } from '../../lib/format'
import { getAuthorityRestriction, reactivateAuthorityAccount } from '../../lib/unnaturalActivity'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import Input from '../../components/ui/Input'
import RestrictionBadge from '../../components/ui/RestrictionBadge'
import Select from '../../components/ui/Select'
import Skeleton from '../../components/ui/Skeleton'

function formatAuthority(user, categories) {
  const email = user.email || ''
  const emailPrefix = email.split('@')[0] || 'authority'

  let name = ''
  let role = 'Authority Officer'

  if (email === 'authority@urbanmend.test') {
    name = 'Central Operations Command'
    role = 'Operations Lead'
  } else if (emailPrefix.includes('roads')) {
    name = 'Roads & Transit Officer'
    role = 'Field Supervisor'
  } else if (emailPrefix.includes('water')) {
    name = 'Water & Sanitation Specialist'
    role = 'Field Supervisor'
  } else if (emailPrefix.includes('grid')) {
    name = 'Electrical Grid Inspector'
    role = 'Review Specialist'
  } else if (emailPrefix.includes('field')) {
    name = 'Field Liaison Officer'
    role = 'DPW Liaison'
  } else if (emailPrefix.includes('drainage')) {
    name = 'Drainage & Flood Officer'
    role = 'Field Supervisor'
  } else if (emailPrefix.includes('traffic')) {
    name = 'Traffic Systems Specialist'
    role = 'Review Specialist'
  } else if (emailPrefix.includes('health')) {
    name = 'Public Health & Waste Inspector'
    role = 'Field Supervisor'
  } else {
    name = emailPrefix
      .replace(/^authority[._-]/i, '')
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
    if (user.role === 'admin') role = 'Administrator'
    else if (user.categoryScope?.length === 7) role = 'Review Specialist'
    else role = 'Field Supervisor'
  }

  const initials =
    name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'AU'

  const allCategoryCount = (categories ?? []).length || 7
  let scope = []
  if (user.categoryScope?.length >= allCategoryCount) {
    scope = ['All Categories']
  } else if (user.categoryScope?.length) {
    scope = user.categoryScope.map((s) => categoryLabel(categories, s))
  } else {
    scope = ['Unrestricted']
  }

  const isRevoked =
    user.status === 'suspended' ||
    user.status === 'deprovisioned' ||
    user.status === 'revoked'
  const status = isRevoked ? 'revoked' : user.status || 'active'

  return {
    id: shortId(user.id),
    fullId: user.id,
    email: user.email,
    name,
    role,
    scope,
    status,
    avatar: initials,
    assignedArea: user.assignedArea || '',
    areaLabel: getJurisdictionLabel(user.assignedArea),
    rawUser: user,
  }
}

const ROLE_COLORS = [
  'bg-[#0e7490]',
  'bg-[#14b8a6]',
  'bg-[#5eead4]',
  'bg-[#0d9488]',
  'bg-[#38bdf8]',
]

function EditAuthorityModal({ authority, onClose, categories }) {
  const adminUpdate = useAdminUpdateUser()
  const [activeTab, setActiveTab] = useState('general')
  const [email, setEmail] = useState(authority?.email || '')
  const [phone, setPhone] = useState(authority?.phone || '')
  const [assignedArea, setAssignedArea] = useState(authority?.assignedArea || '')
  const [status, setStatus] = useState(authority?.status || 'active')
  const [categoryScope, setCategoryScope] = useState(authority?.categoryScope || [])
  const [requireTwoFactor, setRequireTwoFactor] = useState(
    Boolean(authority?.requireTwoFactor ?? authority?.require_two_factor),
  )
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const activeCategories = useMemo(() => (categories ?? []).filter((c) => c.active), [categories])

  const toggleCategory = (slug) => {
    setCategoryScope((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  const selectAllCategories = () => {
    if (categoryScope.length === activeCategories.length) {
      setCategoryScope([])
    } else {
      setCategoryScope(activeCategories.map((c) => c.key))
    }
  }

  const applyPreset = (presetType) => {
    const allKeys = activeCategories.map((c) => c.key)
    switch (presetType) {
      case 'all':
        setCategoryScope(allKeys)
        break
      case 'infrastructure':
        setCategoryScope(
          allKeys.filter((k) =>
            ['roads_transport', 'street_lighting', 'public_structures'].includes(k),
          ),
        )
        break
      case 'sanitation_water':
        setCategoryScope(
          allKeys.filter((k) =>
            ['water_drainage', 'sanitation_waste'].includes(k),
          ),
        )
        break
      default:
        break
    }
  }

  const handleCopyId = () => {
    if (authority?.id) {
      navigator.clipboard?.writeText(authority.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (password) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.')
        setActiveTab('security')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        setActiveTab('security')
        return
      }
    }

    if (phone.trim() && !/^\+?[0-9]{7,15}$/.test(phone.trim())) {
      setError('Please enter a valid phone number in international format (e.g. +8801700000000).')
      setActiveTab('general')
      return
    }

    try {
      const payload = {
        userId: authority.id,
        assignedArea,
        status,
        categoryScope,
        requireTwoFactor,
      }
      if (email && email !== authority.email) payload.email = email.trim()
      if (phone !== (authority.phone ?? '')) payload.phone = phone.trim()
      if (password) payload.password = password

      await adminUpdate.mutateAsync(payload)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err) {
      setError(err.message || 'Failed to update authority.')
    }
  }

  const initials = (authority?.email || 'AU').slice(0, 2).toUpperCase()

  return (
    <Dialog
      open={Boolean(authority)}
      onClose={onClose}
      title="Edit Authority Officer"
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Officer Snapshot Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken/40 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink text-sm">{authority?.email}</span>
                <span className="text-xs text-ink-muted hidden sm:inline">•</span>
                <span className="text-xs text-ink-muted hidden sm:inline">{getJurisdictionLabel(authority?.assignedArea)}</span>
              </div>
              {authority?.phone && (
                <p className="text-2xs text-ink-muted mt-0.5">{authority.phone}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyId}
              title="Copy UUID"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-panel px-2.5 py-1 font-mono text-xs font-semibold text-ink hover:border-primary transition cursor-pointer"
            >
              <span>#UM-{shortId(authority?.id)}</span>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-ink-muted" />}
            </button>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                status === 'active'
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                  : status === 'suspended'
                  ? 'border border-rose-300 bg-rose-50 text-rose-800'
                  : 'border border-line bg-surface-panel text-ink-muted'
              }`}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Segmented Tab Navigation Bar */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-sunken p-1 border border-line">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'general'
                ? 'bg-surface-panel text-ink shadow-xs border border-line/80 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-panel/40'
            }`}
          >
            <UserCheck className={`h-4 w-4 ${activeTab === 'general' ? 'text-primary' : 'text-ink-muted'}`} />
            <span>General &amp; Jurisdiction</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scope')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'scope'
                ? 'bg-surface-panel text-ink shadow-xs border border-line/80 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-panel/40'
            }`}
          >
            <Layers className={`h-4 w-4 ${activeTab === 'scope' ? 'text-primary' : 'text-ink-muted'}`} />
            <span>Category Scope</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-3xs font-bold ${
                activeTab === 'scope'
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-surface-sunken text-ink-muted'
              }`}
            >
              {categoryScope.length}/{activeCategories.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'security'
                ? 'bg-surface-panel text-ink shadow-xs border border-line/80 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-panel/40'
            }`}
          >
            <Lock className={`h-4 w-4 ${activeTab === 'security' ? 'text-primary' : 'text-ink-muted'}`} />
            <span>Security &amp; Password</span>
            {password && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="Password changed" />
            )}
          </button>
        </div>

        {/* Tab Content Panels (Fixed stable height to completely prevent modal jumping) */}
        <div className="h-[345px] overflow-y-auto pr-1">
          {/* TAB 1: General & Jurisdiction */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Official Email Address <span className="text-status-critical">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-2xs text-ink-muted">
                    Primary address used for officer sign-in and system notifications.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+8801700000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="off"
                    className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-2xs text-ink-muted">
                    Direct mobile line for dispatch &amp; field ops.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Territorial Jurisdiction Zone
                  </label>
                  <select
                    aria-label="Territorial Jurisdiction"
                    value={assignedArea}
                    onChange={(e) => setAssignedArea(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none cursor-pointer"
                  >
                    {JURISDICTION_AREAS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-2xs text-ink-muted">
                    Restricts the officer's queue &amp; map to this municipal boundary.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Account Operational Status
                  </label>
                  <select
                    aria-label="Account status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none cursor-pointer"
                  >
                    {!['active', 'suspended'].includes(status) && (
                      <option value={status} disabled>
                        {status.charAt(0).toUpperCase() + status.slice(1)} (Current)
                      </option>
                    )}
                    <option value="active">Active (Operational &amp; Full Access)</option>
                    <option value="suspended">Suspended (Access immediately revoked)</option>
                  </select>
                  <p className="mt-1 text-2xs text-ink-muted">
                    Suspended accounts cannot log in or perform dispatch actions.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface-sunken/40 p-3.5 flex items-start gap-3">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-ink">
                    Active Boundary: {getJurisdictionLabel(assignedArea)}
                  </p>
                  <p className="text-2xs text-ink-muted mt-0.5 leading-relaxed">
                    New incidents submitted by citizens within this territorial area will automatically route to this officer for triage and assignment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Departmental Category Scope */}
          {activeTab === 'scope' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-ink">Departmental Category Scope</h3>
                    <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/25 px-2 py-0.5 text-2xs font-bold text-primary">
                      {categoryScope.length} of {activeCategories.length} Selected
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer shrink-0"
                  >
                    {categoryScope.length === activeCategories.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <p className="text-2xs text-ink-muted mt-0.5">
                  Select the municipal categories this officer is authorized to moderate and dispatch.
                </p>
              </div>

              {/* Quick preset chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-ink-muted font-medium">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('all')}
                  className="rounded-full border border-line bg-surface-panel px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary transition cursor-pointer"
                >
                  All ({activeCategories.length})
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('infrastructure')}
                  className="rounded-full border border-line bg-surface-panel px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary transition cursor-pointer"
                >
                  Infrastructure &amp; Roads
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('sanitation_water')}
                  className="rounded-full border border-line bg-surface-panel px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary transition cursor-pointer"
                >
                  Water &amp; Sanitation
                </button>
              </div>

              {/* Categories grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 rounded-xl border border-line p-2.5 bg-surface-sunken/30">
                {activeCategories.map((cat) => {
                  const checked = categoryScope.includes(cat.key)
                  return (
                    <label
                      key={cat.key}
                      className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-lg border px-3 py-2 text-xs transition select-none ${
                        checked
                          ? 'border-primary bg-primary/5 text-primary-dark font-semibold shadow-2xs'
                          : 'border-line bg-surface-panel hover:bg-surface-sunken/60 text-ink'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(cat.key)}
                          className="h-4 w-4 accent-primary cursor-pointer shrink-0"
                        />
                        <span className="truncate">{cat.label?.en || cat.key}</span>
                      </div>
                      {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </label>
                  )
                })}
              </div>
              <p className="text-2xs text-ink-muted">
                Per security policy BR-26, officers cannot review or resolve reports outside their authorized category scope.
              </p>
            </div>
          )}

          {/* TAB 3: Security & Password */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* 2FA Card */}
              <div className="rounded-xl border border-line bg-surface-sunken/40 p-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requireTwoFactor}
                    onChange={(e) => setRequireTwoFactor(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-semibold text-ink flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Require Two-Factor Authentication (2FA)
                    </span>
                    <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                      Enforces TOTP authenticator device verification on every sign-in attempt. Recommended for officers with dispatch and triage rights.
                    </p>
                  </div>
                </label>
              </div>

              {/* Password Reset Card */}
              <div className="rounded-xl border border-line bg-surface-sunken/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Lock className="h-4 w-4 text-primary" />
                    <span>Reset Officer Password</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <p className="text-xs text-ink-muted">
                  Leave these fields blank if you do not want to change the officer's current password.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-ink mb-1">
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-ink mb-1">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-line bg-surface-panel px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                {password && (
                  <div className="flex items-center gap-2 text-xs pt-1">
                    {password.length < 8 ? (
                      <span className="text-amber-600 font-medium">⚠️ Password must be at least 8 characters long</span>
                    ) : password === confirmPassword ? (
                      <span className="text-emerald-600 font-semibold">✓ Passwords match</span>
                    ) : confirmPassword ? (
                      <span className="text-rose-600 font-medium">✕ Passwords do not match</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800" role="status">
            ✓ Authority officer updated successfully!
          </div>
        )}

        {/* Persistent Bottom Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-line">
          <Link
            to={`/admin/authorities/${authority?.id}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1.5 font-medium"
          >
            <span>Full Profile &amp; Audit Log</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={adminUpdate.isPending}
              disabled={adminUpdate.isPending}
              className="flex items-center gap-1.5 px-4"
            >
              <Check className="h-4 w-4" />
              <span>Save Changes</span>
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Authority provisioning table and stats with 100% actual database data.
 */
export default function AuthoritiesPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState('')
  const [editingAuthority, setEditingAuthority] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handleSecAlert = () => setRefreshKey((k) => k + 1)
    window.addEventListener('urbanmend_security_alert', handleSecAlert)
    return () => window.removeEventListener('urbanmend_security_alert', handleSecAlert)
  }, [])

  const { data, isLoading, isError, error, refetch } = useAuthorities({
    cursor: cursor || undefined,
  })

  const handleReactivate = (officerId, officerName) => {
    if (!window.confirm(`Are you sure you want to lift operational restrictions and reactivate ${officerName || officerId}?`)) {
      return
    }
    const success = reactivateAuthorityAccount(officerId, user)
    if (success) {
      setRefreshKey((k) => k + 1)
      refetch()
      alert(`Account for ${officerName || officerId} has been successfully reactivated and restrictions lifted.`)
    }
  }

  const authorities = data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  const activeCount = authorities.filter((a) => a.status === 'active').length
  const revokedCount = authorities.filter((a) =>
    ['suspended', 'deprovisioned', 'revoked'].includes(a.status),
  ).length

  // Map 100% actual database authorities
  const displayAuthorities = useMemo(() => {
    return authorities.map((a) => formatAuthority(a, categories))
  }, [authorities, categories])

  // Filter in memory by user search query
  const filteredAuthorities = useMemo(() => {
    if (!q.trim()) return displayAuthorities
    const lower = q.toLowerCase()
    return displayAuthorities.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.email.toLowerCase().includes(lower) ||
        a.role.toLowerCase().includes(lower) ||
        a.scope.some((s) => s.toLowerCase().includes(lower)) ||
        a.status.toLowerCase().includes(lower),
    )
  }, [displayAuthorities, q])

  // Calculate dynamic role distribution from actual authorities
  const roleDistribution = useMemo(() => {
    if (displayAuthorities.length === 0) return []
    const counts = new Map()
    for (const item of displayAuthorities) {
      counts.set(item.role, (counts.get(item.role) || 0) + 1)
    }
    return Array.from(counts.entries()).map(([role, count]) => ({
      role,
      count,
      pct: Math.round((count / displayAuthorities.length) * 100),
    }))
  }, [displayAuthorities])

  const handleExportCompliance = () => {
    if (displayAuthorities.length === 0) return
    const headers = ['ID', 'Name', 'Email', 'Role', 'Category Scope', 'Status']
    const rows = displayAuthorities.map((a) => [
      a.id,
      `"${a.name}"`,
      a.email,
      `"${a.role}"`,
      `"${a.scope.join(', ')}"`,
      a.status,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `authority_compliance_report_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      {/* Header matching admin-authority-provisioning.png */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Authority Provisioning</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage system access, field roles, and category scopes for UrbanMend staff and allied agency personnel.
          </p>
        </div>
        <Link to="/admin/authorities/new">
          <Button className="flex items-center gap-2 bg-[#0e7490] px-4 py-2 font-semibold text-white hover:bg-[#085f76]">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>Provision New Authority</span>
          </Button>
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Column (8 cols): Table */}
        <div className="lg:col-span-8">
          <Card className="overflow-hidden">
            {/* Search filter bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3.5">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Search authorities, roles, scopes..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full rounded-panel border border-line bg-surface-panel py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-hidden"
                />
              </div>
              <p className="text-xs text-ink-muted">
                Showing {filteredAuthorities.length} of {displayAuthorities.length} authorities
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : isError ? (
              <div className="p-6 text-sm text-status-critical" role="alert">
                Failed to load authorities: {error?.message}
              </div>
            ) : filteredAuthorities.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title={q ? 'No matching authorities found' : 'No Authorities Provisioned'}
                  message={
                    q
                      ? `No authority match for "${q}".`
                      : 'Provision an authority above to assign scopes and field permissions.'
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/60 text-left text-xs font-bold tracking-wider text-ink-muted uppercase">
                      <th scope="col" className="px-4 py-3.5">
                        Name &amp; Credential
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Role
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Jurisdiction Area
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Category Scope
                      </th>
                      <th scope="col" className="px-4 py-3.5">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredAuthorities.map((item) => {
                      const isRevoked = item.status === 'revoked'
                      const restriction = getAuthorityRestriction(item.fullId)
                      return (
                        <tr
                          key={item.fullId}
                          className={`transition hover:bg-slate-50/80 ${
                            isRevoked
                              ? 'bg-slate-100/50 text-ink-muted'
                              : restriction?.level === 'permanent'
                              ? 'bg-rose-50/30'
                              : ''
                          }`}
                        >
                          {/* Name & Credential */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                                  isRevoked
                                    ? 'bg-slate-200 text-slate-500'
                                    : 'bg-primary-soft text-primary'
                                }`}
                              >
                                {item.avatar}
                              </div>
                              <div>
                                <Link
                                  to={`/admin/authorities/${item.fullId}`}
                                  className={`font-bold hover:text-primary hover:underline ${
                                    isRevoked ? 'text-ink-muted line-through' : 'text-ink'
                                  }`}
                                >
                                  {item.name}
                                </Link>
                                <p className="text-xs text-ink-faint">
                                  {item.email} &bull; ID: {item.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role pill badge */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded border border-sky-200/60 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                              <UserCheck className="h-3 w-3 text-sky-600" aria-hidden="true" />
                              {item.role}
                            </span>
                          </td>

                          {/* Jurisdiction Area */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              <MapPin className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                              {item.areaLabel}
                            </span>
                          </td>

                          {/* Category Scope */}
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {item.scope.map((cat, i) => (
                                <span
                                  key={i}
                                  className="rounded border border-line bg-surface-panel px-2 py-0.5 text-xs text-ink-muted"
                                >
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            {restriction ? (
                              <RestrictionBadge
                                restriction={restriction}
                                onExpire={() => setRefreshKey((k) => k + 1)}
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    isRevoked ? 'bg-slate-400' : 'bg-status-resolved'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span
                                  className={
                                    isRevoked
                                      ? 'text-slate-500 capitalize'
                                      : 'text-status-resolved capitalize'
                                  }
                                >
                                  {item.status}
                                </span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {restriction && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleReactivate(item.fullId, item.name)}
                                  className="inline-flex items-center gap-1 py-1 px-2.5 text-xs font-bold text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 shadow-2xs"
                                  title="Lift operational restrictions and reactivate authority account"
                                >
                                  Reactivate
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setEditingAuthority(item.rawUser)}
                                className="inline-flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold hover:border-primary hover:text-primary"
                              >
                                <Pencil className="h-3 w-3 text-primary" aria-hidden="true" />
                                <span>Edit</span>
                              </Button>
                              <Link
                                to={`/admin/authorities/${item.fullId}`}
                                className="rounded-panel border border-line p-1.5 text-ink-muted transition hover:border-primary hover:text-primary hover:bg-slate-50"
                                title="View details & audit"
                              >
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table Footer */}
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted">
              <span>Showing 1-{filteredAuthorities.length} of {displayAuthorities.length} Authorities</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!cursor}
                  onClick={() => setCursor('')}
                  className="text-xs"
                >
                  First Page
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!nextCursor}
                  onClick={() => nextCursor && setCursor(nextCursor)}
                  className="text-xs font-semibold text-primary"
                >
                  Next Page &rarr;
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column (4 cols): Panels */}
        <div className="space-y-5 lg:col-span-4">
          {/* Card 1: System Access Overview */}
          <Card>
            <div className="p-4 pb-2">
              <p className="text-[11px] font-bold tracking-wider text-ink-muted uppercase">
                System Access Overview
              </p>
            </div>
            <CardBody className="pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-panel border border-line bg-surface-sunken/60 p-4 text-center">
                  <p className="text-3xl font-bold text-ink">{activeCount}</p>
                  <p className="mt-1 text-xs font-medium text-ink-muted">Active Personnel</p>
                </div>
                <div className="rounded-panel border border-line bg-surface-sunken/60 p-4 text-center">
                  <p className="text-3xl font-bold text-rose-600">{revokedCount}</p>
                  <p className="mt-1 text-xs font-medium text-ink-muted">Revoked</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Card 2: Role Distribution */}
          <Card>
            <div className="p-4 pb-2">
              <p className="text-[11px] font-bold tracking-wider text-ink-muted uppercase">
                Role Distribution
              </p>
            </div>
            <CardBody className="space-y-3.5 pt-2">
              {roleDistribution.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-muted">
                  No authority roles configured.
                </p>
              ) : (
                roleDistribution.map((item, index) => (
                  <div key={item.role}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{item.role}</span>
                      <span className="font-bold text-ink">{item.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          ROLE_COLORS[index % ROLE_COLORS.length]
                        }`}
                        style={{ width: `${Math.min(Math.max(item.pct, 10), 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}

              <div className="flex items-center justify-between border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => exportAuthoritiesPdf({ authorities: displayAuthorities })}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  title="Download official PDF compliance report"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCompliance}
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink hover:underline"
                  title="Download CSV spreadsheet"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export CSV</span>
                </button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {editingAuthority && (
        <EditAuthorityModal
          authority={editingAuthority}
          onClose={() => setEditingAuthority(null)}
          categories={categories}
        />
      )}
    </div>
  )
}

