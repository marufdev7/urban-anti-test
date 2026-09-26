import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Menu,
  Search,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { shortId, truncate } from '../lib/format'
import { categoryLabel, useCategories } from '../hooks/data'

const SEV_COLORS = {
  critical: 'bg-rose-100 text-rose-800 border-rose-300',
  high: 'bg-orange-100 text-orange-900 border-orange-400',
  medium: 'bg-yellow-100 text-yellow-900 border-yellow-400',
  low: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  triaged: 'Under Review',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

/**
 * Top bar: mobile menu button, interactive global search with live dropdown, notification bell, user menu.
 */
export default function Topbar({ onMenuClick }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { data: categories } = useCategories()

  const urlQuery = searchParams.get('q') || searchParams.get('search') || ''
  const [query, setQuery] = useState(urlQuery)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef(null)

  // Sync with URL query when navigating between pages
  useEffect(() => {
    if (urlQuery !== undefined && urlQuery !== query) {
      setQuery(urlQuery)
    }
  }, [urlQuery])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Live debounced search (250ms)
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await api(`/issues?q=${encodeURIComponent(term)}&limit=6`)
        setResults(res?.data || [])
        setDropdownOpen(true)
      } catch (err) {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [query])

  const handlePerformSearch = (explicitTerm) => {
    const term = (explicitTerm !== undefined ? explicitTerm : query).trim()
    setDropdownOpen(false)

    const isCitizen = user?.role === 'citizen'
    const isAuthority = user?.role === 'authority'
    const isAdmin = user?.role === 'admin'

    let targetPage = '/citizen/queue'
    if (isCitizen) {
      // If currently on My Reports, stay on My Reports; otherwise go to Processing Queue
      if (location.pathname === '/citizen/reports') {
        targetPage = '/citizen/reports'
      } else {
        targetPage = '/citizen/queue'
      }
    } else if (isAuthority) {
      targetPage = '/authority/queue'
    } else if (isAdmin) {
      targetPage = '/admin/queue'
    }

    if (term) {
      navigate(`${targetPage}?q=${encodeURIComponent(term)}`)
    } else {
      navigate(targetPage)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePerformSearch()
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setDropdownOpen(false)

    // Also clear query param if on search pages
    if (location.pathname === '/citizen/queue' || location.pathname === '/citizen/reports') {
      navigate(location.pathname)
    }
  }

  const handleSelectResult = (item) => {
    setDropdownOpen(false)
    if (user?.role === 'authority') {
      navigate(`/authority/queue/${item.id}`)
    } else {
      navigate(`/citizen/reports/${item.id}`)
    }
  }

  return (
    <header className="relative flex items-center gap-3 border-b border-line bg-surface-panel px-4 py-3 sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="rounded-panel p-2 text-ink-muted hover:bg-surface-sunken lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Global Search Bar with Live Spotlight Dropdown */}
      <div ref={containerRef} className="relative min-w-0 flex-1 sm:max-w-lg">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (e.target.value.trim().length >= 2) {
                setDropdownOpen(true)
              }
            }}
            onFocus={() => {
              if (query.trim().length >= 2) {
                setDropdownOpen(true)
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search reports, IDs, or locations…"
            aria-label="Search reports, IDs, or locations"
            className="w-full rounded-panel border border-line bg-surface py-2 pl-9 pr-16 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
          />

          {/* Right icons: Clear button & Enter hint */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {query && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="rounded-full p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => handlePerformSearch()}
              title="Press Enter to search"
              className="hidden sm:inline-flex items-center gap-0.5 rounded border border-line/70 bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted hover:text-ink hover:bg-line/40 transition-colors cursor-pointer"
            >
              <span>↵</span>
            </button>
          </div>
        </div>

        {/* Live Search Results Dropdown */}
        {dropdownOpen && query.trim().length >= 2 && (
          <div className="absolute left-0 top-full mt-1.5 w-full sm:w-[500px] z-50 rounded-panel border border-line bg-surface-panel shadow-xl overflow-hidden backdrop-blur-md">
            {isSearching && results.length === 0 ? (
              <div className="p-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Searching municipal records and locations...</span>
              </div>
            ) : results.length > 0 ? (
              <div>
                <div className="flex items-center justify-between border-b border-line/60 bg-surface-sunken/40 px-3.5 py-2 text-[11px] font-semibold text-ink-muted">
                  <span>Found {results.length} civic issue{results.length === 1 ? '' : 's'}</span>
                  <span className="text-[10px] text-ink-faint">Click to view details</span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-line/40">
                  {results.map((item) => {
                    const catName = categoryLabel(categories, item.primaryCategory)
                    const sev = (item.severity?.current || item.computedSeverity || 'medium').toLowerCase()
                    const sevClass = SEV_COLORS[sev] || SEV_COLORS.medium
                    const statusKey = item.status || 'triaged'
                    const statusLabel = STATUS_LABELS[statusKey] || statusKey.replace('_', ' ')

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-3 hover:bg-primary/5 transition-colors flex items-start gap-3 group cursor-pointer"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-panel bg-surface-sunken border border-line/60 text-primary mt-0.5 group-hover:border-primary/40 group-hover:bg-primary/10 transition-colors">
                          <Wrench className="h-4 w-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xs font-mono font-bold text-primary bg-primary/10 rounded px-1.5 py-0.2">
                              #{shortId(item.id)}
                            </span>
                            <span className="text-xs font-semibold text-ink capitalize truncate">
                              {catName}
                            </span>
                            <span className={`text-[10px] font-bold rounded-full px-2 py-0.2 border capitalize ${sevClass}`}>
                              {sev}
                            </span>
                            <span className="text-[10px] font-medium text-ink-muted ml-auto capitalize">
                              {statusLabel}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-ink/90 line-clamp-1 group-hover:text-primary transition-colors">
                            {truncate(item.description, 70) || `${catName} Incident`}
                          </p>

                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-muted">
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
                              <span className="truncate">
                                {item.representativeLocation?.address || 'Dhaka Sector Area'}
                              </span>
                            </span>
                            {item.corroborationCount > 1 && (
                              <span className="shrink-0 flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded text-[10px]">
                                <Users className="h-3 w-3" />
                                {item.corroborationCount} confirmed
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Footer jump actions */}
                <div className="border-t border-line/60 bg-surface-sunken/60 p-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handlePerformSearch()}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline cursor-pointer"
                  >
                    <span>View all results in Community Issues</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>

                  <span className="text-[10px] text-ink-muted hidden sm:inline">
                    Press <kbd className="font-mono bg-surface border border-line px-1 rounded">↵ Enter</kbd> to search
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 text-center">
                <Search className="h-7 w-7 text-ink-muted/40 mx-auto mb-2" />
                <p className="text-xs font-bold text-ink">
                  No records found matching &quot;{query}&quot;
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Try searching by category, road name, or incident keyword.
                </p>
                <button
                  type="button"
                  onClick={() => handlePerformSearch()}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-panel cursor-pointer"
                >
                  <span>Search all Community Issues</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
