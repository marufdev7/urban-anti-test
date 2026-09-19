import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Bell,
  Check,
  Edit2,
  FolderTree,
  Network,
  Plus,
  Power,
  Shield,
  ShieldCheck,
  Tag,
  Trash2,
  User,
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

export default function AdminSettingsPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const queryClient = useQueryClient()

  // Language settings
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)

  const updateProfile = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session'], updated)
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
  })

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

  const clusteringRules = clusteringQuery.data?.data ?? clusteringQuery.data ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="System &amp; Admin Settings"
        subtitle="Manage administrator credentials, system configuration, and reference data."
      />

      {/* Admin Profile & Regional Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" aria-hidden="true" />
              Administrator Account
            </span>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Admin Email
              </p>
              <p className="mt-1 font-medium text-ink">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Role &amp; Permissions
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                <span className="font-semibold text-primary">System Administrator</span>
                <span className="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary">
                  Unrestricted Scope
                </span>
              </p>
            </div>
          </div>

          <hr className="border-line" />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateProfile.mutate({ preferredLanguage })
            }}
            className="flex flex-wrap items-end gap-3 pt-1"
          >
            <div className="w-64">
              <label htmlFor="admin-lang" className="block text-xs font-medium text-ink">
                Preferred Interface Language
              </label>
              <Select
                id="admin-lang"
                className="mt-1 w-full"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                options={[
                  { value: 'en', label: 'English (Default)' },
                  { value: 'bn', label: 'বাংলা (Bengali)' },
                ]}
              />
            </div>
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Spinner size="sm" /> : 'Save Language'}
            </Button>
            {profileSuccess && (
              <span className="flex items-center gap-1 text-xs font-medium text-status-resolved">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </form>
        </CardBody>
      </Card>

      {/* Security & 2FA Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
              Administrator 2FA Enforcement
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            All administrative actions (authority provisioning, scope updates, moderation decisions) are strictly audited. Two-Factor Authentication is highly recommended for all administrator credentials.
          </p>
          <div className="pt-2">
            <Button
              variant="secondary"
              onClick={() => enroll2FA.mutate()}
              disabled={enroll2FA.isPending}
            >
              {enroll2FA.isPending ? <Spinner size="sm" /> : 'Enroll / Refresh 2FA Device'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* System Reference Data Management & Health Card */}
      <Card>
        <CardHeader
          title={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                System Reference Data &amp; Health
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                healthQuery.isError ? 'bg-status-critical-soft text-status-critical' : 'bg-status-resolved-soft text-status-resolved'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${healthQuery.isError ? 'bg-status-critical' : 'bg-status-resolved'}`} />
                {healthQuery.isError ? 'System Degraded' : 'System Operational'}
              </span>
            </div>
          }
        />
        <CardBody className="space-y-6">
          {/* Top High-level stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-panel border border-line bg-surface-sunken p-3">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-ink">Categories</span>
              </div>
              <p className="mt-2 text-xl font-bold text-ink">
                {(categories ?? []).filter((c) => c.active).length}
                <span className="text-xs font-normal text-ink-muted"> / {(categories ?? []).length} active</span>
              </p>
            </div>

            <div className="rounded-panel border border-line bg-surface-sunken p-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-ink">Severity Keywords</span>
              </div>
              <p className="mt-2 text-xl font-bold text-ink">
                {(keywords ?? []).filter((k) => k.active).length}
                <span className="text-xs font-normal text-ink-muted"> / {(keywords ?? []).length} active</span>
              </p>
            </div>

            <div className="rounded-panel border border-line bg-surface-sunken p-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-ink">Clustering Rules</span>
              </div>
              <p className="mt-2 text-xl font-bold text-ink">
                {Array.isArray(clusteringRules) ? clusteringRules.length : 0}
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => setRefTab('categories')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
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
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
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
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
                refTab === 'clustering'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              Clustering Rules ({clusteringRules?.length ?? 0})
            </button>
          </div>

          {/* TAB 1: Categories */}
          {refTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-muted">
                  Municipal issue classifications. Deactivating a category hides it from citizen submission forms.
                </p>
                <Button size="sm" onClick={() => setAddCatOpen(true)} className="flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Category
                </Button>
              </div>

              <div className="overflow-x-auto rounded-panel border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-surface-sunken text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    <tr>
                      <th className="px-3 py-2.5">Key / Slug</th>
                      <th className="px-3 py-2.5">English Label</th>
                      <th className="px-3 py-2.5">Bengali Label</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(categories ?? []).map((cat) => (
                      <tr key={cat.key} className="hover:bg-surface-sunken/50">
                        <td className="px-3 py-2 font-mono font-medium text-ink">{cat.key}</td>
                        <td className="px-3 py-2 text-ink">{cat.label?.en ?? '—'}</td>
                        <td className="px-3 py-2 text-ink">{cat.label?.bn ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              cat.active
                                ? 'bg-status-resolved-soft text-status-resolved'
                                : 'bg-surface-sunken text-ink-muted'
                            }`}
                          >
                            {cat.active ? 'Active' : 'Retired'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={toggleCategory.isPending}
                            onClick={() => toggleCategory.mutate({ key: cat.key, active: !cat.active })}
                            className="text-[11px]"
                          >
                            {cat.active ? 'Retire' : 'Activate'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Severity Keywords */}
          {refTab === 'keywords' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-muted">
                  Heuristic signals extracted from citizen report titles and descriptions to flag emergency severity.
                </p>
                <Button size="sm" onClick={() => setAddKeywordOpen(true)} className="flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add Keyword
                </Button>
              </div>

              {keywords.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title="No severity keywords defined"
                  message="Create keyword signals to help automate emergency priority triage."
                />
              ) : (
                <div className="overflow-x-auto rounded-panel border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-surface-sunken text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <tr>
                        <th className="px-3 py-2.5">Term / Keyword</th>
                        <th className="px-3 py-2.5">Severity</th>
                        <th className="px-3 py-2.5">Language</th>
                        <th className="px-3 py-2.5">Category Scope</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {keywords.map((kw) => (
                        <tr key={kw.id} className="hover:bg-surface-sunken/50">
                          <td className="px-3 py-2 font-medium text-ink">{kw.term}</td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={kw.severity} label={kw.severity} />
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                              {kw.language?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ink-muted">{kw.category || 'All Categories'}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                kw.active
                                  ? 'bg-status-resolved-soft text-status-resolved'
                                  : 'bg-surface-sunken text-ink-muted'
                              }`}
                            >
                              {kw.active ? 'Active' : 'Retired'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {kw.active ? (
                              <button
                                type="button"
                                disabled={deleteKeyword.isPending}
                                onClick={() => deleteKeyword.mutate(kw.id)}
                                title="Retire keyword"
                                className="rounded p-1 text-status-critical hover:bg-status-critical-soft disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="text-[11px] text-ink-faint">Archived</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Clustering Rules */}
          {refTab === 'clustering' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-muted">
                  Spatial and temporal thresholds used by the clustering engine to aggregate reports into a single incident.
                </p>
                <Button size="sm" onClick={() => setAddRuleOpen(true)} className="flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> New Rule
                </Button>
              </div>

              {clusteringRules.length === 0 ? (
                <EmptyState
                  icon={Network}
                  title="No clustering rules defined"
                  message="Add spatial radius and temporal window rules for municipal incident aggregation."
                />
              ) : (
                <div className="overflow-x-auto rounded-panel border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-surface-sunken text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <tr>
                        <th className="px-3 py-2.5">Category</th>
                        <th className="px-3 py-2.5">Spatial Radius</th>
                        <th className="px-3 py-2.5">Time Window</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {clusteringRules.map((rule) => {
                        const radius = rule.radiusM ?? rule.radius_m ?? '—'
                        const hours = rule.timeWindowHours ?? rule.time_window_hours ?? '—'
                        return (
                          <tr key={rule.id} className="hover:bg-surface-sunken/50">
                            <td className="px-3 py-2 font-mono font-medium text-ink">{rule.category}</td>
                            <td className="px-3 py-2 text-ink">{radius} meters</td>
                            <td className="px-3 py-2 text-ink">{hours} hours</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  rule.active
                                    ? 'bg-status-resolved-soft text-status-resolved'
                                    : 'bg-surface-sunken text-ink-muted'
                                }`}
                              >
                                {rule.active ? 'Active' : 'Retired'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditRule(rule)
                                  setRuleForm({
                                    radiusM: rule.radiusM ?? rule.radius_m ?? 50,
                                    timeWindowHours: rule.timeWindowHours ?? rule.time_window_hours ?? 24,
                                  })
                                  setRuleError(null)
                                }}
                                className="flex items-center gap-1 text-[11px]"
                              >
                                <Edit2 className="h-3 w-3" /> Edit
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Notification Preferences Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
              Administrative Notification Alerts
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
              <label className="flex items-start gap-3 rounded-panel border border-line bg-surface-sunken p-3">
                <input
                  type="checkbox"
                  checked={inApp}
                  onChange={(e) => setInApp(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-medium text-ink">In-App Notifications</p>
                  <p className="text-xs text-ink-muted">
                    Receive immediate notifications for critical-severity escalations and security alerts.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-panel border border-line bg-surface-sunken p-3">
                <input
                  type="checkbox"
                  checked={emailNotif}
                  onChange={(e) => setEmailNotif(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-medium text-ink">Email Digests</p>
                  <p className="text-xs text-ink-muted">
                    Receive daily moderation summaries and system error alerts.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={updateNotif.isPending}>
                {updateNotif.isPending ? <Spinner size="sm" /> : 'Save Notification Preferences'}
              </Button>
              {notifSaved && (
                <span className="flex items-center gap-1 text-xs font-medium text-status-resolved">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* 2FA Enrollment Modal */}
      <Dialog
        open={twoFactorOpen}
        onClose={() => setTwoFactorOpen(false)}
        title="Admin 2FA Device Setup"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p>
            Scan or copy this key into your authenticator app:
          </p>

          <div className="rounded-panel border border-line bg-surface-sunken p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Base32 Secret Key
            </p>
            <p className="mt-1 font-mono text-base font-bold tracking-wider text-primary select-all">
              {enrollData?.secret}
            </p>
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

        <div className="mt-4 flex justify-end gap-2">
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
              placeholder="e.g. পানি নিষ্কাশন সমস্যা"
              className="mt-1"
              required
            />
          </div>

          {catError && (
            <p className="text-xs text-status-critical" role="alert">
              {catError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAddCatOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? <Spinner size="sm" /> : 'Create Category'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Severity Keyword Modal */}
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
              placeholder="e.g. gas leakage"
              className="mt-1"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                  { value: 'en', label: 'English (EN)' },
                  { value: 'bn', label: 'Bengali (BN)' },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-ink">Category Scope (Optional)</label>
            <Select
              value={keywordForm.category}
              onChange={(e) => setKeywordForm((f) => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full"
              options={[
                { value: '', label: 'All Categories (Global Signal)' },
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

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setAddKeywordOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createKeyword.isPending}>
              {createKeyword.isPending ? <Spinner size="sm" /> : 'Add Keyword'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Clustering Rule Modal */}
      <Dialog
        open={Boolean(editRule)}
        onClose={() => setEditRule(null)}
        title={`Edit Clustering Rule: ${editRule?.category ?? ''}`}
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
            <label className="block font-medium text-ink">Category (Immutable)</label>
            <Input value={editRule?.category ?? ''} disabled className="mt-1 font-mono opacity-70" />
          </div>

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
            <p className="mt-0.5 text-[11px] text-ink-muted">Reports within this distance will be grouped.</p>
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
            <p className="mt-0.5 text-[11px] text-ink-muted">Max temporal separation for clustering into an incident.</p>
          </div>

          {ruleError && (
            <p className="text-xs text-status-critical" role="alert">
              {ruleError}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditRule(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateRule.isPending}>
              {updateRule.isPending ? <Spinner size="sm" /> : 'Save Rule'}
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

          <div className="mt-4 flex justify-end gap-2 pt-2">
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
