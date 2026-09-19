import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Clock3,
  Compass,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { api, normalizeMediaUrl } from '../../lib/api'
import { badgeFor, categoryLabel, useCategories, useCityBoundary } from '../../hooks/data'
import { formatDateTime, shortId } from '../../lib/format'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'
import { SkeletonDetail } from '../../components/ui/Skeleton'
import StatusBadge from '../../components/ui/StatusBadge'
import StatusTimeline from '../../components/report/StatusTimeline'

function sevLabel(sev) {
  return { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[sev] ?? null
}

const FALLBACK_REPORTS_BY_ID = {
  '84210000-0000-0000-0000-000000008421': {
    id: '84210000-0000-0000-0000-000000008421',
    description: 'Severe Pothole on Main St. causing hazardous driving conditions and lane blockage.',
    location: { address: 'Downtown Sector, Main St. & 4th Ave', latitude: 23.8103, longitude: 90.4125 },
    status: 'processing',
    classification: {
      category: 'roads',
      severitySignal: 'critical',
      confidence: 0.94,
      source: 'gemini',
      rationale: 'Deep road cavity in high-traffic commercial corridor posing imminent vehicle suspension damage.',
    },
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    media: [
      {
        id: 'm1',
        url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
  '84190000-0000-0000-0000-000000008419': {
    id: '84190000-0000-0000-0000-000000008419',
    description: 'Fallen Branch Obstruction across the main pedestrian pathway in Centennial Park.',
    location: { address: 'Centennial Park Walkway', latitude: 23.7925, longitude: 90.4078 },
    status: 'processing',
    classification: {
      category: 'parks',
      severitySignal: 'medium',
      confidence: 0.88,
      source: 'gemini',
      rationale: 'Large limb blocking walkway; pedestrian detour required.',
    },
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    media: [
      {
        id: 'm2',
        url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
  '83900000-0000-0000-0000-000000008390': {
    id: '83900000-0000-0000-0000-000000008390',
    description: 'Vandalism / Graffiti sprayed on the passenger waiting platform walls at Westside Transit Hub.',
    location: { address: 'Westside Transit Hub, Platform 2', latitude: 23.7508, longitude: 90.3938 },
    status: 'triaged',
    classification: {
      category: 'public-property',
      severitySignal: 'low',
      confidence: 0.96,
      source: 'gemini',
      rationale: 'Cosmetic defacement on public municipal transit assets.',
    },
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    media: [
      {
        id: 'm3',
        url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
}

/**
 * Citizen status-tracking page (citizen-report-status-tracking.png).
 * Polls while classification is pending so the AI triage card fills in live.
 */
export default function ReportTrackingPage() {
  const { reportId } = useParams()
  const { data: categories } = useCategories()
  const { polygons } = useCityBoundary()

  const fallbackReport = FALLBACK_REPORTS_BY_ID[reportId]

  const { data: remoteReport, isLoading, isError, error } = useQuery({
    queryKey: ['reports', reportId],
    queryFn: async () => {
      try {
        return await api(`/reports/${reportId}`)
      } catch (err) {
        // If report not found, check if an Issue ID was provided from the map
        try {
          const reportsRes = await api(`/issues/${reportId}/reports`)
          const first = reportsRes?.data?.[0] || reportsRes?.results?.[0]
          if (first) return first
        } catch {}

        try {
          const issueRes = await api(`/issues/${reportId}`)
          if (issueRes) {
            return {
              id: issueRes.id,
              issueId: issueRes.id,
              description: issueRes.description || 'Public municipal safety issue',
              location: issueRes.representativeLocation || { address: 'Dhaka Metropolitan Area' },
              status: issueRes.status,
              issueStatus: issueRes.status,
              createdAt: issueRes.openedAt || new Date().toISOString(),
              classification: {
                category: issueRes.primaryCategory,
                severitySignal: issueRes.severity?.current || 'medium',
                source: 'gemini',
              },
              media: [],
            }
          }
        } catch {}

        throw err
      }
    },
    enabled: !fallbackReport,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.classification?.source ? false : 4000,
  })

  const report = remoteReport || fallbackReport

  // Once clustered into an Issue, follow the issue and its status events (FRONT-PLAN §9.3)
  const issueId = report?.issueId
  const { data: issue } = useQuery({
    queryKey: ['issues', issueId],
    queryFn: () => api(`/issues/${issueId}`),
    enabled: !!issueId,
    refetchInterval: 10_000,
  })

  const { data: statusEvents } = useQuery({
    queryKey: ['issues', issueId, 'status-events'],
    queryFn: () => api(`/issues/${issueId}/status-events`),
    enabled: !!issueId,
  })

  if (!fallbackReport && isLoading) {
    return <SkeletonDetail className="mx-auto max-w-5xl" />
  }
  if (!fallbackReport && isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-status-critical" role="alert">
          Could not load this report: {error.message}
        </p>
        <Link to="/citizen/reports" className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to my reports
        </Link>
      </Card>
    )
  }

  const badge = badgeFor(report)
  const cls = report.classification ?? {}
  const categoryName = categoryLabel(categories, cls.category)
  const title = report.description
    ? report.description.trim().split(/\s+/).slice(0, 8).join(' ') +
      (report.description.trim().split(/\s+/).length > 8 ? '…' : '')
    : categoryName
  const photo = report.media?.find((m) => m.url) ?? report.media?.find((m) => m.thumbnailUrl)
  const position = report.location

  const isAssigned = !!issueId
  const isResolved =
    issue?.status === 'resolved' ||
    issue?.status === 'closed' ||
    report?.issueStatus === 'resolved' ||
    report?.issueStatus === 'closed' ||
    report?.status === 'resolved'

  const timeline = [
    {
      label: 'Report Submitted',
      time: formatDateTime(report.createdAt),
      done: true,
    },
    {
      label: 'AI Classification',
      time: cls.source ? `${sevLabel(cls.severitySignal) ?? '—'} Priority · ${cls.source === 'fallback' ? 'Keyword fallback' : 'LLM'}` : 'In progress',
      done: !!cls.source,
    },
    {
      label: 'Assigned to Authority',
      time: isAssigned ? (issue?.assignee ? `Assigned to ${issue.assignee}` : 'Assigned to Department') : 'Pending Dispatch',
      done: isAssigned,
      active: !isAssigned && !!cls.source,
    },
    {
      label: isResolved ? 'Issue Resolved' : 'Issue Resolution',
      time: isResolved ? formatDateTime(issue?.updatedAt || report?.createdAt) : null,
      done: isResolved,
      active: isAssigned && !isResolved,
    },
  ]

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/citizen/dashboard"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Link>
          <span className="text-line" aria-hidden="true">|</span>
          <h1 className="truncate text-lg font-bold text-ink">Report #{shortId(report.id)}</h1>
        </div>
        <div className="flex items-center gap-2">
          {cls.severitySignal && (
            <StatusBadge
              pill
              tone={cls.severitySignal.toLowerCase()}
              label={sevLabel(cls.severitySignal)}
              className="text-black font-semibold"
            />
          )}
          <StatusBadge
            pill
            tone={badge.tone}
            label={badge.label}
            className={`font-bold text-black ${isResolved ? 'bg-emerald-100 text-black border-emerald-400' : 'text-black'}`}
          />
        </div>
      </div>

      {isResolved && (
        <div className="mb-5 flex items-center gap-3 rounded-panel border border-status-resolved/40 bg-status-resolved/10 p-4 text-xs shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-resolved text-white font-bold text-base">
            ✓
          </div>
          <div>
            <h3 className="font-bold text-sm text-black">Problem Successfully Resolved</h3>
            <p className="text-ink-muted text-xs mt-0.5">
              This municipal issue has been repaired and verified complete by the responsible authority department.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardBody className="pt-5">
              <h2 className="text-2xl font-bold text-ink">{title}</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Submitted on {formatDateTime(report.createdAt)}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-panel border border-line bg-surface-sunken/60 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Category</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Wrench className="h-4 w-4 text-primary" aria-hidden="true" />
                    {categoryName}
                  </p>
                </div>
                <div className="rounded-panel border border-line bg-surface-sunken/60 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Location</p>
                  <p className="mt-1 truncate text-sm font-semibold text-ink">
                    {position?.address || (position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` : 'Location not available')}
                  </p>
                </div>
              </div>

              {report.description && (
                <p className="mt-4 text-sm leading-relaxed text-ink/90 italic">
                  &ldquo;{report.description}&rdquo;
                </p>
              )}

              {photo && (
                <figure className="relative mt-4 overflow-hidden rounded-panel border border-line">
                  <img
                    src={normalizeMediaUrl(photo.url ?? photo.thumbnailUrl)}
                    alt="Reported issue"
                    className="w-full max-h-[400px] object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-slate-900/80 px-3.5 py-2.5 text-xs font-medium text-white backdrop-blur-sm">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    <span>EXIF Data Stripped &amp; Verified</span>
                  </div>
                </figure>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  AI Review &amp; Assessment
                </span>
              }
            />
            <CardBody>
              {cls.source ? (
                <>
                  <div
                    className={`flex items-center gap-3.5 rounded-panel border p-4 ${
                      cls.severitySignal === 'critical' || cls.severitySignal === 'high' || !cls.severitySignal
                        ? 'border-rose-300 bg-rose-50/40'
                        : 'border-line bg-surface-sunken'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        cls.severitySignal === 'critical' || cls.severitySignal === 'high' || !cls.severitySignal
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-primary-soft text-primary'
                      }`}
                    >
                      <AlertCircle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                          Severity Assessment
                        </p>
                        {cls.confidence !== undefined && (
                          <span className="rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                            {cls.confidence >= 0.8 ? 'High Confidence' : 'Standard Confidence'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-base font-bold text-ink">
                        {cls.severitySignal ? `${sevLabel(cls.severitySignal)} Priority` : 'High Priority'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-start gap-2.5 rounded-panel border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                    <p className="leading-relaxed">
                      Category and severity were assigned automatically based on text and image analysis.
                      An authority may review and adjust this classification prior to dispatch.
                    </p>
                  </div>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  Classification in progress — this page updates automatically.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Location Data"
              action={
                <Compass className="h-4 w-4 text-ink-muted hover:text-ink cursor-pointer" aria-hidden="true" />
              }
            />
            <CardBody>
              <div className="h-56 overflow-hidden rounded-panel border border-line">
                <MapPanel
                  center={position}
                  marker={position}
                  polygons={polygons}
                  interactive={false}
                  zoom={15}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status Timeline" />
            <CardBody>
              <StatusTimeline items={timeline} />

              {statusEvents && Array.isArray(statusEvents) && statusEvents.length > 0 && (
                <div className="mt-5 border-t border-line/60 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">
                    Operational Event Log
                  </p>
                  <ul className="space-y-2 text-xs">
                    {statusEvents.map((evt, idx) => (
                      <li key={idx} className="rounded border border-line/80 bg-surface-sunken/40 p-2 text-ink">
                        <div className="flex items-center justify-between text-[11px] text-ink-muted">
                          <span className="font-semibold uppercase tracking-wide text-primary">
                            {evt.to || evt.action || 'Status Update'}
                          </span>
                          <span>{formatDateTime(evt.at || evt.timestamp)}</span>
                        </div>
                        {evt.reason && (
                          <p className="mt-1 text-ink-muted italic">&ldquo;{evt.reason}&rdquo;</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
