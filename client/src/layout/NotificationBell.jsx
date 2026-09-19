import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, ExternalLink, Info } from 'lucide-react'
import { api } from '../lib/api'
import { timeAgo } from '../lib/format'
import { useAuth } from '../auth/AuthContext'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [toastNotification, setToastNotification] = useState(null)
  const menuRef = useRef(null)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Fetch recent notifications
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications?limit=15'),
    refetchInterval: 10_000,
  })

  const notifications = data?.data ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  // Track seen notifications across SSE reconnects to prevent duplicate alerts/refetches
  const seenNotificationIds = useRef(new Set())

  useEffect(() => {
    if (notifications.length > 0) {
      notifications.forEach((n) => seenNotificationIds.current.add(n.id))
    }
  }, [notifications])

  // Real-time notifications SSE stream (API §6.10, FRONT-PLAN.md §8)
  useEffect(() => {
    if (!user) return undefined

    const es = new EventSource('/api/v1/notifications/stream', { withCredentials: true })

    es.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse(event.data)
        const id = payload?.notificationId
        if (!id) return

        if (!seenNotificationIds.current.has(id)) {
          seenNotificationIds.current.add(id)
          // Fresh notification arrived in real-time -> refresh query cache
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['analytics'] })
          queryClient.invalidateQueries({ queryKey: ['issues'] })
          queryClient.invalidateQueries({ queryKey: ['authority-reports'] })

          // Fetch latest notification for interactive live toast
          api('/notifications?limit=1')
            .then((res) => {
              const latest = res?.data?.[0]
              if (latest && !latest.read) {
                setToastNotification(latest)
                setTimeout(() => setToastNotification(null), 7000)
              }
            })
            .catch(() => {})
        }
      } catch (err) {
        console.error('Failed to parse SSE notification:', err)
      }
    })

    return () => {
      es.close()
    }
  }, [user, queryClient])

  // Mark single as read
  const markRead = useMutation({
    mutationFn: (id) => api(`/notifications/${id}`, { method: 'PATCH', body: { read: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Mark all read
  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const getTargetUrl = (notification) => {
    if (!notification.issueId) return null
    if (user?.role === 'citizen') {
      return `/citizen/reports`
    }
    if (user?.role === 'authority') {
      return `/authority/queue/${notification.issueId}`
    }
    if (user?.role === 'admin') {
      return `/admin/queue/${notification.issueId}`
    }
    return `/admin/queue`
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className="relative rounded-panel p-2 text-ink-muted hover:bg-surface-sunken"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <>
            <span className="absolute right-1 top-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            </span>
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-critical px-1 text-[10px] font-bold text-white shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notification center"
          className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-panel border border-line bg-surface-panel shadow-menu"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-muted">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const targetUrl = getTargetUrl(n)
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 text-xs transition-colors hover:bg-surface-sunken ${
                      !n.read ? 'bg-primary-soft/30' : ''
                    }`}
                  >
                    <Info
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        !n.read ? 'text-primary' : 'text-ink-faint'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-ink leading-relaxed ${!n.read ? 'font-medium' : ''}`}>
                        {n.body}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-muted">
                        <span>{timeAgo(n.createdAt)}</span>
                        {targetUrl && (
                          <Link
                            to={targetUrl}
                            onClick={() => {
                              if (!n.read) markRead.mutate(n.id)
                              setOpen(false)
                            }}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate(n.id)}
                        aria-label="Mark read"
                        className="rounded p-1 text-ink-muted hover:bg-surface hover:text-ink"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Floating real-time alert toast for new incoming issues */}
      {toastNotification && (
        <div className="fixed right-5 top-16 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-primary/30 bg-surface-panel p-4 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-ink">New Alert Received</p>
              <button
                type="button"
                onClick={() => setToastNotification(null)}
                className="text-xs text-ink-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-muted line-clamp-2">{toastNotification.body}</p>
            {getTargetUrl(toastNotification) && (
              <Link
                to={getTargetUrl(toastNotification)}
                onClick={() => {
                  markRead.mutate(toastNotification.id)
                  setToastNotification(null)
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View Issue <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
