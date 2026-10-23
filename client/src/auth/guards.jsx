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

/** Narrows an authenticated area to one or more allowed roles. */
export function RequireRole({ role }) {
  const { user } = useAuth()
  const location = useLocation()
  const allowed = Array.isArray(role) ? role : [role]
  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
  }
  if (!allowed.includes(user.role)) {
    // If a guest explorer attempts to access authority/admin restricted area,
    // prompt them to log in with an authorized account instead of hitting 403
    if (user.isGuest) {
      return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />
    }
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
