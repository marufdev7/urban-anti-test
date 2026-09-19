import { useState } from 'react'
import { useAuditEvents } from '../../hooks/admin'
import { formatDateTime } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import { SkeletonCards } from '../../components/ui/Skeleton'

/**
 * Admin audit log (API §6.10). Admins see every event; authorities only see
 * their own (server-enforced). Events are append-only.
 */
export default function AuditLogPage() {
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [cursor, setCursor] = useState(null)
  const [stale, setStale] = useState([])

  const params = { limit: '25' }
  if (action) params.action = action
  if (targetType) params.targetType = targetType
  if (cursor) params.cursor = cursor

  const { data, isLoading, isError, error, isFetching } = useAuditEvents(params)
  const rows = cursor ? [...stale, ...(data?.data ?? [])] : data?.data ?? []
  const nextCursor = data?.page?.nextCursor

  const applyFilter = () => {
    setStale([])
    setCursor(null)
  }

  const loadMore = () => {
    setStale(rows)
    setCursor(nextCursor)
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Provisioning, revocation, scope changes, moderation decisions and lifecycle actions."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <label htmlFor="audit-action" className="sr-only">Action filter</label>
            <input
              id="audit-action"
              type="text"
              placeholder="Filter by action (e.g. moderation.hide)…"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              onBlur={applyFilter}
              onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
              className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-sm placeholder:text-ink-faint focus:border-primary"
            />
          </div>
          <Select
            aria-label="Target type"
            className="w-40"
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value)
              applyFilter()
            }}
            options={[
              { value: 'report', label: 'reports' },
              { value: 'issue', label: 'issues' },
              { value: 'user', label: 'users' },
              { value: 'media', label: 'media' },
              { value: 'comment', label: 'comments' },
              { value: 'category', label: 'categories' },
            ]}
            placeholder="All targets"
          />
        </div>
      </Card>

      {isLoading ? (
        <SkeletonCards count={4} />
      ) : isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">{error.message}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="No audit events" message="Actions that match the filters will appear here." />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            {/* Mobile: stacked cards (FRONTEND_PLAN §7). */}
            <div className="space-y-3 p-4 md:hidden">
              {rows.map((event, index) => (
                <div
                  key={`${event.at}-${index}`}
                  className="rounded-panel border border-line bg-surface-panel p-4 shadow-panel"
                >
                  <p className="font-mono text-xs text-ink">{event.action}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDateTime(event.at)}</p>
                  <p className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
                    actor {shortActor(event.actorId)} · {event.targetType} {shortActor(event.targetId)}
                  </p>
                </div>
              ))}
            </div>

            {/* Tablet/desktop: full table. */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-4 py-3">Time</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Actor</th>
                  <th scope="col" className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((event, index) => (
                  <tr key={`${event.at}-${index}`} className="hover:bg-surface-sunken">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDateTime(event.at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-ink">{event.action}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{shortActor(event.actorId)}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {event.targetType} · {shortActor(event.targetId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          {nextCursor && (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={loadMore} loading={isFetching && !!cursor}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function shortActor(id) {
  return id ? id.replace(/-/g, '').slice(0, 6).toUpperCase() : '—'
}
