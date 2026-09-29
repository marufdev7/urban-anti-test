import { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS } from './Sidebar'

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const isGuest = Boolean(user?.isGuest)
  const photo = isGuest ? null : (user?.photoUrl || user?.avatarUrl)
  const displayName = isGuest
    ? 'Guest Explorer'
    : (user?.fullName || (user?.role === 'citizen' ? 'Citizen' : ROLE_LABELS[user?.role] ?? 'Account'))

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
        className={`flex items-center gap-2.5 rounded-panel border border-line bg-surface-panel px-3 py-1.5 hover:bg-surface-sunken transition-all duration-150 active:scale-95 ${
          open ? 'ring-2 ring-primary/25 bg-surface-sunken border-primary/40' : ''
        }`}
      >
        <span className="text-xs font-semibold text-ink">
          {displayName}
        </span>
        {photo ? (
          <img
            src={photo}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full object-cover border border-line shadow-xs"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken border border-line text-ink-muted">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        )}
      </button>

      <div
        role="menu"
        aria-hidden={!open}
        className={`absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-panel border border-line bg-surface-panel shadow-menu overflow-hidden profile-dropdown-panel ${
          open ? 'open' : 'closed'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 bg-surface-panel">
          {photo ? (
            <img
              src={photo}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover border border-line shadow-xs"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary font-bold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink leading-tight">{displayName}</p>
            <p className="truncate text-xs text-ink-muted leading-tight mt-0.5">
              {isGuest ? 'Exploring Public Data' : (user?.email || '—')}
            </p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                isGuest
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-surface-sunken text-ink-faint'
              }`}
            >
              {isGuest ? 'Guest (Read-Only)' : (ROLE_LABELS[user?.role] ?? user?.role)}
            </span>
          </div>
        </div>
        {isGuest ? (
          <div className="p-3 bg-surface-sunken/40 text-xs text-ink-muted leading-relaxed">
            You are browsing community issues in read-only mode. Sign in to submit reports and manage your profile.
          </div>
        ) : (
          <>
            <Link
              to={`/${user?.role}/settings?tab=profile`}
              role="menuitem"
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-surface-sunken transition-colors"
            >
              <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              Profile
            </Link>
            <Link
              to={`/${user?.role}/settings`}
              role="menuitem"
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-surface-sunken transition-colors border-t border-line/40"
            >
              <Settings className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              Settings
            </Link>
          </>
        )}
        <button
          type="button"
          role="menuitem"
          tabIndex={open ? 0 : -1}
          disabled={logout.isPending || !open}
          onClick={() => logout.mutate()}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-status-critical hover:bg-status-critical-soft transition-colors disabled:opacity-50 border-t border-line/40"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {logout.isPending ? 'Signing out…' : isGuest ? 'Exit Guest / Sign in' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
