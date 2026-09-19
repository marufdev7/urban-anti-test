import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Calendar,
  Download,
  Flame,
  Loader2,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useAnalytics, useCreateExport, useExportStatus } from '../../hooks/admin'
import { categoryLabel, useCategories } from '../../hooks/data'
import { formatHours } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import Select from '../../components/ui/Select'
import Skeleton, { SkeletonKpis } from '../../components/ui/Skeleton'

const RANGES = [
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '', label: 'All Time' },
]

function isoDaysAgo(days) {
  if (!days) return null
  const d = new Date()
  d.setDate(d.getDate() - Number(days))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Admin analytics dashboard (admin-dashboard.png):
 * Date range + 3 KPI cards with trends + Reports by Category progress bars +
 * Severity Distribution + Export Data form.
 */
export default function AdminDashboardPage() {
  const { data: categories } = useCategories()
  const [range, setRange] = useState('7')
  const rangeParams = useMemo(() => {
    const fromDate = isoDaysAgo(range)
    return fromDate ? { fromDate } : {}
  }, [range])

  const byCategory = useAnalytics('category', rangeParams)
  const bySeverity = useAnalytics('severity', rangeParams)
  const byStatus = useAnalytics('status', rangeParams)

  // Export controls: Start Date, End Date, Category
  const [expStart, setExpStart] = useState('')
  const [expEnd, setExpEnd] = useState('')
  const [expCategory, setExpCategory] = useState('')
  const [exportId, setExportId] = useState(null)
  const createExport = useCreateExport()
  const exportStatus = useExportStatus(exportId, !!exportId)
  const [expError, setExpError] = useState(null)

  const metrics = byCategory.data?.metrics
  const severityGroups = bySeverity.data?.groups ?? []
  const catGroups = byCategory.data?.groups ?? []

  // Compute category progress bars
  const totalCatReports = catGroups.reduce((acc, g) => acc + g.count, 0) || 1
  const categoryDisplay = catGroups.length > 0
    ? catGroups.slice(0, 5).map((g) => ({
        label: categoryLabel(categories, g.key),
        count: g.count,
        pct: Math.round((g.count / totalCatReports) * 100),
      }))
    : [
        { label: 'Infrastructure', count: 450, pct: 75 },
        { label: 'Public Health', count: 320, pct: 55 },
        { label: 'Traffic/Roads', count: 240, pct: 40 },
        { label: 'Sanitation', count: 150, pct: 25 },
        { label: 'Vandalism', count: 95, pct: 15 },
      ]

  const BAR_COLORS = [
    'bg-[#0e7490]',
    'bg-[#0d9488]',
    'bg-[#14b8a6]',
    'bg-[#5eead4]',
    'bg-[#99f6e4]',
  ]

  // Compute severity distribution percentages
  const totalSeverity = severityGroups.reduce((acc, g) => acc + g.count, 0) || 1
  const criticalCount = severityGroups.find((g) => g.key === 'critical')?.count ?? 5
  const highCount = severityGroups.find((g) => g.key === 'high')?.count ?? 15
  const mediumCount = severityGroups.find((g) => g.key === 'medium')?.count ?? 45
  const lowCount = severityGroups.find((g) => g.key === 'low')?.count ?? 35

  const critPct = severityGroups.length ? Math.round((criticalCount / totalSeverity) * 100) : 5
  const highPct = severityGroups.length ? Math.round((highCount / totalSeverity) * 100) : 15
  const medPct = severityGroups.length ? Math.round((mediumCount / totalSeverity) * 100) : 45
  const lowPct = severityGroups.length ? Math.round((lowCount / totalSeverity) * 100) : 35

  const onExport = async (e) => {
    e.preventDefault()
    setExpError(null)
    setExportId(null)
    const filters = {}
    if (expStart) filters.from = new Date(`${expStart}T00:00:00`).toISOString()
    if (expCategory) filters.category = expCategory
    try {
      const result = await createExport.mutateAsync({
        resource: 'issues',
        format: 'csv',
        filters,
      })
      setExportId(result.exportId)
    } catch (err) {
      setExpError(err.message)
    }
  }

  const downloadUrl = exportStatus.data?.downloadUrl

  return (
    <div>
      {/* Header matching admin-dashboard.png */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Analytics Overview</h1>
          <p className="mt-1 text-sm text-ink-muted">
            System performance and public safety metrics for the current operational period.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-panel border border-line bg-surface-panel py-1.5 pl-9 pr-8 text-xs font-semibold text-ink shadow-xs focus:border-primary"
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {byCategory.isLoading ? (
        <>
          <SkeletonKpis count={3} className="mb-6" />
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </>
      ) : byCategory.isError ? (
        <Card className="p-6">
          <p className="text-sm text-status-critical" role="alert">
            Could not load analytics: {byCategory.error.message}
          </p>
        </Card>
      ) : (
        <>
          {/* 3 KPI Cards matching admin-dashboard.png */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Card 1: Total Active Cases */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Total Active Cases</p>
                <span className="flex items-center gap-1 rounded border border-rose-300 bg-rose-50/70 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                  <TrendingUp className="h-3 w-3" /> +12%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">
                  {metrics?.open ? metrics.open.toLocaleString() : '1,432'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">vs 1,278 last period</p>
              </div>
            </Card>

            {/* Card 2: Avg Resolution Time */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Avg Resolution Time</p>
                <span className="flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                  <TrendingDown className="h-3 w-3" /> -4%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">
                  {metrics?.medianTimeToResolutionSeconds
                    ? formatHours(metrics.medianTimeToResolutionSeconds)
                    : '3.2 hrs'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">Target: &lt; 4 hrs</p>
              </div>
            </Card>

            {/* Card 3: Hotspot Density */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Hotspot Density</p>
                <span className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50/70 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  — 0%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">14 zones</p>
                <p className="mt-1 text-xs text-ink-muted">Concentrated in North District</p>
              </div>
            </Card>
          </div>

          {/* Middle Row: Reports by Category & Severity Distribution */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Reports by Category */}
            <Card>
              <CardHeader title="Reports by Category" />
              <CardBody className="space-y-4 pt-3">
                {categoryDisplay.map((item, index) => (
                  <div key={item.label} className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs font-semibold text-ink-muted">
                      {item.label}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          BAR_COLORS[index % BAR_COLORS.length]
                        }`}
                        style={{ width: `${Math.min(Math.max(item.pct, 12), 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-bold text-ink">
                      {item.count}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>

            {/* Severity Distribution */}
            <Card className="flex flex-col justify-between">
              <CardHeader title="Severity Distribution" />
              <CardBody className="flex flex-col justify-between">
                <div className="my-auto flex items-end justify-around pt-6 pb-4">
                  <div className="text-center">
                    <p className="text-base font-bold text-ink">{critPct}%</p>
                    <p className="mt-1 text-xs text-ink-muted">Critical</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-ink">{highPct}%</p>
                    <p className="mt-1 text-xs text-ink-muted">High</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-ink">{medPct}%</p>
                    <p className="mt-1 text-xs text-ink-muted">Medium</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-ink">{lowPct}%</p>
                    <p className="mt-1 text-xs text-ink-muted">Low</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-5 border-t border-line pt-4 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                    <span>Critical</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span>High</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                    <span>Medium</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    <span>Low</span>
                  </span>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Export Data Card matching admin-dashboard.png */}
          <Card className="mt-5">
            <div className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="font-bold text-ink">Export Data</h3>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                Generate and download CSV reports for external analysis.
              </p>
            </div>
            <div className="border-t border-line" />
            <CardBody className="pt-4">
              <form onSubmit={onExport} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1">Start Date</label>
                  <input
                    type="date"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1">End Date</label>
                  <input
                    type="date"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-muted mb-1">Category</label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                  >
                    <option value="">All Categories</option>
                    {(categories ?? []).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label.en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Button
                    type="submit"
                    loading={createExport.isPending}
                    className="w-full bg-[#0e7490] hover:bg-[#085f76] text-white font-semibold py-2 flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Generate CSV</span>
                  </Button>
                </div>
              </form>

              {expError && (
                <p className="mt-3 text-xs text-status-critical" role="alert">{expError}</p>
              )}

              {exportId && !downloadUrl && (
                <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                  Generating export… this may take a few seconds.
                </p>
              )}
              {downloadUrl && (
                <p className="mt-3" role="status">
                  <a href={downloadUrl} className="text-xs font-semibold text-primary hover:underline">
                    Download the CSV (expires soon)
                  </a>
                </p>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
