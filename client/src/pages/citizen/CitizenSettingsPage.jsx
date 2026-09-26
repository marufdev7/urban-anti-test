import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bell, Check, Globe, ShieldAlert, User } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Dialog from '../../components/ui/Dialog'
import Input from '../../components/ui/Input'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

export default function CitizenSettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Profile Form state
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? 'en')
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState(null)

  useEffect(() => {
    if (user) {
      setPhone(user.phone ?? '')
      setPreferredLanguage(user.preferredLanguage ?? 'en')
    }
  }, [user])

  // Profile update mutation
  const updateProfile = useMutation({
    mutationFn: (body) => api('/users/me', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session'], updated)
      setProfileSuccess(true)
      setProfileError(null)
      setTimeout(() => setProfileSuccess(false), 3000)
    },
    onError: (err) => {
      setProfileError(err.message)
      setProfileSuccess(false)
    },
  })

  const onSaveProfile = (e) => {
    e.preventDefault()
    setProfileError(null)
    const trimmed = phone.trim()
    const payload = {
      preferredLanguage,
    }
    if (trimmed) {
      if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
        setProfileError('Please enter a valid phone number in E.164 format (e.g. +8801712345678).')
        return
      }
      payload.phone = trimmed
    } else if (user?.phone) {
      payload.phone = ''
    }
    updateProfile.mutate(payload)
  }

  // Notification Preferences query & mutation
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

  const onSaveNotifs = (e) => {
    e.preventDefault()
    updateNotif.mutate({ inApp, email: emailNotif })
  }

  // Account Deletion Dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const deleteAccount = useMutation({
    mutationFn: () => api('/users/me', { method: 'DELETE' }),
    onSuccess: async () => {
      await logout.mutateAsync()
      navigate('/auth/login')
    },
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Account Settings"
        subtitle="Manage your profile information, notifications, and privacy preferences."
      />

      {/* Account Details Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" aria-hidden="true" />
              Profile Details
            </span>
          }
        />
        <CardBody className="space-y-4">
          {/* User Photo & Name Display */}
          <div className="flex items-center gap-4 rounded-panel border border-line bg-surface p-4">
            {user?.photoUrl || user?.avatarUrl ? (
              <img
                src={user.photoUrl || user.avatarUrl}
                alt={user?.fullName || 'Profile'}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover border-2 border-primary shadow-sm"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-xl font-bold text-primary border border-primary/20">
                {(user?.fullName || 'C').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-ink">
                {user?.fullName || 'Citizen User'}
              </h3>
              <p className="text-xs text-ink-muted">{user?.email || 'No email provided'}</p>
              {user?.fullName && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-status-resolved-soft px-2 py-0.5 text-[11px] font-medium text-status-resolved">
                  <Check className="h-3 w-3" /> Signed in via Google
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Account ID
              </p>
              <p className="mt-1 font-mono text-sm text-ink">{user?.id ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Email Address
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{user?.email ?? '—'}</span>
                {(user?.verified?.email || user?.fullName) && (
                  <span className="rounded bg-status-resolved-soft px-1.5 py-0.5 text-[11px] font-semibold text-status-resolved">
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>

          <hr className="border-line" />

          {/* Contact & Language Form */}
          <form onSubmit={onSaveProfile} className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold text-ink">Contact &amp; Regional Preferences</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-phone" className="block text-xs font-medium text-ink">
                  Phone Number
                </label>
                <Input
                  id="settings-phone"
                  type="tel"
                  placeholder="+8801XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Changing your phone number will require verification before notifications are sent.
                </p>
              </div>

              <div>
                <label htmlFor="settings-lang" className="block text-xs font-medium text-ink">
                  Preferred Language
                </label>
                <Select
                  id="settings-lang"
                  className="mt-1 w-full"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  options={[
                    { value: 'en', label: 'English (Default)' },
                    { value: 'bn', label: 'বাংলা (Bengali)' },
                  ]}
                />
                <p className="mt-1 text-[11px] text-ink-muted">
                  Sets the language for system messages, notifications, and reports.
                </p>
              </div>
            </div>

            {profileError && (
              <p className="text-xs text-status-critical" role="alert">
                {profileError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? <Spinner size="sm" /> : 'Save Profile Changes'}
              </Button>
              {profileSuccess && (
                <span className="flex items-center gap-1 text-xs font-medium text-status-resolved">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Profile updated successfully
                </span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Notification Preferences Card */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
              Notification Channels
            </span>
          }
        />
        <CardBody>
          <form onSubmit={onSaveNotifs} className="space-y-4">
            <p className="text-xs text-ink-muted">
              Choose which channels you want to receive updates on when your reported issues change status.
            </p>

            <div className="space-y-3 pt-1">
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
                    Show real-time alerts in the top bar notification center.
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
                    Receive email digests when your report is classified, acknowledged, or resolved.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={updateNotif.isPending}>
                {updateNotif.isPending ? <Spinner size="sm" /> : 'Save Notification Settings'}
              </Button>
              {notifSaved && (
                <span className="flex items-center gap-1 text-xs font-medium text-status-resolved">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Notification preferences saved
                </span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Danger Zone: Account Deletion */}
      <Card className="border-status-critical/30">
        <CardHeader
          title={
            <span className="flex items-center gap-2 text-status-critical">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Privacy &amp; Danger Zone
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            Requesting account deletion will immediately sign you out and anonymize your personal identifying information (name, email, phone). Historical reports and safety issues will remain in the public record with author anonymity preserved.
          </p>
          <div>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmText('')
                setDeleteOpen(true)
              }}
            >
              Request Account Deletion
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Account & Anonymize Data?"
      >
        <div className="space-y-3 py-2 text-xs text-ink-muted">
          <p className="leading-relaxed">
            This action is permanent and cannot be undone. All your active sessions will be revoked, and your personal data will be completely detached from any past reports.
          </p>
          <div>
            <label htmlFor="confirm-delete-input" className="block font-medium text-ink">
              Type <span className="font-mono font-bold text-status-critical">DELETE</span> to confirm:
            </label>
            <Input
              id="confirm-delete-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-1 font-mono"
            />
          </div>
          {deleteAccount.isError && (
            <p className="text-xs text-status-critical">
              {deleteAccount.error.message}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteConfirmText !== 'DELETE' || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? <Spinner size="sm" /> : 'Confirm Deletion'}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
