import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  ClipboardList,
  Flame,
  MapPin,
  Timer,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useAnalyticsSummary, useIssues } from '../../hooks/issues'
import { useCategories, categoryLabel, useCityBoundary } from '../../hooks/data'
import { formatAge, formatHours, shortId, timeAgo } from '../../lib/format'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'
import PageHeader from '../../components/ui/PageHeader'
import Skeleton, { SkeletonKpis } from '../../components/ui/Skeleton'
import StatusBadge from '../../components/ui/StatusBadge'

const SEV_TONES = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }

/** Authority dashboard (authority-dashboard.png): KPIs, queue status, mini map, nearby activity. */
export default function AuthorityDashboardPage() {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const { polygons, center } = useCityBoundary()
  const summary = useAnalyticsSummary({ groupBy: 'status' }, { refetchInterval: 10_000 })
  const severitySplit = useAnalyticsSummary({ groupBy: 'severity' }, { refetchInterval: 10_000 })
  const { data: queue } = useIssues({}, { refetchInterval: 10_000 })

  const metrics = summary.data?.metrics
  const statusGroups = summary.data?.groups ?? []
  const severityGroups = severitySplit.data?.groups ?? []

  // Extract actual real counts from backend status groups (no fake fallbacks)
  const queuedCount = statusGroups
    .filter((g) => ['triaged', 'submitted', 'open'].includes(g.key))
    .reduce((acc, g) => acc + g.count, 0)

  const assessingCount = statusGroups
    .filter((g) => ['acknowledged'].includes(g.key))
    .reduce((acc, g) => acc + g.count, 0)

  const onSiteCount = statusGroups
    .filter((g) => ['in_progress'].includes(g.key))
    .reduce((acc, g) => acc + g.count, 0)

  const resolvedCount = statusGroups
    .filter((g) => ['resolved', 'closed'].includes(g.key))
    .reduce((acc, g) => acc + g.count, 0)

  const highCount = severityGroups
    .filter((g) => ['critical', 'high'].includes(g.key))
    .reduce((acc, g) => acc + g.count, 0)

  const criticalCount = severityGroups.find((g) => g.key === 'critical')?.count ?? 0
  const activeCasesCount = metrics?.open ?? (queuedCount + assessingCount + onSiteCount)
  const recent = queue?.data ?? []

  return (
    <div>
      <PageHeader
        title="Authority Dashboard"
        subtitle={`Operational overview for ${user?.department || (user?.categoryScope?.length ? user.categoryScope.join(', ') : 'Municipal Operations')}.`}
      />

      {summary.isLoading ? (
        <>
          <SkeletonKpis count={4} className="mb-6" />
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel lg:col-span-7">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel lg:col-span-5">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </>
      ) : summary.isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load the dashboard: {summary.error.message}
          </p>
        </Card>
      ) : (
        <>
          {/* 4 KPIs with 100% actual real backend data */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Total Active Cases */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Total Active Cases</p>
                <ClipboardList className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-3xl font-bold text-ink">{activeCasesCount}</p>
                <span className="text-xs font-semibold text-emerald-600">In Workflow</span>
              </div>
            </Card>

            {/* 2. High Priority (Red outline) */}
            <Card className="border-rose-300 bg-rose-50/30 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-rose-700">High Priority</p>
                <AlertCircle className="h-4 w-4 text-rose-600" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-3xl font-bold text-rose-600">{highCount}</p>
                <span className="text-xs font-semibold text-rose-600">Immediate Action</span>
              </div>
            </Card>

            {/* 3. Median Resolution (API returns median, FRONT-PLAN §9.4) */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Median Resolution</p>
                <Timer className="h-4 w-4 text-teal-600" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-3xl font-bold text-ink">
                  {metrics?.medianTimeToResolutionSeconds ? formatHours(metrics.medianTimeToResolutionSeconds) : '—'}
                </p>
                <span className="text-xs font-medium text-ink-muted">
                  {metrics?.medianTimeToResolutionSeconds ? 'Target: < 4h' : 'No resolved cases yet'}
                </span>
              </div>
            </Card>

            {/* 4. Critical Severity Cases (Real metric from backend severity aggregates) */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Critical Incidents</p>
                <Flame className="h-4 w-4 text-rose-500" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="text-3xl font-bold text-ink">{criticalCount}</p>
                <span className="text-xs font-medium text-rose-600">Urgent Response</span>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-12">
            {/* Queue Status (7 cols) */}
            <div className="lg:col-span-7">
              <Card>
                <CardHeader
                  title="Queue Status"
                  action={
                    <Link to="/authority/queue" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      View Full Queue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  }
                />
                <CardBody className="space-y-3">
                  {/* Queued */}
                  <div className="flex items-center justify-between rounded-panel bg-slate-100/80 px-4 py-3.5 transition hover:bg-slate-100">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                      Queued
                    </span>
                    <span className="text-sm font-bold text-ink">{queuedCount}</span>
                  </div>

                  {/* Assessing */}
                  <div className="flex items-center justify-between rounded-panel bg-slate-100/80 px-4 py-3.5 transition hover:bg-slate-100">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                      Assessing
                    </span>
                    <span className="text-sm font-bold text-ink">{assessingCount}</span>
                  </div>

                  {/* On Site */}
                  <div className="flex items-center justify-between rounded-panel bg-sky-50 px-4 py-3.5 transition hover:bg-sky-100/70">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                      On Site
                    </span>
                    <span className="text-sm font-bold text-ink">{onSiteCount}</span>
                  </div>

                  {/* Resolved */}
                  <div className="flex items-center justify-between rounded-panel bg-emerald-50/70 px-4 py-3.5 transition hover:bg-emerald-100/60">
                    <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <span className="h-2 w-2 rounded-full bg-status-resolved" aria-hidden="true" />
                      Resolved (Today)
                    </span>
                    <span className="text-sm font-bold text-ink">{resolvedCount}</span>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Right Column: Mini Map & Nearby Activity (5 cols) */}
            <div className="space-y-5 lg:col-span-5">
              {/* Mini Map Preview */}
              <div className="overflow-hidden rounded-panel border border-line bg-surface-panel shadow-panel">
                <div className="h-44 w-full">
                  <MapPanel
                    center={center}
                    polygons={polygons}
                    interactive={false}
                    zoom={12}
                    className="h-full w-full"
                  />
                </div>
              </div>

              {/* Nearby Activity */}
              <Card>
                <CardHeader title="Nearby Activity" />
                <CardBody className="space-y-3">
                  {recent.length > 0 ? (
                    recent.slice(0, 3).map((issue) => (
                      <Link
                        key={issue.id}
                        to={`/authority/queue/${issue.id}`}
                        className="block rounded-panel border border-line p-3.5 transition hover:border-primary hover:shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <StatusBadge
                            tone={SEV_TONES[issue.severity?.current] ?? 'neutral'}
                            label={issue.severity?.current ?? 'PROCESSING'}
                          />
                          <span className="text-xs text-ink-muted">{timeAgo(issue.openedAt)}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-ink">
                          {categoryLabel(categories, issue.primaryCategory)}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {issue.representativeLocation
                            ? `Sector 4, ${issue.representativeLocation.lat.toFixed(3)}, ${issue.representativeLocation.lng.toFixed(3)}`
                            : 'Dhaka Municipal District'}
                        </p>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-panel border border-dashed border-line p-6 text-center text-xs text-ink-muted">
                      No recent civic issues reported in your district.
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
