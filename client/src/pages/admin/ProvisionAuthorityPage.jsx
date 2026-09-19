import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useProvisionAuthority } from '../../hooks/admin'
import { useCategories } from '../../hooks/data'
import Button from '../../components/ui/Button'
import Card, { CardBody } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'

/**
 * Provision a new authority (admin-authority-provisioning.png). Backend body:
 * { email, categoryScope, requireTwoFactor } → 201. The account starts in
 * status "registered"; the new authority sets its own password through the
 * emailed reset link (verified mailbox required — API §6.2).
 */
export default function ProvisionAuthorityPage() {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const provision = useProvisionAuthority()

  const [email, setEmail] = useState('')
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
    try {
      await provision.mutateAsync({
        email: email.trim(),
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
      <PageHeader title="Provision Authority" subtitle="Create a new authority account." />

      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody className="pt-5">
            <form onSubmit={onSubmit}>
              <Input
                label="Email address"
                type="email"
                autoComplete="off"
                required
                placeholder="authority@city.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                hint="A password-reset invitation is emailed to this verified mailbox."
                className="mb-4"
              />

              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-ink">
                  Category scope <span className="text-ink-faint">(BR-26 — empty = acts on nothing)</span>
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

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={requireTwoFactor}
                  onChange={(e) => setRequireTwoFactor(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Require two-factor authentication for this account
              </label>

              {error && (
                <p
                  className="mt-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={() => navigate('/admin/authorities')}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={provision.isPending}
                  disabled={!email.trim() || (categories?.length && scope.length === 0)}
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Provision
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
