import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useProvisionAdmin } from '../../hooks/admin'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'

/**
 * Provision a new System Administrator account.
 * Accessible ONLY to Super Administrators (isSuperuser: true).
 */
export default function ProvisionAdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const provision = useProvisionAdmin()

  const isSuperAdmin = Boolean(user?.role === 'admin' && (user?.isSuperuser || user?.is_superuser))

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [assignedArea, setAssignedArea] = useState('Central Operations & Governance')
  const [isSuperuser, setIsSuperuser] = useState(false)
  const [requireTwoFactor, setRequireTwoFactor] = useState(false)
  const [error, setError] = useState(null)

  // Guard against non-superadmin access
  if (!isSuperAdmin) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 mt-12">
        <Card className="border-rose-300 bg-rose-50/50 p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-ink">Super Administrator Access Required</h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Only designated <strong>Super Administrators</strong> have root authorization to provision new administrator accounts.
            As a standard Administrator, you have full privileges to triage issues, moderate content, and provision <strong>Field Authorities</strong>.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link to="/admin/authorities">
              <Button variant="secondary" className="text-xs">
                Back to Authorities
              </Button>
            </Link>
            <Link to="/admin/authorities/new">
              <Button className="bg-[#0e7490] hover:bg-[#085f76] text-white text-xs">
                Provision Field Authority
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
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
        assignedArea: assignedArea.trim() || undefined,
        isSuperuser,
        requireTwoFactor,
      })
      navigate('/admin/authorities?tab=admins', { replace: true })
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
          to="/admin/authorities?tab=admins"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-primary transition mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Administrators &amp; Staff</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                Provision System Administrator
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-purple-200/80 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                <Crown className="h-3 w-3 text-purple-600" />
                Super Admin Privilege
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Create an administrative account with platform management, moderation, and authority oversight credentials.
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
                {/* Section 1: Administrator Account & Identity */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-3">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    Administrator Credentials &amp; Contact
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Official Email Address"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. director.admin@urbanmend.test"
                      className="text-xs"
                    />
                    <Input
                      label="Official Phone Number (Optional)"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+8801700000000"
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Section 2: Password Setup */}
                <div className="border-t border-line/60 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-3">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Authentication Credentials
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="relative">
                      <Input
                        label="Initial Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters..."
                        className="text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-8 text-ink-muted hover:text-ink cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      label="Confirm Password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password..."
                      className="text-xs"
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Tip: If password is provided, account is activated instantly. If left blank, account is set to registered status and requires email activation.
                  </p>
                </div>

                {/* Section 3: Office / Department Assignment */}
                <div className="border-t border-line/60 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-3">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    Administrative Department &amp; Office
                  </h3>
                  <Input
                    label="Assigned Office / Administrative Unit"
                    type="text"
                    value={assignedArea}
                    onChange={(e) => setAssignedArea(e.target.value)}
                    placeholder="e.g. Central Operations & Governance, Municipal HQ"
                    className="text-xs"
                  />
                </div>

                {/* Section 4: Privileges & Security Controls */}
                <div className="border-t border-line/60 pt-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                    Privileges &amp; Security Policy
                  </h3>

                  {/* Superuser Checkbox */}
                  <label className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3.5 cursor-pointer hover:bg-purple-50 transition">
                    <input
                      type="checkbox"
                      checked={isSuperuser}
                      onChange={(e) => setIsSuperuser(e.target.checked)}
                      className="mt-0.5 rounded border-purple-300 text-purple-700 focus:ring-purple-600 h-4 w-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-purple-950 flex items-center gap-1.5">
                        <Crown className="h-3.5 w-3.5 text-purple-600" />
                        Grant Super Administrator Privileges
                      </span>
                      <p className="mt-0.5 text-purple-800 text-[11px]">
                        Grants root administrative permissions, including the ability to provision and manage other system administrator accounts.
                        Standard administrators can only provision field authorities.
                      </p>
                    </div>
                  </label>

                  {/* 2FA Policy */}
                  <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-sunken/40 p-3.5 cursor-pointer hover:bg-surface-sunken transition">
                    <input
                      type="checkbox"
                      checked={requireTwoFactor}
                      onChange={(e) => setRequireTwoFactor(e.target.checked)}
                      className="mt-0.5 rounded border-line text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-ink flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Enforce Mandatory Two-Factor Authentication (2FA)
                      </span>
                      <p className="mt-0.5 text-ink-muted text-[11px]">
                        Account will be required to verify a two-factor security code on every administrative sign-in session.
                      </p>
                    </div>
                  </label>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                    {error}
                  </div>
                )}

                {/* Form Actions */}
                <div className="border-t border-line/60 pt-4 flex items-center justify-end gap-3">
                  <Link to="/admin/authorities?tab=admins">
                    <Button type="button" variant="secondary" size="sm">
                      Cancel
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    size="sm"
                    loading={provision.isPending}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold flex items-center gap-1.5 px-5 shadow-xs"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Provision Administrator</span>
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        {/* Right Column (4 cols): Live Account Preview */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border border-line overflow-hidden shadow-xs">
            <div className="bg-gradient-to-br from-purple-700 to-indigo-900 p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                  Administrator Preview
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                  {isSuperuser ? 'Super Admin' : 'Standard Admin'}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white font-bold text-lg">
                  {email ? email.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white truncate text-sm">
                    {email || 'administrator@urbanmend.test'}
                  </p>
                  <p className="text-xs text-white/80 truncate">
                    {assignedArea || 'Central Operations & Governance'}
                  </p>
                </div>
              </div>
            </div>

            <CardBody className="p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-line">
                <span className="text-ink-muted">Account Status:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                  {password ? 'Active' : 'Registered'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line">
                <span className="text-ink-muted">Privilege Tier:</span>
                <span className="font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1">
                  {isSuperuser ? <Crown className="h-3 w-3 text-purple-600" /> : <Shield className="h-3 w-3 text-purple-600" />}
                  {isSuperuser ? 'Super Administrator' : 'Administrator'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-line">
                <span className="text-ink-muted">2FA Required:</span>
                <span className="font-semibold text-ink">
                  {requireTwoFactor ? 'Enforced' : 'Optional'}
                </span>
              </div>

              <div className="pt-2">
                <p className="font-bold text-ink mb-1.5 text-[11px]">Capability Profile:</p>
                <ul className="space-y-1 text-[11px] text-ink-muted">
                  <li className="flex items-center gap-1.5 text-emerald-700">
                    <Check className="h-3 w-3" /> Full Moderation &amp; Queue Triage
                  </li>
                  <li className="flex items-center gap-1.5 text-emerald-700">
                    <Check className="h-3 w-3" /> System Audit Log &amp; Export
                  </li>
                  <li className="flex items-center gap-1.5 text-emerald-700">
                    <Check className="h-3 w-3" /> Provision Field Authorities
                  </li>
                  <li className={`flex items-center gap-1.5 ${isSuperuser ? 'text-purple-700 font-bold' : 'text-ink-faint'}`}>
                    {isSuperuser ? (
                      <>
                        <Crown className="h-3 w-3" /> Provision New Administrators
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" /> Provision New Administrators (Super Only)
                      </>
                    )}
                  </li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
