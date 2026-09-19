import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, ROLE_HOME } from './AuthContext'
import Spinner from '../components/ui/Spinner'

/** Wraps all authenticated routes; anonymous users go to /auth/login. */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Spinner label="Checking your session…" />
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

/** Narrows an authenticated area to a single role. */
export function RequireRole({ role }) {
  const { user } = useAuth()
  if (user.role !== role) {
    return <Navigate to="/403" replace />
  }
  return <Outlet />
}

/** `/` — send each role to its workspace. */
export function RoleHomeRedirect() {
  const { user } = useAuth()
  const target = ROLE_HOME[user?.role]
  return <Navigate to={target ?? '/403'} replace />
}
