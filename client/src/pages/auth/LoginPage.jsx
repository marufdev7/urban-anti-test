import { useState, useEffect, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Compass,
  KeyRound,
  LogIn,
  Mail,
  Phone,
  RotateCw,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react'
import { useAuth, ROLE_HOME } from '../../auth/AuthContext'
import { ApiError } from '../../lib/api'
import {
  signInWithGoogle,
  registerWithFirebaseEmail,
  loginWithFirebaseEmail,
  resendVerificationEmail,
  reloadFirebaseUser,
  initRecaptcha,
  sendFirebasePhoneOtp,
} from '../../lib/firebase'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

function formatAuthError(error) {
  if (!error) return 'Operation failed. Please try again.'
  if (typeof error === 'string') return error

  // Firebase Auth Error Codes
  const code = error.code || ''
  if (code === 'auth/email-already-in-use') {
    return 'This email address is already registered. Please sign in instead.'
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.'
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 8 characters.'
  }
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential'
  ) {
    return 'Incorrect email/phone or password. Please check your credentials.'
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Invalid phone number format. Please enter e.g. 01712345678 or +8801712345678.'
  }
  if (code === 'auth/invalid-verification-code') {
    return 'Incorrect SMS verification code. Please check and try again.'
  }
  if (code === 'auth/code-expired') {
    return 'The SMS verification code has expired. Please request a new one.'
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (code === 'auth/billing-not-enabled') {
    return 'Firebase SMS Authentication requires Google Cloud Billing (Blaze Plan) or Test Phone Numbers. For free local testing, please use Email Verification or add your number under "Phone numbers for testing" in Firebase Console.'
  }
  if (code === 'auth/captcha-check-failed') {
    return 'Security verification failed. Please refresh the page and try again.'
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase Auth. Please verify Firebase authorized domains.'
  }

  // Backend ApiError
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Cannot reach server. Check your connection.'
    if (error.status === 401) return error.message || 'Incorrect credentials.'
    if (error.status === 409) return 'Account already exists with this email or phone.'
    if (error.status === 403 && error.code === 'ACCOUNT_LOCKED') {
      return 'This account is temporarily locked. Please try again later.'
    }
  }

  return error.message || 'Authentication failed. Please try again.'
}

export default function LoginPage({ initialMode = 'login' }) {
  const {
    isAuthenticated,
    isLoading,
    user,
    login,
    firebaseLogin,
    verifyTwoFactor,
    completeLogin,
    loginAsGuest,
    updateDisplayName,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Screen modes: 'form' | 'email_verify' | 'phone_otp' | 'two_factor'
  const [authScreen, setAuthScreen] = useState('form')

  // Tab State: activeTab controls button highlight; visibleTab controls mounted form with 150ms animation delay
  const queryMode = new URLSearchParams(location.search).get('mode')
  const startingTab = initialMode === 'register' || queryMode === 'register' ? 'register' : 'login'
  const [activeTab, setActiveTab] = useState(startingTab)
  const [visibleTab, setVisibleTab] = useState(startingTab)
  const [tabFading, setTabFading] = useState(false)

  // Register method sub-tab: 'email' | 'phone'
  const [activeRegMethod, setActiveRegMethod] = useState('email')
  const [visibleRegMethod, setVisibleRegMethod] = useState('email')
  const [regMethodFading, setRegMethodFading] = useState(false)

  // Login form state
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  // Register form state
  const [regFullName, setRegFullName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')

  // Verification states
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingPhone, setPendingPhone] = useState('')
  const [phoneConfirmation, setPhoneConfirmation] = useState(null)
  const [smsCode, setSmsCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // 2FA state
  const [twoFactorCode, setTwoFactorCode] = useState('')

  // UI status
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState(null)
  const [infoNotice, setInfoNotice] = useState(null)

  // Countdown timer for email resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Already signed in with a real account → straight to the role workspace.
  if (!isLoading && isAuthenticated && !user?.isGuest) {
    return <Navigate to={ROLE_HOME[user.role] ?? '/403'} replace />
  }

  const from = location.state?.from

  const targetFor = (targetUser) => {
    const home = ROLE_HOME[targetUser.role] ?? '/403'
    return from?.startsWith(`/${targetUser.role}/`) ? from : home
  }

  // Smooth Tab Switch Handler with animation delay
  const handleTabChange = (newTab) => {
    if (newTab === activeTab) return
    setActiveTab(newTab)
    setError(null)
    setInfoNotice(null)
    setTabFading(true)
    setTimeout(() => {
      setVisibleTab(newTab)
      setTabFading(false)
    }, 150)
  }

  // Smooth Sub-Tab Switch Handler for Register Verification Method (Email vs Phone)
  const handleRegMethodChange = (newMethod) => {
    if (newMethod === activeRegMethod) return
    setActiveRegMethod(newMethod)
    setError(null)
    setRegMethodFading(true)
    setTimeout(() => {
      setVisibleRegMethod(newMethod)
      setRegMethodFading(false)
    }, 150)
  }

  // ── GOOGLE SIGN IN / SIGN UP ──
  const onGoogleSubmit = async () => {
    setError(null)
    setInfoNotice(null)
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
        setAuthScreen('two_factor')
        return
      }
      await completeLogin(result.user, profile)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      const msg = formatAuthError(err)
      if (msg) setError(msg)
    } finally {
      setIsGoogleLoading(false)
    }
  }

  // ── SIGN IN SUBMIT (EMAIL OR USERNAME) ──
  const onPasswordSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setInfoNotice(null)
    setIsSubmitting(true)

    const trimmed = identifier.trim()
    const isEmail = trimmed.includes('@')

    try {
      // 1. If it's an email address, try Firebase Email login first
      if (isEmail) {
        try {
          const fbUser = await loginWithFirebaseEmail(trimmed.toLowerCase(), password)
          if (!fbUser.emailVerified) {
            // Must verify email before accessing!
            setPendingEmail(fbUser.email)
            setAuthScreen('email_verify')
            setResendCooldown(30)
            setInfoNotice('Please verify your email address to continue.')
            setIsSubmitting(false)
            return
          }
          const idToken = await fbUser.getIdToken()
          const profile = {
            fullName: fbUser.displayName || '',
            photoUrl: fbUser.photoURL || '',
            email: fbUser.email || '',
          }
          const result = await firebaseLogin.mutateAsync({ idToken })
          if (result?.requires2fa) {
            setAuthScreen('two_factor')
            setIsSubmitting(false)
            return
          }
          await completeLogin(result.user, profile)
          navigate(targetFor(result.user), { replace: true })
          return
        } catch (fbErr) {
          // If not in Firebase (e.g. seeded test admin/authority), fall through to backend credentials
          if (
            fbErr.code !== 'auth/user-not-found' &&
            fbErr.code !== 'auth/invalid-credential' &&
            fbErr.code !== 'auth/wrong-password'
          ) {
            throw fbErr
          }
        }
      }

      // 2. Fallback to Django backend credentials login (authorities, admin@urbanmend.test, etc.)
      const result = await login.mutateAsync({ identifier: trimmed, password })
      if (result?.requires2fa) {
        setAuthScreen('two_factor')
        return
      }
      await completeLogin(result.user)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── REGISTER WITH EMAIL (FIREBASE VERIFICATION REQUIRED) ──
  const onRegisterEmailSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setInfoNotice(null)

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      // Create Firebase account & send email verification link
      const email = regEmail.trim().toLowerCase()
      await registerWithFirebaseEmail(email, regPassword, regFullName.trim())
      setPendingEmail(email)
      setAuthScreen('email_verify')
      setResendCooldown(30)
      setInfoNotice('Verification email sent! Check your inbox to activate your account.')
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── CHECK IF EMAIL HAS BEEN VERIFIED ──
  const onCheckEmailVerified = async () => {
    setError(null)
    setInfoNotice(null)
    setIsSubmitting(true)
    try {
      const refreshedUser = await reloadFirebaseUser()
      if (refreshedUser && refreshedUser.emailVerified) {
        const idToken = await refreshedUser.getIdToken(true)
        const profile = {
          fullName: refreshedUser.displayName || regFullName || '',
          photoUrl: '',
          email: refreshedUser.email || '',
        }
        const result = await firebaseLogin.mutateAsync({ idToken })
        if (result?.requires2fa) {
          setAuthScreen('two_factor')
          return
        }
        await completeLogin(result.user, profile)
        navigate(targetFor(result.user), { replace: true })
      } else {
        setError(
          'Email not yet verified. Please open the link in your verification email, then click "I Have Verified" again.'
        )
      }
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setIsCheckingVerification(false)
    }
  }

  // ── RESEND EMAIL VERIFICATION ──
  const onResendEmail = async () => {
    setError(null)
    try {
      await resendVerificationEmail()
      setResendCooldown(30)
      setInfoNotice('A fresh verification link has been sent to your email.')
    } catch (err) {
      setError(formatAuthError(err))
    }
  }

  // ── REGISTER / SIGN IN WITH PHONE (FIREBASE SMS OTP) ──
  const onSendPhoneOtp = async (event) => {
    event.preventDefault()
    setError(null)
    setInfoNotice(null)

    const raw = regPhone.trim().replace(/[\s-]/g, '')
    if (!raw) {
      setError('Please enter a valid phone number.')
      return
    }

    // Format phone to E.164 (Bangladesh +880 default if local 017...)
    let formatted = raw
    if (formatted.startsWith('01')) {
      formatted = '+88' + formatted
    } else if (formatted.startsWith('880')) {
      formatted = '+' + formatted
    } else if (!formatted.startsWith('+')) {
      formatted = '+88' + formatted
    }

    setIsSubmitting(true)
    try {
      const verifier = initRecaptcha('recaptcha-container')
      const confirmation = await sendFirebasePhoneOtp(formatted, verifier)
      setPhoneConfirmation(confirmation)
      setPendingPhone(formatted)
      setAuthScreen('phone_otp')
      setInfoNotice(`Verification code sent to ${formatted}`)
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── VERIFY PHONE SMS OTP CODE ──
  const onVerifyPhoneOtp = async (event) => {
    event.preventDefault()
    setError(null)
    setInfoNotice(null)

    if (!smsCode || smsCode.length < 6) {
      setError('Please enter the 6-digit code received via SMS.')
      return
    }

    setIsSubmitting(true)
    try {
      if (!phoneConfirmation) {
        throw new Error('Verification session expired. Please request a new code.')
      }
      const cred = await phoneConfirmation.confirm(smsCode.trim())
      const idToken = await cred.user.getIdToken()
      const profile = {
        fullName: cred.user.displayName || regFullName || '',
        photoUrl: '',
        email: cred.user.email || '',
      }
      const result = await firebaseLogin.mutateAsync({ idToken })
      if (result?.requires2fa) {
        setAuthScreen('two_factor')
        return
      }
      await completeLogin(result.user, profile)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── GUEST EXPLORER ──
  const onGuestSubmit = () => {
    loginAsGuest()
    navigate('/citizen/dashboard', { replace: true })
  }

  // ── DJANGO 2FA ──
  const onTwoFactorSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    try {
      const result = await verifyTwoFactor.mutateAsync(twoFactorCode)
      await completeLogin(result.user)
      navigate(targetFor(result.user), { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? 'Invalid or expired security code.'
          : err.message ?? 'Verification failed.'
      )
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      {/* Invisible reCAPTCHA container for Phone Auth */}
      <div id="recaptcha-container"></div>

      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-ink">UrbanMend</h1>
          <p className="text-xs text-ink-muted">Civic Infrastructure &amp; Public Safety</p>
        </div>

        {/* Card Container */}
        <div className="rounded-panel border border-line bg-surface-panel p-6 shadow-panel">
          {authScreen === 'form' ? (
            <div>
              {/* Tab Selector: Sign In vs Register with smooth highlight & animation trigger */}
              <div className="relative mb-5 flex rounded-lg bg-surface-sunken p-1 border border-line">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all duration-200 ${
                    activeTab === 'login'
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <LogIn
                    className={`h-3.5 w-3.5 transition-colors ${
                      activeTab === 'login' ? 'text-primary' : 'text-ink-muted'
                    }`}
                  />
                  <span>Sign In (লগইন)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('register')}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all duration-200 ${
                    activeTab === 'register'
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <UserPlus
                    className={`h-3.5 w-3.5 transition-colors ${
                      activeTab === 'register' ? 'text-primary' : 'text-ink-muted'
                    }`}
                  />
                  <span>Register (নিবন্ধন)</span>
                </button>
              </div>

              {/* Form Content Wrapper with buttery smooth fade/slide transition */}
              <div
                className={`transition-all duration-150 ease-out transform ${
                  tabFading
                    ? 'opacity-0 scale-[0.98] -translate-y-1'
                    : 'opacity-100 scale-100 translate-y-0'
                }`}
              >
                {visibleTab === 'login' ? (
                  /* ─── 1. SIGN IN FORM ─── */
                  <div>
                    <h2 className="mb-3 text-base font-semibold text-ink">Sign in to your account</h2>

                    {/* Google 1-Click Auth */}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onGoogleSubmit}
                      loading={isGoogleLoading}
                      disabled={isSubmitting}
                      className="w-full justify-center gap-2 border-line bg-surface hover:bg-surface-sunken text-ink font-medium shadow-xs"
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

                    <form onSubmit={onPasswordSubmit}>
                      <Input
                        label="Email or username"
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
                          className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical"
                          role="alert"
                        >
                          {error}
                        </p>
                      )}

                      <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isGoogleLoading}
                        className="w-full"
                      >
                        Sign in (লগইন)
                      </Button>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <Link
                          to="/auth/forgot-password"
                          className="text-ink-muted hover:text-ink hover:underline"
                        >
                          Forgot password?
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleTabChange('register')}
                          className="font-semibold text-primary hover:underline"
                        >
                          Need an account? Register
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  /* ─── 2. REGISTER CITIZEN FORM ─── */
                  <div>
                    <h2 className="mb-1 text-base font-semibold text-ink">Register as Citizen</h2>
                    <p className="mb-3 text-xs text-ink-muted">
                      Verification required before accessing citizen submission.
                    </p>

                    {/* Google 1-Click Signup */}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onGoogleSubmit}
                      loading={isGoogleLoading}
                      disabled={isSubmitting}
                      className="w-full justify-center gap-2 border-line bg-surface hover:bg-surface-sunken text-ink font-medium shadow-xs mb-4"
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
                      <span>Sign up with Google (Instant Verified)</span>
                    </Button>

                    <div className="relative my-3 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-line" />
                      </div>
                      <div className="relative bg-surface-panel px-2 text-[11px] uppercase tracking-wider text-ink-muted font-medium">
                        Or choose verification channel
                      </div>
                    </div>

                    {/* Verification Method Sub-Toggle: Email vs Phone */}
                    <div className="mb-3.5 grid grid-cols-2 gap-1.5 rounded-md bg-surface-sunken p-1 border border-line">
                      <button
                        type="button"
                        onClick={() => handleRegMethodChange('email')}
                        className={`flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-all duration-200 ${
                          activeRegMethod === 'email'
                            ? 'bg-surface text-ink shadow-xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        <Mail
                          className={`h-3.5 w-3.5 transition-colors ${
                            activeRegMethod === 'email' ? 'text-primary' : 'text-ink-muted'
                          }`}
                        />
                        <span>Email Verification</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegMethodChange('phone')}
                        className={`flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-all duration-200 ${
                          activeRegMethod === 'phone'
                            ? 'bg-surface text-ink shadow-xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        <Smartphone
                          className={`h-3.5 w-3.5 transition-colors ${
                            activeRegMethod === 'phone' ? 'text-primary' : 'text-ink-muted'
                          }`}
                        />
                        <span>Phone SMS OTP</span>
                      </button>
                    </div>

                    {/* Sub-Form Container with smooth fade/slide transition */}
                    <div
                      className={`transition-all duration-150 ease-out transform ${
                        regMethodFading
                          ? 'opacity-0 scale-[0.98] -translate-y-1'
                          : 'opacity-100 scale-100 translate-y-0'
                      }`}
                    >
                      {visibleRegMethod === 'email' ? (
                        /* Sub-Form: Email Registration with Link Verification */
                        <form onSubmit={onRegisterEmailSubmit}>
                          <Input
                            label="Full Name (optional)"
                            type="text"
                            placeholder="e.g. Rahim Ahmed"
                            value={regFullName}
                            onChange={(e) => setRegFullName(e.target.value)}
                            className="mb-2.5"
                          />
                          <Input
                            label="Email Address"
                            type="email"
                            placeholder="name@example.com"
                            required
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            className="mb-2.5"
                          />
                          <Input
                            label="Password (min 8 characters)"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            className="mb-2.5"
                          />
                          <Input
                            label="Confirm Password"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            className="mb-3"
                          />

                          {error && (
                            <p
                              className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical"
                              role="alert"
                            >
                              {error}
                            </p>
                          )}

                          <Button
                            type="submit"
                            loading={isSubmitting}
                            disabled={isGoogleLoading}
                            className="w-full"
                          >
                            Send Verification Link (নিবন্ধন করুন)
                          </Button>
                        </form>
                      ) : (
                        /* Sub-Form: Phone SMS Registration with OTP Verification */
                        <form onSubmit={onSendPhoneOtp}>
                          <Input
                            label="Full Name (optional)"
                            type="text"
                            placeholder="e.g. Rahim Ahmed"
                            value={regFullName}
                            onChange={(e) => setRegFullName(e.target.value)}
                            className="mb-2.5"
                          />
                          <Input
                            label="Mobile Phone Number"
                            type="tel"
                            placeholder="017XXXXXXXX or +8801..."
                            required
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            className="mb-3"
                          />
                          <p className="mb-3 text-[11px] text-ink-muted">
                            A 6-digit OTP code will be sent to your mobile phone via SMS.
                          </p>

                          {error && (
                            <p
                              className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical"
                              role="alert"
                            >
                              {error}
                            </p>
                          )}

                          <Button
                            type="submit"
                            loading={isSubmitting}
                            disabled={isGoogleLoading}
                            className="w-full"
                          >
                            Send SMS OTP Code (ওটিপি পাঠান)
                          </Button>
                        </form>
                      )}
                    </div>

                    <div className="mt-3 text-center text-xs">
                      <span className="text-ink-muted">Already registered? </span>
                      <button
                        type="button"
                        onClick={() => handleTabChange('login')}
                        className="font-semibold text-primary hover:underline"
                      >
                        Sign in (লগইন)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Guest Explorer Option */}
              <div className="relative my-4 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-line" />
                </div>
                <div className="relative bg-surface-panel px-2 text-[11px] uppercase tracking-wider text-ink-muted font-medium">
                  Or explore first
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={onGuestSubmit}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full justify-center gap-2 border-line bg-surface hover:bg-surface-sunken text-ink font-medium shadow-xs"
              >
                <Compass className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <span>Continue as Guest (অতিথি হিসেবে দেখুন)</span>
              </Button>
            </div>
          ) : authScreen === 'email_verify' ? (
            /* ─── 3. EMAIL VERIFICATION WAITING SCREEN ─── */
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-7 w-7 animate-pulse" />
              </div>

              <div>
                <h2 className="text-base font-bold text-ink">Verify Your Email Address</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  A verification email has been sent to:
                </p>
                <div className="mt-1.5 inline-block rounded-md bg-surface-sunken px-2.5 py-1 font-mono text-xs font-semibold text-ink border border-line">
                  {pendingEmail}
                </div>
              </div>

              <p className="text-xs text-ink-muted leading-relaxed">
                অনুগ্রহ করে আপনার ইমেইল ইনবক্স (বা স্প্যাম ফোল্ডার) চেক করে ভেরিফিকেশন লিঙ্কে ক্লিক করুন। এরপর নিচের বাটনে ক্লিক করুন।
              </p>

              {infoNotice && (
                <p className="rounded-panel border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary font-medium">
                  {infoNotice}
                </p>
              )}

              {error && (
                <p className="rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  onClick={onCheckEmailVerified}
                  loading={isSubmitting}
                  className="w-full justify-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>I Have Verified (আমি ভেরিফাই করেছি)</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={onResendEmail}
                  disabled={resendCooldown > 0}
                  className="w-full justify-center gap-1.5 text-xs"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                  <span>
                    Resend Email {resendCooldown > 0 ? `(${resendCooldown}s)` : '(পুনরায় পাঠান)'}
                  </span>
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthScreen('form')
                    setError(null)
                    setInfoNotice(null)
                  }}
                  className="mt-2 text-xs text-ink-muted hover:text-ink hover:underline"
                >
                  Change Email / Back to Form
                </button>
              </div>
            </div>
          ) : authScreen === 'phone_otp' ? (
            /* ─── 4. PHONE SMS OTP SCREEN ─── */
            <form onSubmit={onVerifyPhoneOtp} className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Smartphone className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-base font-bold text-ink">Enter SMS Verification Code</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  We sent a 6-digit code to:
                </p>
                <div className="mt-1.5 inline-block rounded-md bg-surface-sunken px-2.5 py-1 font-mono text-xs font-semibold text-ink border border-line">
                  {pendingPhone}
                </div>
              </div>

              <div className="text-left">
                <Input
                  label="6-Digit SMS Code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  autoFocus
                  required
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>

              {infoNotice && (
                <p className="rounded-panel border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary font-medium">
                  {infoNotice}
                </p>
              )}

              {error && (
                <p className="rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="submit"
                  loading={isSubmitting}
                  className="w-full justify-center"
                >
                  Verify &amp; Continue (যাচাই করুন)
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthScreen('form')
                    setError(null)
                    setInfoNotice(null)
                  }}
                  className="mt-2 text-xs text-ink-muted hover:text-ink hover:underline"
                >
                  Change Phone Number / Back
                </button>
              </div>
            </form>
          ) : (
            /* ─── 5. STAFF TWO-FACTOR VERIFICATION ─── */
            <form onSubmit={onTwoFactorSubmit}>
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-2">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h2 className="text-base font-semibold text-ink">Two-Factor Authentication</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <Input
                label="Security code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                className="mb-4 text-center font-mono text-lg tracking-widest"
              />

              {error && (
                <p
                  className="mb-3 rounded-panel border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <Button type="submit" loading={verifyTwoFactor.isPending} className="w-full">
                Verify Code
              </Button>

              <button
                type="button"
                onClick={() => {
                  setAuthScreen('form')
                  setTwoFactorCode('')
                  setError(null)
                }}
                className="mt-3 w-full text-center text-xs text-primary hover:underline"
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
