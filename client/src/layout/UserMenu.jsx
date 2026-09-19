import { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from './Sidebar'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-panel border border-line bg-surface-panel px-3 py-1.5 hover:bg-surface-sunken"
      >
        <span className="text-xs font-semibold text-ink">
          {user?.fullName || (user?.role === 'citizen' ? 'A. Citizen' : ROLE_LABELS[user?.role] ?? 'Account')}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken border border-line text-ink-muted">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-panel border border-line bg-surface-panel shadow-menu"
        >
          <p className="truncate border-b border-line px-4 py-2.5 text-xs text-ink-muted">
            {user?.email}
          </p>
          <Link
            to={`/${user?.role}/settings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-surface-sunken"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-status-critical hover:bg-status-critical-soft disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
