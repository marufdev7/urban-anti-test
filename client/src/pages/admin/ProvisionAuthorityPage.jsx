import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react'
import { useProvisionAuthority } from '../../hooks/admin'
import { categoryLabel, useCategories } from '../../hooks/data'
import { JURISDICTION_AREAS, getJurisdictionLabel } from '../../lib/zones'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'

/**
 * Provision a new authority officer with credentials, territorial jurisdiction,
 * and departmental category scopes.
 */
export default function ProvisionAuthorityPage() {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const provision = useProvisionAuthority()

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [assignedArea, setAssignedArea] = useState('')
  const [scope, setScope] = useState([]) // selected slugs
  const [requireTwoFactor, setRequireTwoFactor] = useState(false)
  const [error, setError] = useState(null)

  const activeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.active),
    [categories],
  )

  const toggleScope = (slug) => {
    setScope((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  const selectAllScopes = () => {
    setScope(activeCategories.map((c) => c.key))
  }

  const clearAllScopes = () => {
    setScope([])
  }

  // Quick preset templates
  const applyPreset = (presetType) => {
    const allKeys = activeCategories.map((c) => c.key)
    switch (presetType) {
      case 'all':
        setScope(allKeys)
        break
      case 'infrastructure':
        setScope(
          allKeys.filter((k) =>
            ['roads_transport', 'street_lighting', 'public_structures'].includes(k),
          ),
        )
        break
      case 'sanitation_water':
        setScope(
          allKeys.filter((k) =>
            ['water_drainage', 'sanitation_waste'].includes(k),
          ),
        )
        break
      case 'hazards_safety':
        setScope(
          allKeys.filter((k) =>
            ['electrical_hazards', 'public_structures', 'other'].includes(k),
          ),
        )
        break
      default:
        break
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    if (phone.trim() && !/^\+?[0-9]{7,15}$/.test(phone.trim())) {
      setError('Please enter a valid phone number in international format (e.g. +8801700000000).')
      return
    }

    try {
      await provision.mutateAsync({
        email: email.trim(),
        phone: phone.trim() || undefined,
        password: password || undefined,
        assignedArea: assignedArea || '',
        categoryScope: scope,
        requireTwoFactor,
      })
      navigate('/admin/authorities', { replace: true })
    } catch (err) {
      const detail = err.details?.map((d) => d.message).filter(Boolean).join(' ')
      setError(detail || err.message)
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Breadcrumb Navigation & Page Header */}
      <div>
        <Link
          to="/admin/authorities"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-primary transition mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Authorities</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                Provision Authority Officer
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                <Shield className="h-3 w-3 text-teal-600" />
                Municipal Staff
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Configure official credentials, municipal jurisdiction bounds, and departmental category permissions.
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Primary Form Column (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="shadow-panel overflow-hidden border border-line">
            <CardBody className="p-6">
              <form onSubmit={onSubmit} className="space-y-6">
                {/* Section 1: Officer Account & Identity */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-3">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    Officer Account & Contact Details
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Official Email Address"
                      type="email"
                      autoComplete="off"
                      required
                      placeholder="officer@city.gov"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      hint="Official municipal email for dispatch alerts & login."
                    />
                    <Input
                      label="Contact Phone Number"
                      type="tel"
                      autoComplete="off"
                      placeholder="+8801700000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      hint="E.164 format with country code (optional)."
                    />
                  </div>
                </div>

                {/* Section 2: Credentials & Login Password */}
                <div className="rounded-xl border border-line bg-surface-sunken/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Lock className="h-4 w-4 text-primary" />
                      <span>Initial Login Credentials</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-panel hover:text-ink transition cursor-pointer"
                    >
                      {showPassword ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 text-ink-muted" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 text-ink-muted" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Setting an initial password allows the officer to log in immediately and operate in their assigned jurisdiction.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <Input
                      label="Confirm Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {/* Section 3: Territorial Jurisdiction */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="assignedAreaSelect" className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span>Assigned Territorial Jurisdiction</span>
                    </label>
                    {assignedArea && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-800">
                        <Check className="h-3 w-3" />
                        {getJurisdictionLabel(assignedArea)}
                      </span>
                    )}
                  </div>
                  <Select
                    id="assignedAreaSelect"
                    options={JURISDICTION_AREAS}
                    value={assignedArea}
                    onChange={(e) => setAssignedArea(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
                    The officer's live incident map, triage queue, and dispatch actions will automatically focus on this municipal boundary.
                  </p>
                </div>

                {/* Section 4: Departmental Category Scope */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        <span>Departmental Category Scope</span>
                      </span>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Empty scope grants no action rights per security policy (BR-26).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                        {scope.length} of {activeCategories.length} Selected
                      </span>
                      <button
                        type="button"
                        onClick={scope.length === activeCategories.length ? clearAllScopes : selectAllScopes}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        {scope.length === activeCategories.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeCategories.map((c) => {
                      const isChecked = scope.includes(c.key)
                      return (
                        <label
                          key={c.key}
                          className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border p-3 text-xs transition select-none ${
                            isChecked
                              ? 'border-primary bg-primary/5 text-primary-dark font-semibold shadow-2xs'
                              : 'border-line bg-surface-panel hover:bg-surface-sunken/60 text-ink'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleScope(c.key)}
                              className="h-4 w-4 rounded accent-primary cursor-pointer shrink-0"
                            />
                            <span className="truncate">{c.label?.en || c.key}</span>
                          </div>
                          {isChecked && (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Section 5: Account Security Policy */}
                <div className="rounded-xl border border-line bg-surface-sunken/30 p-3.5">
                  <label className="flex cursor-pointer items-start gap-3 select-none">
                    <input
                      type="checkbox"
                      checked={requireTwoFactor}
                      onChange={(e) => setRequireTwoFactor(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Enforce Two-Factor Authentication (2FA)
                      </span>
                      <p className="mt-0.5 text-xs text-ink-muted leading-relaxed">
                        Officer will be required to configure and confirm a TOTP authenticator device upon first sign-in.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Error Banner */}
                {error && (
                  <div
                    className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
                    role="alert"
                  >
                    <strong>Error: </strong>
                    <span>{error}</span>
                  </div>
                )}

                {/* Bottom Action Buttons */}
                <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => navigate('/admin/authorities')}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={provision.isPending}
                    disabled={!email.trim() || (categories?.length && scope.length === 0)}
                    className="flex items-center gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>Provision Authority Officer</span>
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right Information & Guidance Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Quick Scope Templates */}
          <Card className="border border-line shadow-panel p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Quick Scope Presets
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed mb-3">
              Apply standard departmental scope templates with a single click:
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className="w-full flex items-center justify-between rounded-lg border border-line bg-surface-sunken/40 px-3 py-2 text-xs font-semibold text-ink hover:border-primary hover:bg-surface-panel transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span>All Departments (Full Access)</span>
                </div>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary">All</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('infrastructure')}
                className="w-full flex items-center justify-between rounded-lg border border-line bg-surface-sunken/40 px-3 py-2 text-xs font-semibold text-ink hover:border-primary hover:bg-surface-panel transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-amber-600" />
                  <span>Public Infrastructure (Roads, Lighting)</span>
                </div>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-bold text-amber-800">3 Depts</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('sanitation_water')}
                className="w-full flex items-center justify-between rounded-lg border border-line bg-surface-sunken/40 px-3 py-2 text-xs font-semibold text-ink hover:border-primary hover:bg-surface-panel transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-teal-600" />
                  <span>Water &amp; Sanitation (Drainage, Waste)</span>
                </div>
                <span className="rounded bg-teal-100 px-1.5 py-0.5 text-2xs font-bold text-teal-800">2 Depts</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('hazards_safety')}
                className="w-full flex items-center justify-between rounded-lg border border-line bg-surface-sunken/40 px-3 py-2 text-xs font-semibold text-ink hover:border-primary hover:bg-surface-panel transition cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-rose-600" />
                  <span>Hazards &amp; Structural Safety</span>
                </div>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-2xs font-bold text-rose-800">3 Depts</span>
              </button>
            </div>
          </Card>

          {/* Spatial Scoping & Governance Rules */}
          <Card className="border border-line shadow-panel p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              Role &amp; Jurisdiction Scoping
            </h3>
            <div className="space-y-2.5 text-xs text-ink-muted leading-relaxed">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Territorial Isolation:</strong> Authority officers can only view and update incidents inside their assigned boundary.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Category Defense:</strong> Empty category scopes grant zero triage rights, preventing accidental cross-departmental edits.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Audit Provenance:</strong> Account creation and subsequent assignments are immutably logged to the Central Audit Log.
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
