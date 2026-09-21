import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { useProvisionAuthority } from '../../hooks/admin'
import { useCategories } from '../../hooks/data'
import { JURISDICTION_AREAS } from '../../lib/zones'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import PageHeader from '../../components/ui/PageHeader'

/**
 * Provision a new authority.
 * Backend body: { email, password, assignedArea, categoryScope, requireTwoFactor } → 201.
 * If password is provided, account is immediately active and verified so the authority
 * can log in right away and operate in their assigned jurisdiction.
 */
export default function ProvisionAuthorityPage() {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const provision = useProvisionAuthority()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [assignedArea, setAssignedArea] = useState('')
  const [scope, setScope] = useState([]) // selected slugs
  const [requireTwoFactor, setRequireTwoFactor] = useState(false)
  const [error, setError] = useState(null)

  const toggleScope = (slug) => {
    setScope((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
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

    try {
      await provision.mutateAsync({
        email: email.trim(),
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
    <div>
      <PageHeader
        title="Provision Authority"
        subtitle="Create a new authority account with credentials and jurisdiction."
      />

      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody className="pt-5">
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Input
                label="Email address"
                type="email"
                autoComplete="off"
                required
                placeholder="authority@city.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                hint="Official email address for the municipal officer."
              />

              <div className="rounded-panel border border-line bg-surface-base/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Lock className="h-4 w-4 text-primary" />
                    <span>Login Password (Credentials)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Show
                      </>
                    )}
                  </button>
                </div>
                <p className="mb-3 text-xs text-ink-muted">
                  Setting a password allows this authority officer to log in immediately and begin resolving issues in their jurisdiction.
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

              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  <label htmlFor="assignedAreaSelect" className="text-sm font-medium text-ink">
                    Assigned Jurisdiction / City Corporation
                  </label>
                </div>
                <Select
                  id="assignedAreaSelect"
                  options={JURISDICTION_AREAS}
                  value={assignedArea}
                  onChange={(e) => setAssignedArea(e.target.value)}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  The officer will work in this specific municipal boundary. Their incident queue and live map will automatically focus on this area.
                </p>
              </div>

              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-ink">
                  Category scope <span className="text-ink-faint">(Empty = cannot act on any category)</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(categories ?? [])
                    .filter((c) => c.active)
                    .map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded-panel border border-line px-3 py-2 text-sm hover:border-primary"
                      >
                        <input
                          type="checkbox"
                          checked={scope.includes(c.key)}
                          onChange={() => toggleScope(c.key)}
                          className="h-4 w-4 accent-primary"
                        />
                        {c.label.en}
                      </label>
                    ))}
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={requireTwoFactor}
                  onChange={(e) => setRequireTwoFactor(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Require two-factor authentication (2FA) for this account
              </label>

              {error && (
                <p
                  className="rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => navigate('/admin/authorities')}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={provision.isPending}
                  disabled={!email.trim() || (categories?.length && scope.length === 0)}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Provision Authority
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
