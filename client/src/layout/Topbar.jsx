import { Menu, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import { useAuth } from '../auth/AuthContext'

// Where Enter in the global search lands per role — the page with the real
// search box for that workspace.
const SEARCH_PAGE = {
  citizen: '/citizen/reports',
  authority: '/authority/queue',
  admin: '/admin/queue',
}

/**
 * Top bar: mobile menu button, global search, notification bell, user menu.
 * Search jumps to the role's searchable list with query param.
 */
export default function Topbar({ onMenuClick }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const onSearch = (event) => {
    if (event.key !== 'Enter') return
    const query = event.currentTarget.value.trim()
    const target = SEARCH_PAGE[user?.role]
    if (target) {
      navigate(query ? `${target}?q=${encodeURIComponent(query)}` : target)
    }
  }

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface-panel px-4 py-3 sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="rounded-panel p-2 text-ink-muted hover:bg-surface-sunken lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Search reports, IDs, or locations…"
          aria-label="Search reports, IDs, or locations"
          onKeyDown={onSearch}
          className="w-full rounded-panel border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-primary"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
