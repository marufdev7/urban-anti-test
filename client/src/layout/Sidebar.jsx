import { NavLink, useLocation } from 'react-router-dom'
import {
  ClipboardList,
  FileText,
  Flag,
  LayoutDashboard,
  Map,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useIssues } from '../hooks/issues'

// Role-tailored navigation (FRONT-PLAN.md §10.4).
const NAV_BY_ROLE = {
  citizen: [
    { to: '/citizen/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/citizen/queue', label: 'Queue', icon: ClipboardList },
    { to: '/citizen/map', label: 'Map', icon: Map },
    { to: '/citizen/reports', label: 'Reports', icon: FileText },
  ],
  authority: [
    { to: '/authority/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/authority/queue', label: 'Work Queue', icon: ClipboardList },
    { to: '/authority/my-issues', label: 'My Issues', icon: UserCheck, badgeKey: 'myIssues' },
    { to: '/authority/reports', label: 'Raw Reports', icon: FileText },
    { to: '/authority/map', label: 'Jurisdiction Map', icon: Map },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Analytics', icon: LayoutDashboard },
    { to: '/admin/queue', label: 'Moderation', icon: Flag },
    { to: '/admin/reports', label: 'Raw Reports', icon: FileText },
    { to: '/admin/map', label: 'Municipal Map', icon: Map },
    { to: '/admin/authorities', label: 'Authorities', icon: Users },
    { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
  ],
}

export const ROLE_LABELS = {
  citizen: 'Citizen',
  authority: 'Authority',
  admin: 'Admin',
}

export default function Sidebar({ onNavigate }) {
  const { user } = useAuth()
  const location = useLocation()
  const items = NAV_BY_ROLE[user?.role] ?? []

  // Live badge for Authority assigned issues
  const isAuthority = user?.role === 'authority'
  const { data: myIssuesData } = useIssues(
    { assignedTo: 'me' },
    { enabled: isAuthority, refetchInterval: 15_000 },
  )
  const myAssignedCount = myIssuesData?.data?.length ?? 0

  const handleNavigate = () => {
    onNavigate?.()
  }

  const isItemActive = (to, navIsActive) => {
    if (to === '/authority/my-issues') {
      return location.pathname === '/authority/my-issues' || location.search.includes('assignedTo=me')
    }
    if (to === '/authority/queue') {
      return location.pathname === '/authority/queue' && !location.search.includes('assignedTo=me')
    }
    return navIsActive
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-surface-panel shadow-menu lg:w-60 lg:shadow-none">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
          <div>
            <p className="text-base font-bold leading-tight text-ink">UrbanMend</p>
            <p className="text-xs text-ink-muted">Public Safety Triage</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleNavigate}
          aria-label="Close navigation menu"
          className="rounded-panel p-1.5 text-ink-muted hover:bg-surface-sunken lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Primary">
        {items.map(({ to, label, icon: Icon, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleNavigate}
            className={({ isActive }) => {
              const active = isItemActive(to, isActive)
              return `flex items-center justify-between gap-3 rounded-panel px-3 py-2 text-sm font-medium transition-colors
               ${active
                 ? 'border-r-[3px] border-primary bg-primary-soft/50 font-semibold text-primary rounded-r-none'
                 : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'}`
            }}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </div>
            {badgeKey === 'myIssues' && myAssignedCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                {myAssignedCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Settings at the bottom (matching citizen-dashboard.png) */}
      <div className="border-t border-line px-3 py-3">
        <NavLink
          to={`/${user?.role}/settings`}
          onClick={handleNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-panel px-3 py-2 text-sm font-medium transition-colors
             ${isActive
               ? 'border-r-[3px] border-primary bg-primary-soft/50 font-semibold text-primary rounded-r-none'
               : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'}`
          }
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
