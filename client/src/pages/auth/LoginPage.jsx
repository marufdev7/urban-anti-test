import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth, ROLE_HOME } from '../../auth/AuthContext'
import { ApiError } from '../../lib/api'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

function loginErrorMessage(error) {
  if (!(error instanceof ApiError)) return 'Sign-in failed. Please try again.'
  if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.'
  if (error.status === 401) return 'Incorrect email/phone or password.'
  if (error.status === 403 && error.code === 'ACCOUNT_LOCKED') {
    return 'This account is temporarily locked. Please try again later.'
  }
  if (error.status === 429) return 'Too many attempts. Please wait a moment and retry.'
  return error.message
}

export default function LoginPage() {
  const { isAuthenticated, isLoading, user, login, verifyTwoFactor, completeLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false)
  const [error, setError] = useState(null)

  // Already signed in → straight to the role workspace.
  if (!isLoading && isAuthenticated) {
    return <Navigate to={ROLE_HOME[user.role] ?? '/403'} replace />
  }

  const from = location.state?.from

  // Redirect target after login. The saved `from` path belongs to whatever
  // role was (or wasn't) signed in when it was captured — following it
  // blindly lands a citizen who clicked an authority link straight onto the
  // 403 page. Only keep it when it matches the role we just logged in as.
  const targetFor = (user) => {
    const home = ROLE_HOME[user.role] ?? '/403'
    return from?.startsWith(`/${user.role}/`) ? from : home
  }

  const onPasswordSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    try {
      const result = await login.mutateAsync({ identifier, password })
      if (result?.requires2fa) {
        setNeedsTwoFactor(true)
        return
      }
      await completeLogin(result.user)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      setError(loginErrorMessage(err))
    }
  }

  const onTwoFactorSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    try {
      const result = await verifyTwoFactor.mutateAsync(code)
      await completeLogin(result.user)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? 'Invalid or expired security code.'
          : err.message ?? 'Verification failed.',
      )
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <ShieldCheck className="h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="mt-2 text-xl font-bold text-ink">UrbanMend</h1>
          <p className="text-sm text-ink-muted">Public Safety &amp; Review</p>
        </div>

        <div className="rounded-panel border border-line bg-surface-panel p-6 shadow-panel">
          {!needsTwoFactor ? (
            <form onSubmit={onPasswordSubmit} noValidate={false}>
              <h2 className="mb-4 text-base font-semibold text-ink">Sign in</h2>
              <Input
                label="Email or phone"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mb-3"
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-4"
              />
              {error && (
                <p className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" loading={login.isPending} className="w-full">
                Sign in
              </Button>
              <p className="mt-3 text-center text-sm">
                <Link to="/auth/forgot-password" className="text-primary hover:underline">
                  Forgot your password?
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={onTwoFactorSubmit}>
              <h2 className="mb-1 text-base font-semibold text-ink">Two-factor verification</h2>
              <p className="mb-4 text-sm text-ink-muted">
                Enter the 6-digit code from your authenticator app.
              </p>
              <Input
                label="Security code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mb-4"
              />
              {error && (
                <p className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" loading={verifyTwoFactor.isPending} className="w-full">
                Verify
              </Button>
              <button
                type="button"
                onClick={() => {
                  setNeedsTwoFactor(false)
                  setCode('')
                  setError(null)
                }}
                className="mt-3 w-full text-center text-sm text-primary hover:underline"
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-muted">
          © 2026 UrbanMend Resilience Initiative
        </p>
      </div>
    </div>
  )
}
