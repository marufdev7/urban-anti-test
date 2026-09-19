import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth, ROLE_HOME } from '../auth/AuthContext'

export default function ForbiddenPage() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 text-center">
      <ShieldAlert className="mb-3 h-10 w-10 text-status-critical" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-ink">Access not permitted</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        You don&apos;t have permission to view this page. If you believe this is a mistake, contact an
        administrator.
      </p>
      {user && (
        <Link
          to={ROLE_HOME[user.role] ?? '/'}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Go to your dashboard
        </Link>
      )}
    </div>
  )
}
