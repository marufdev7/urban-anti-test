import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, KeyRound, QrCode, Shield, ShieldCheck, User } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { categoryLabel, useCategories } from '../../hooks/data'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

export default function AuthoritySettingsPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const queryClient = useQueryClient()

  // Profile Form state
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)

  useEffect(() => {
    if (user) {
      setPreferredLanguage(user.preferredLanguage ?? 'en')
    }
  }, [user])

  const updateProfile = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session'], updated)
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Authority Profile &amp; Security"
        subtitle="Manage personal preferences, operational scope, and security settings."
      />

      {/* Profile & Category Scope Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" aria-hidden="true" />
              Operational Personnel Profile
            </span>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Email
              </p>
              <p className="mt-1 font-medium text-ink">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Assigned Role &amp; Status
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                <span className="font-semibold text-primary capitalize">{user?.role}</span>
                <span className="rounded bg-status-resolved-soft px-1.5 py-0.5 text-xs font-semibold text-status-resolved capitalize">
                  {user?.status ?? 'active'}
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-panel border border-line bg-surface-sunken p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Assigned Category Scope
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              You are authorized to triage, assign, and resolve issues within these categories:
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {user?.categoryScope?.length ? (
                user.categoryScope.map((slug) => (
                  <span
                    key={slug}
                    className="rounded bg-primary-soft px-2 py-1 text-xs font-semibold text-primary"
                  >
                    {categoryLabel(categories, slug)}
                  </span>
                ))
              ) : (
                <span className="text-xs italic text-ink-faint">
                  Unscoped — contact an administrator to grant category access.
                </span>
              )}
            </div>
          </div>

          <hr className="border-line" />

          {/* Regional preferences form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateProfile.mutate({ preferredLanguage })
            }}
            className="flex flex-wrap items-end gap-3 pt-1"
          >
            <div className="w-64">
              <label htmlFor="auth-lang" className="block text-xs font-medium text-ink">
                Preferred Interface Language
              </label>
              <Select
                id="auth-lang"
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
              Two-Factor Authentication (2FA)
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            Two-factor authentication adds an extra layer of security to municipal operator accounts using standard TOTP authenticator apps (Google Authenticator, Authy, etc.).
          </p>

          <div className="pt-2">
            <Button
              variant="secondary"
              onClick={() => enroll2FA.mutate()}
              disabled={enroll2FA.isPending}
            >
              {enroll2FA.isPending ? <Spinner size="sm" /> : 'Enroll / Re-Enroll 2FA Device'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Notification Preferences Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
              Operational Notification Preferences
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
                    Show instant alerts when new critical reports arrive or assignments change.
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
                  <p className="text-sm font-medium text-ink">Email Notifications</p>
                  <p className="text-xs text-ink-muted">
                    Send dispatch summaries and urgent escalations to your verified email.
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
        title="Enroll Two-Factor Authenticator"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p>
            Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, or Bitwarden):
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
            <label htmlFor="totp-input" className="block font-medium text-ink">
              Enter the 6-digit code from your app to verify:
            </label>
            <Input
              id="totp-input"
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
    </div>
  )
}
