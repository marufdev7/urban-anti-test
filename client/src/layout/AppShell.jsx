import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

/**
 * Shared authenticated shell (FRONTEND_PLAN §1 / §7).
 * - Desktop (≥lg): persistent fixed sidebar + content column.
 * - Tablet/mobile: sidebar hidden off-canvas, revealed by the Topbar menu
 *   button as a drawer with a dimmed backdrop (FRONTEND_PLAN §7 "Sidebar
 *   becomes a drawer").
 * - Keyboard: skip-to-content link, Escape closes the drawer.
 */
export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!navOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  return (
    <div className="flex h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-panel focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      {/* Mobile/tablet backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar: drawer on <lg, static on ≥lg */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setNavOpen((v) => !v)} />
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
        <footer className="flex flex-col gap-2 border-t border-line bg-surface-panel px-6 py-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 UrbanMend Resilience Initiative</p>
          <nav className="flex items-center gap-5" aria-label="Footer">
            <a href="#privacy" className="hover:text-ink">Privacy Policy</a>
            <a href="#terms" className="hover:text-ink">Terms of Service</a>
            <a href="#support" className="hover:text-ink">Contact Support</a>
          </nav>
        </footer>
      </div>
    </div>
  )
}
