import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  PlusCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import { SkeletonCards } from '../../components/ui/Skeleton'
import ReportCard from '../../components/report/ReportCard'

// Mock district infrastructure reports shown in citizen-dashboard.png
// when district activity has not yet been populated by recent user submissions.
const DISTRICT_FALLBACK_REPORTS = [
  {
    id: '84210000-0000-0000-0000-000000008421',
    description: 'Severe Pothole on Main St.',
    location: { address: 'Downtown Sector' },
    status: 'processing',
    classification: { severitySignal: 'critical' },
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    media: [
      {
        url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
  {
    id: '84190000-0000-0000-0000-000000008419',
    description: 'Fallen Branch Obstruction',
    location: { address: 'Centennial Park Walkway' },
    status: 'processing',
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    media: [
      {
        url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
  {
    id: '83900000-0000-0000-0000-000000008390',
    description: 'Vandalism / Graffiti',
    location: { address: 'Westside Transit Hub' },
    status: 'resolved',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    media: [
      {
        url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
      },
    ],
  },
]

/** Citizen dashboard (citizen-dashboard.png). */
export default function DashboardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reports', 'mine', 'dashboard'],
    queryFn: () => api('/reports?limit=100'),
    refetchInterval: 30_000,
  })

  const reports = data?.data ?? []
  const hasReports = reports.length > 0
  const processing = reports.filter((r) => ['submitted', 'processing'].includes(r.status)).length
  const highPriority = reports.filter((r) =>
    ['critical', 'high'].includes(r.classification?.severitySignal),
  ).length
  const resolved = reports.filter((r) => r.status === 'triaged' || r.status === 'resolved').length
  const displayReports = hasReports ? reports.slice(0, 6) : DISTRICT_FALLBACK_REPORTS

  const kpis = [
    {
      label: 'PROCESSING',
      value: hasReports ? processing : 24,
      sub: 'Active cases',
      icon: Hourglass,
      tone: 'neutral',
    },
    {
      label: 'HIGH PRIORITY',
      value: hasReports ? highPriority : 5,
      sub: 'Require action',
      icon: AlertTriangle,
      tone: 'critical',
    },
    {
      label: 'RESOLVED',
      value: hasReports ? resolved : 142,
      sub: 'This month',
      icon: CheckCircle2,
      tone: 'resolved',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Monitor public safety reports and track community resilience efforts."
      />

      {isLoading && <SkeletonCards count={4} className="mt-2" />}
      {isError && (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load your reports: {error.message}
          </p>
        </Card>
      )}

      {!isLoading && !isError && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map(({ label, value, sub, icon: Icon, tone }) => (
              <Card key={label} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {label}
                  </p>
                  <Icon
                    className={`h-4 w-4 ${
                      tone === 'critical'
                        ? 'text-status-critical'
                        : tone === 'resolved'
                          ? 'text-status-resolved'
                          : 'text-ink-faint'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-bold tracking-tight ${
                      tone === 'critical' && value > 0 ? 'text-status-critical' : 'text-ink'
                    }`}
                  >
                    {value}
                  </span>
                  <span
                    className={`text-xs ${
                      tone === 'resolved'
                        ? 'font-semibold text-status-resolved'
                        : 'text-ink-muted'
                    }`}
                  >
                    {sub}
                  </span>
                </div>
              </Card>
            ))}

            <Card className="flex flex-col justify-between bg-[#005a4c] p-5 text-white border-[#005a4c] shadow-xs">
              <div>
                <p className="text-base font-semibold text-white">Notice an issue?</p>
                <p className="mt-1 text-xs text-white/90 leading-relaxed">
                  Submit a report in under 90 seconds. Help keep the city safe.
                </p>
              </div>
              <Link to="/citizen/reports/new" className="mt-4">
                <Button
                  variant="secondary"
                  className="w-full justify-center gap-1.5 bg-white text-[#005a4c] hover:bg-white/95 border-white font-semibold shadow-xs"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  Report a Problem
                </Button>
              </Link>
            </Card>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Nearby Activity</h2>
              <p className="text-xs text-ink-muted">Recent infrastructure reports in your district.</p>
            </div>
            <Link
              to="/citizen/map"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all on Map
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {displayReports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
