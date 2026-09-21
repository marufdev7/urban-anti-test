import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Download,
  FileText,
  Lock,
  MapPin,
  Pencil,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { useAuthorities, useAdminUpdateUser } from '../../hooks/admin'
import { categoryLabel, useCategories } from '../../hooks/data'
import { exportAuthoritiesPdf } from '../../lib/pdfExport'
import { JURISDICTION_AREAS, getJurisdictionLabel } from '../../lib/zones'
import { shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import EmptyState from '../../components/ui/EmptyState'
import Input from '../../components/ui/Input'
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
  const [email, setEmail] = useState(authority?.email || '')
  const [phone, setPhone] = useState(authority?.phone || '')
  const [assignedArea, setAssignedArea] = useState(authority?.assignedArea || '')
  const [status, setStatus] = useState(authority?.status || 'active')
  const [categoryScope, setCategoryScope] = useState(authority?.categoryScope || [])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (password) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    try {
      const payload = {
        userId: authority.id,
        assignedArea,
        status,
        categoryScope,
      }
      if (email && email !== authority.email) payload.email = email
      if (phone !== (authority.phone ?? '')) payload.phone = phone
      if (password) payload.password = password

      await adminUpdate.mutateAsync(payload)
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 600)
    } catch (err) {
      setError(err.message || 'Failed to update authority.')
    }
  }

  return (
    <Dialog
      open={Boolean(authority)}
      onClose={onClose}
      title="Edit Authority Officer"
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Officer name & ID badge */}
        <div className="flex items-center justify-between rounded-panel bg-surface-sunken/60 p-3">
          <div>
            <p className="text-xs font-semibold text-ink-muted">Authority Account</p>
            <p className="text-sm font-bold text-ink">{authority?.email}</p>
          </div>
          <span className="rounded border border-line bg-surface-panel px-2 py-0.5 text-xs text-ink-muted font-mono">
            ID: {shortId(authority?.id)}
          </span>
        </div>

        {/* Email & Phone */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="+8801700000000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Jurisdiction Area & Status */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Jurisdiction Area
            </label>
            <Select
              options={JURISDICTION_AREAS}
              value={assignedArea}
              onChange={(e) => setAssignedArea(e.target.value)}
            />
            <p className="mt-1 text-2xs text-ink-muted">
              Limits this officer's queue &amp; map to this city/zone.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Account Status
            </label>
            <select
              aria-label="Account status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-sm focus:border-primary"
            >
              <option value="active">Active</option>
              <option value="verified">Verified</option>
              <option value="registered">Registered</option>
              <option value="suspended">Suspended</option>
              <option value="deprovisioned">Deprovisioned</option>
            </select>
            <p className="mt-1 text-2xs text-ink-muted">
              Suspended accounts cannot log in or take actions.
            </p>
          </div>
        </div>

        {/* Category Scope */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-ink">
              Departmental Category Scope
            </label>
            <button
              type="button"
              onClick={selectAllCategories}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {categoryScope.length === activeCategories.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-panel border border-line p-2.5 bg-surface-sunken/30 max-h-36 overflow-y-auto">
            {activeCategories.map((cat) => {
              const checked = categoryScope.includes(cat.key)
              return (
                <label
                  key={cat.key}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
                    checked
                      ? 'bg-primary-soft/50 font-semibold text-primary-dark'
                      : 'hover:bg-surface-sunken text-ink'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(cat.key)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="truncate">{cat.label.en}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Set / Reset Password */}
        <div className="rounded-panel border border-line bg-surface-sunken/40 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span>Set New Login Password (Optional)</span>
          </div>
          <p className="text-2xs text-ink-muted">
            Leave blank if you do not want to change the officer's password.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              type="password"
              placeholder="New password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-status-critical" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="text-xs font-semibold text-status-resolved" role="status">
            ✓ Authority updated successfully!
          </p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <Link
            to={`/admin/authorities/${authority?.id}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span>Full Profile &amp; Audit Log</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={adminUpdate.isPending}
              disabled={adminUpdate.isPending}
            >
              Save Changes
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
  const { data: categories } = useCategories()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState('')
  const [editingAuthority, setEditingAuthority] = useState(null)

  const { data, isLoading, isError, error } = useAuthorities({
    cursor: cursor || undefined,
  })

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
                      return (
                        <tr
                          key={item.fullId}
                          className={`transition hover:bg-slate-50/80 ${
                            isRevoked ? 'bg-slate-100/50 text-ink-muted' : ''
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
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
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

