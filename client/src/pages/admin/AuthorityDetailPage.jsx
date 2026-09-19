import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useAuthorities, useUpdateUser } from '../../hooks/admin'
import { useCategories } from '../../hooks/data'
import { formatDate } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'verified', label: 'Verified' },
  { value: 'registered', label: 'Registered' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deprovisioned', label: 'Deprovisioned' },
]

const STATUS_TONES = {
  active: 'resolved',
  verified: 'low',
  registered: 'processing',
  suspended: 'high',
  deprovisioned: 'neutral',
}

const STATUS_LABELS = {
  active: 'Active',
  verified: 'Verified',
  registered: 'Registered',
  suspended: 'Suspended',
  deprovisioned: 'Deprovisioned',
}

/**
 * Authority detail / management. The admin API has no GET /users/{id}
 * resource — the collection (role=authority) is the read source, and PATCH
 * /users/{id} mutates status + category scope. Provisioning, revocation and
 * scope changes are audited server-side (FR-32).
 */
export default function AuthorityDetailPage() {
  const { authorityId } = useParams()
  const { data: categories } = useCategories()
  const { data, isLoading, isError, error } = useAuthorities()

  const authority = data?.data?.find((a) => a.id === authorityId)
  const update = useUpdateUser(authorityId)

  const [statusDraft, setStatusDraft] = useState('')
  const [scopeDraft, setScopeDraft] = useState([])
  const [confirmStatus, setConfirmStatus] = useState(null) // which change to confirm
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (authority) {
      setStatusDraft(authority.status)
      setScopeDraft(authority.categoryScope)
    }
  }, [authority])

  if (isLoading) return <Spinner className="justify-center py-16" label="Loading authority…" />
  if (isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-status-critical" role="alert">{error.message}</p>
      </Card>
    )
  }
  if (!authority) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ink-muted">Authority not found.</p>
        <Link to="/admin/authorities" className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to authorities
        </Link>
      </Card>
    )
  }

  const applyScope = async () => {
    setSaveError(null)
    setSaved(false)
    try {
      await update.mutateAsync({ categoryScope: scopeDraft })
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const confirmStatusChange = async () => {
    setSaveError(null)
    setSaved(false)
    setConfirmStatus(null)
    try {
      await update.mutateAsync({ status: statusDraft })
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  const toggleScope = (slug) => {
    setScopeDraft((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/authorities"
            className="flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Authorities
          </Link>
          <h1 className="text-lg font-semibold text-ink">{authority.email}</h1>
        </div>
        <StatusBadge
          tone={STATUS_TONES[authority.status] ?? 'neutral'}
          label={STATUS_LABELS[authority.status] ?? authority.status}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account status" subtitle="Suspend to freeze, or deprovision to retire." />
          <CardBody>
            <select
              aria-label="Account status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-sm focus:border-primary"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {statusDraft !== authority.status && (
              <Button
                className="mt-3 w-full"
                variant={statusDraft === 'suspended' || statusDraft === 'deprovisioned' ? 'danger' : 'primary'}
                onClick={() => setConfirmStatus(statusDraft)}
              >
                Apply status change
              </Button>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Created {formatDate(authority.dateJoined)}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Category scope (BR-26)
              </span>
            }
            subtitle="An empty scope grants nothing until it is set."
          />
          <CardBody>
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
                      checked={scopeDraft.includes(c.key)}
                      onChange={() => toggleScope(c.key)}
                      className="h-4 w-4 accent-primary"
                    />
                    {c.label.en}
                  </label>
                ))}
            </div>
            {JSON.stringify(scopeDraft) !== JSON.stringify(authority.categoryScope) && (
              <Button className="mt-3 w-full" onClick={applyScope} loading={update.isPending}>
                Save scope
              </Button>
            )}
          </CardBody>
        </Card>
      </div>

      {saveError && (
        <Card className="mt-5 p-4">
          <p className="text-sm text-status-critical" role="alert">{saveError}</p>
        </Card>
      )}
      {saved && (
        <Card className="mt-5 p-4 border-status-resolved/40">
          <p className="text-sm text-status-resolved" role="status">Changes saved and recorded to the audit log.</p>
        </Card>
      )}

      <Dialog
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        title="Confirm status change"
      >
        <p className="text-sm text-ink-muted">
          Set this authority to{' '}
          <strong>{STATUS_LABELS[confirmStatus] ?? confirmStatus}</strong>?{' '}
          {confirmStatus === 'deprovisioned'
            ? 'This revokes the account and its active sessions.'
            : confirmStatus === 'suspended'
              ? 'The account keeps its role and scope but cannot act until reactivated.'
              : ''}
          The change is audited.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmStatus(null)}>Cancel</Button>
          <Button
            variant={confirmStatus === 'active' ? 'primary' : 'danger'}
            loading={update.isPending}
            onClick={confirmStatusChange}
          >
            Confirm
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
