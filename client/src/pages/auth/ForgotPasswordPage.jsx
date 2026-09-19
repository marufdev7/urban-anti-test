import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

/**
 * POST /auth/password/forgot — response is always 202 with a generic message
 * (no account enumeration), so the UI just confirms the request was accepted.
 * In local dev the reset mail goes to the api container's console output.
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { identifier } })
      setSent(true)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Please wait a moment and retry.'
          : err instanceof ApiError && err.status === 0
            ? 'Cannot reach the server. Check your connection and try again.'
            : 'Could not process the request. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <ShieldCheck className="h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="mt-2 text-xl font-bold text-ink">UrbanMend</h1>
          <p className="text-sm text-ink-muted">Public Safety Triage</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-6 shadow-panel">
          {sent ? (
            <>
              <h2 className="mb-2 text-base font-semibold text-ink">Check your email</h2>
              <p className="text-sm text-ink-muted">
                If an active account with a verified email matches, a password reset link is on its
                way.
              </p>
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <h2 className="mb-1 text-base font-semibold text-ink">Reset your password</h2>
              <p className="mb-4 text-sm text-ink-muted">
                Enter the email address or phone number for your account.
              </p>
              <Input
                label="Email or phone"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mb-4"
              />
              {error && (
                <p className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" loading={busy} className="w-full">
                Send reset link
              </Button>
            </form>
          )}
          <p className="mt-3 text-center text-sm">
            <Link to="/auth/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
