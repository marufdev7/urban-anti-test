import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth, ROLE_HOME } from '../../auth/AuthContext'
import { ApiError } from '../../lib/api'
import { signInWithGoogle } from '../../lib/firebase'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

function loginErrorMessage(error) {
  if (!(error instanceof ApiError)) return error?.message || 'Sign-in failed. Please try again.'
  if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.'
  if (error.status === 401) {
    return error.message && error.message !== 'Invalid credentials.'
      ? error.message
      : 'Incorrect email/phone or password.'
  }
  if (error.status === 403 && error.code === 'ACCOUNT_LOCKED') {
    return 'This account is temporarily locked. Please try again later.'
  }
  if (error.status === 429) return 'Too many attempts. Please wait a moment and retry.'
  if ([502, 503, 504].includes(error.status)) {
    return 'Server is starting up (cold start). Please wait 10-20 seconds and click again.'
  }
  if (error.status === 500) {
    return 'Server encountered an error. Please try again shortly.'
  }
  return error.message || 'Sign-in failed. Please try again.'
}

export default function LoginPage() {
  const { isAuthenticated, isLoading, user, login, firebaseLogin, verifyTwoFactor, completeLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
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

  const onGoogleSubmit = async () => {
    setError(null)
    setIsGoogleLoading(true)
    try {
      const { user: googleUser, idToken } = await signInWithGoogle()
      const profile = {
        fullName: googleUser?.displayName || '',
        photoUrl: googleUser?.photoURL || '',
        email: googleUser?.email || '',
      }
      const result = await firebaseLogin.mutateAsync({ idToken })
      if (result?.requires2fa) {
        setNeedsTwoFactor(true)
        return
      }
      await completeLogin(result.user, profile)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        return
      }
      if (err?.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized in Firebase Auth. Please check Firebase settings.')
        return
      }
      setError(loginErrorMessage(err))
    } finally {
      setIsGoogleLoading(false)
    }
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
            <div>
              <h2 className="mb-4 text-base font-semibold text-ink">Sign in</h2>

              <Button
                type="button"
                variant="secondary"
                onClick={onGoogleSubmit}
                loading={isGoogleLoading || firebaseLogin.isPending}
                disabled={login.isPending}
                className="w-full justify-center gap-2 border-line bg-surface hover:bg-surface-sunken text-ink font-medium shadow-sm"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </Button>

              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative bg-surface-panel px-2 text-xs uppercase text-ink-muted">
                  Or continue with credentials
                </div>
              </div>

              <form onSubmit={onPasswordSubmit} noValidate={false}>
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
                  <p
                    className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-sm text-status-critical"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  loading={login.isPending}
                  disabled={isGoogleLoading || firebaseLogin.isPending}
                  className="w-full"
                >
                  Sign in
                </Button>
                <p className="mt-3 text-center text-sm">
                  <Link to="/auth/forgot-password" className="text-primary hover:underline">
                    Forgot your password?
                  </Link>
                </p>
              </form>
            </div>
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
