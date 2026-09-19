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
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import ReportCard from '../../components/report/ReportCard'

/** Citizen dashboard with real live database data. */
export default function DashboardPage() {
  const { data: reportsData, isLoading, isError, error } = useQuery({
    queryKey: ['reports', 'mine', 'dashboard'],
    queryFn: () => api('/reports?limit=100'),
    refetchInterval: 10_000,
  })

  const { data: issuesData } = useQuery({
    queryKey: ['issues', 'public', 'dashboard'],
    queryFn: () => api('/issues?limit=100'),
    refetchInterval: 10_000,
  })

  const reports = reportsData?.data ?? []
  const issues = issuesData?.data ?? []
  const issueById = new Map(issues.map((i) => [i.id, i]))

  const isReportResolved = (r) => {
    if (r.status === 'resolved' || r.status === 'closed') return true
    if (r.issueId && issueById.has(r.issueId)) {
      const iss = issueById.get(r.issueId)
      return iss.status === 'resolved' || iss.status === 'closed'
    }
    return false
  }

  const isReportHighPriority = (r) => {
    const sev = r.classification?.severitySignal?.toLowerCase()
    if (['critical', 'high'].includes(sev)) return true
    if (r.issueId && issueById.has(r.issueId)) {
      const iss = issueById.get(r.issueId)
      const isSev = (iss.severity?.current || iss.computedSeverity)?.toLowerCase()
      return ['critical', 'high'].includes(isSev)
    }
    return false
  }

  const isReportActive = (r) => {
    if (['hidden', 'removed'].includes(r.status)) return false
    return !isReportResolved(r)
  }

  // Exact real counts from database
  const processingCount = reports.filter(isReportActive).length
  const highPriorityCount = reports.filter(isReportHighPriority).length
  const resolvedCount = reports.filter(isReportResolved).length

  const kpis = [
    {
      label: 'PROCESSING',
      value: processingCount,
      sub: 'Active cases',
      icon: Hourglass,
      tone: 'neutral',
    },
    {
      label: 'HIGH PRIORITY',
      value: highPriorityCount,
      sub: 'Require action',
      icon: AlertTriangle,
      tone: 'critical',
    },
    {
      label: 'RESOLVED',
      value: resolvedCount,
      sub: 'This month',
      icon: CheckCircle2,
      tone: 'resolved',
    },
  ]

  // Real database reports for Nearby Activity (newest first)
  const displayReports = reports.slice(0, 6)

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Monitor public safety reports and track community resilience efforts."
      />

      {isError && (
        <div className="mb-4 rounded-panel border border-status-critical/30 bg-status-critical-soft p-3 text-xs text-status-critical">
          Could not refresh recent live sync: {error.message}. Showing cached district data.
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  tone === 'critical' ? 'text-status-critical' : 'text-ink'
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

        {/* Dark Teal CTA Card matching citizen-dashboard.png */}
        <div className="flex flex-col justify-between rounded-panel bg-[#005a4c] p-5 text-white shadow-panel">
          <div>
            <h3 className="text-base font-bold text-white">Notice an issue?</h3>
            <p className="mt-1 text-xs text-white/90 leading-relaxed">
              Submit a report in under 90 seconds. Help keep the city safe.
            </p>
          </div>
          <Link
            to="/citizen/reports/new"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-panel bg-white py-2.5 px-4 text-sm font-semibold text-[#005a4c] shadow-xs transition hover:bg-white/90 active:scale-[0.99]"
          >
            <PlusCircle className="h-4 w-4 text-[#005a4c]" aria-hidden="true" />
            <span>Report a Problem</span>
          </Link>
        </div>
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

      {displayReports.length === 0 ? (
        <Card className="p-8 text-center">
          <EmptyState
            title="No reports found"
            message="Reports you submit in your district will appear here."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {displayReports.map((report) => {
            const linkedIssue = issueById.get(report.issueId)
            const resolved =
              linkedIssue?.status === 'resolved' ||
              linkedIssue?.status === 'closed' ||
              report.status === 'resolved'
            const reportWithIssue = {
              ...report,
              ...(resolved ? { status: 'resolved' } : {}),
            }
            return <ReportCard key={report.id} report={reportWithIssue} />
          })}
        </div>
      )}
    </div>
  )
}
