import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth, ROLE_HOME } from '../auth/AuthContext'

export default function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 text-center">
      <Compass className="mb-3 h-10 w-10 text-ink-faint" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        The page you requested doesn&apos;t exist or may have been removed.
      </p>
      <Link
        to={user ? ROLE_HOME[user.role] ?? '/' : '/auth/login'}
        className="mt-4 text-sm font-medium text-primary hover:underline"
      >
        Go back
      </Link>
    </div>
  )
}
