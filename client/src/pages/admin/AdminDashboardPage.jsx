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
import { useIssues } from '../../hooks/issues'
import { categoryLabel, useCategories } from '../../hooks/data'
import { formatHours } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
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

function getPreviousPeriodParams(range) {
  if (!range) return null
  const days = Number(range)
  if (!days) return null
  const now = new Date()

  const toDate = new Date(now)
  toDate.setDate(toDate.getDate() - days)
  toDate.setHours(0, 0, 0, 0)

  const fromDate = new Date(now)
  fromDate.setDate(fromDate.getDate() - days * 2)
  fromDate.setHours(0, 0, 0, 0)

  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
  }
}

/**
 * Admin analytics dashboard:
 * Date range + 3 KPI cards with real trends + Reports by Category progress bars +
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

  // Previous period for actual trend comparisons
  const prevParams = useMemo(() => getPreviousPeriodParams(range), [range])
  const prevAnalytics = useAnalytics('status', prevParams || {}, { enabled: !!prevParams })
  const prevMetrics = prevAnalytics.data?.metrics

  // Query issues to calculate real active hotspot zones
  const { data: issuesData } = useIssues({ limit: '100' })
  const allIssues = issuesData?.data ?? []

  const filteredIssues = useMemo(() => {
    if (!range) return allIssues
    const from = isoDaysAgo(range)
    if (!from) return allIssues
    const fromTime = new Date(from).getTime()
    return allIssues.filter((i) => new Date(i.openedAt).getTime() >= fromTime)
  }, [allIssues, range])

  const zoneStats = useMemo(() => {
    if (filteredIssues.length === 0) {
      return { totalZones: 0, topZoneName: 'No active hazard clusters', topCount: 0 }
    }
    const zoneCounts = new Map()
    for (const issue of filteredIssues) {
      const loc = issue.representativeLocation
      let zoneName = 'Dhaka Sector'
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        const { lat, lng } = loc
        if (lat >= 23.83 && lat <= 23.92 && lng >= 90.35 && lng <= 90.44) {
          zoneName = 'Uttara Sector'
        } else if (lat >= 23.79 && lat <= 23.84 && lng >= 90.34 && lng <= 90.39) {
          zoneName = 'Mirpur Sector'
        } else if (lat >= 23.76 && lat <= 23.82 && lng >= 90.39 && lng <= 90.44) {
          zoneName = 'Mohakhali / Gulshan'
        } else if (lat >= 23.72 && lat <= 23.77 && lng >= 90.35 && lng <= 90.39) {
          zoneName = 'Dhanmondi / Mohammadpur'
        } else if (lat >= 23.68 && lat <= 23.74 && lng >= 90.38 && lng <= 90.44) {
          zoneName = 'Old Dhaka / Motijheel'
        } else {
          zoneName = 'Metropolitan Sector'
        }
      }
      zoneCounts.set(zoneName, (zoneCounts.get(zoneName) || 0) + 1)
    }

    let topZoneName = ''
    let topCount = 0
    for (const [name, count] of zoneCounts.entries()) {
      if (count > topCount) {
        topCount = count
        topZoneName = name
      }
    }

    return {
      totalZones: zoneCounts.size,
      topZoneName: topZoneName
        ? `${topZoneName} (${topCount} ${topCount === 1 ? 'case' : 'cases'})`
        : 'Dhaka Sector',
      topCount,
    }
  }, [filteredIssues])

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

  // Compute category progress bars using strictly real counts
  const totalCatReports = catGroups.reduce((acc, g) => acc + g.count, 0)
  const categoryDisplay = catGroups.map((g) => ({
    label: categoryLabel(categories, g.key),
    count: g.count,
    pct: totalCatReports > 0 ? Math.round((g.count / totalCatReports) * 100) : 0,
  }))

  const BAR_COLORS = [
    'bg-[#0e7490]',
    'bg-[#0d9488]',
    'bg-[#14b8a6]',
    'bg-[#5eead4]',
    'bg-[#99f6e4]',
  ]

  // Compute severity distribution percentages (strictly actual data, no mock fallbacks)
  const totalSeverity = severityGroups.reduce((acc, g) => acc + g.count, 0)
  const criticalCount = severityGroups.find((g) => g.key === 'critical')?.count ?? 0
  const highCount = severityGroups.find((g) => g.key === 'high')?.count ?? 0
  const mediumCount = severityGroups.find((g) => g.key === 'medium')?.count ?? 0
  const lowCount = severityGroups.find((g) => g.key === 'low')?.count ?? 0

  const critPct = totalSeverity > 0 ? Math.round((criticalCount / totalSeverity) * 100) : 0
  const highPct = totalSeverity > 0 ? Math.round((highCount / totalSeverity) * 100) : 0
  const medPct = totalSeverity > 0 ? Math.round((mediumCount / totalSeverity) * 100) : 0
  const lowPct = totalSeverity > 0 ? Math.round((lowCount / totalSeverity) * 100) : 0

  // Card 1: Total Active Cases
  const currentOpen = metrics?.open ?? 0
  const prevOpen = prevMetrics?.open ?? 0

  let openTrendBadge = null
  let openTrendText = ''
  if (range && prevParams) {
    if (prevOpen > 0) {
      const diff = currentOpen - prevOpen
      const pct = Math.round((diff / prevOpen) * 100)
      if (diff > 0) {
        openTrendBadge = (
          <span className="flex items-center gap-1 rounded border border-rose-300 bg-rose-50/70 px-2 py-0.5 text-[11px] font-bold text-rose-600">
            <TrendingUp className="h-3 w-3" /> +{pct}%
          </span>
        )
      } else if (diff < 0) {
        openTrendBadge = (
          <span className="flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
            <TrendingDown className="h-3 w-3" /> {pct}%
          </span>
        )
      } else {
        openTrendBadge = (
          <span className="flex items-center gap-1 rounded border border-slate-300 bg-slate-50/70 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            — 0%
          </span>
        )
      }
    } else {
      if (currentOpen > 0) {
        openTrendBadge = (
          <span className="flex items-center gap-1 rounded border border-rose-300 bg-rose-50/70 px-2 py-0.5 text-[11px] font-bold text-rose-600">
            <TrendingUp className="h-3 w-3" /> +{currentOpen}
          </span>
        )
      } else {
        openTrendBadge = (
          <span className="flex items-center gap-1 rounded border border-slate-300 bg-slate-50/70 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            — 0%
          </span>
        )
      }
    }
    openTrendText = `vs ${prevOpen} last period`
  } else {
    openTrendBadge = (
      <span className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
        All Time
      </span>
    )
    openTrendText = 'Total across all recorded issues'
  }

  // Card 2: Avg Resolution Time
  const hasResolutionTime = metrics?.medianTimeToResolutionSeconds != null
  const resolutionDisplay = hasResolutionTime
    ? formatHours(metrics.medianTimeToResolutionSeconds)
    : '—'
  const resolutionResolvedCount = metrics?.resolved ?? 0
  const resolutionSubtitle =
    resolutionResolvedCount > 0
      ? `${resolutionResolvedCount} ${resolutionResolvedCount === 1 ? 'case' : 'cases'} resolved · Target: < 4 hrs`
      : 'Target: < 4 hrs (0 resolved in period)'

  let resolutionBadge = null
  if (hasResolutionTime) {
    const isUnderTarget = metrics.medianTimeToResolutionSeconds <= 4 * 3600
    resolutionBadge = (
      <span
        className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold ${
          isUnderTarget
            ? 'border-emerald-300 bg-emerald-50/70 text-emerald-600'
            : 'border-amber-300 bg-amber-50/70 text-amber-700'
        }`}
      >
        <Timer className="h-3 w-3" /> {isUnderTarget ? 'On Target' : 'Delayed'}
      </span>
    )
  } else {
    resolutionBadge = (
      <span className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        No Data
      </span>
    )
  }

  // Card 3: Hotspot Density
  const { totalZones, topZoneName } = zoneStats
  const hotspotSubtitle =
    totalZones > 0 ? `Concentrated in ${topZoneName}` : 'No active incident clusters'
  const hotspotBadge =
    totalZones > 0 ? (
      <span className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50/70 px-2 py-0.5 text-[11px] font-bold text-amber-700">
        <Flame className="h-3 w-3" /> Active
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
        Clear
      </span>
    )

  const onExport = async (e) => {
    e.preventDefault()
    setExpError(null)
    setExportId(null)
    const filters = {}
    if (expStart) filters.from = new Date(`${expStart}T00:00:00`).toISOString()
    if (expEnd) filters.to = new Date(`${expEnd}T23:59:59`).toISOString()
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
          {/* 3 KPI Cards matching admin-dashboard.png with 100% actual data */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Card 1: Total Active Cases */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Total Active Cases</p>
                {openTrendBadge}
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">
                  {currentOpen.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{openTrendText}</p>
              </div>
            </Card>

            {/* Card 2: Avg Resolution Time */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Avg Resolution Time</p>
                {resolutionBadge}
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">{resolutionDisplay}</p>
                <p className="mt-1 text-xs text-ink-muted">{resolutionSubtitle}</p>
              </div>
            </Card>

            {/* Card 3: Hotspot Density */}
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted">Hotspot Density</p>
                {hotspotBadge}
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-ink">
                  {totalZones} {totalZones === 1 ? 'zone' : 'zones'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{hotspotSubtitle}</p>
              </div>
            </Card>
          </div>

          {/* Middle Row: Reports by Category & Severity Distribution */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Reports by Category */}
            <Card>
              <CardHeader title="Reports by Category" />
              <CardBody className="space-y-4 pt-3">
                {categoryDisplay.length === 0 ? (
                  <div className="py-10 text-center text-xs text-ink-muted">
                    No reports recorded for this period.
                  </div>
                ) : (
                  categoryDisplay.map((item, index) => (
                    <div key={item.label} className="flex items-center gap-4">
                      <span className="w-28 shrink-0 text-xs font-semibold text-ink-muted">
                        {item.label}
                      </span>
                      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            BAR_COLORS[index % BAR_COLORS.length]
                          }`}
                          style={{ width: `${Math.min(Math.max(item.pct, 8), 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-bold text-ink">
                        {item.count}
                      </span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            {/* Severity Distribution */}
            <Card className="flex flex-col justify-between">
              <CardHeader title="Severity Distribution" />
              <CardBody className="flex flex-col justify-between">
                {totalSeverity === 0 ? (
                  <div className="my-auto py-10 text-center text-xs text-ink-muted">
                    No severity data recorded for this period.
                  </div>
                ) : (
                  <>
                    <div className="my-auto pt-4 pb-2">
                      <div className="flex items-end justify-around">
                        <div className="text-center">
                          <p className="text-base font-bold text-ink">{critPct}%</p>
                          <p className="text-[11px] font-medium text-ink-muted">
                            ({criticalCount})
                          </p>
                          <p className="mt-1 text-xs font-semibold text-rose-600">Critical</p>
                        </div>
                        <div className="text-center">
                          <p className="text-base font-bold text-ink">{highPct}%</p>
                          <p className="text-[11px] font-medium text-ink-muted">
                            ({highCount})
                          </p>
                          <p className="mt-1 text-xs font-semibold text-amber-600">High</p>
                        </div>
                        <div className="text-center">
                          <p className="text-base font-bold text-ink">{medPct}%</p>
                          <p className="text-[11px] font-medium text-ink-muted">
                            ({mediumCount})
                          </p>
                          <p className="mt-1 text-xs font-semibold text-amber-700">Medium</p>
                        </div>
                        <div className="text-center">
                          <p className="text-base font-bold text-ink">{lowPct}%</p>
                          <p className="text-[11px] font-medium text-ink-muted">
                            ({lowCount})
                          </p>
                          <p className="mt-1 text-xs font-semibold text-emerald-600">Low</p>
                        </div>
                      </div>

                      {/* Visual stacked distribution bar */}
                      <div className="mt-5 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                        {critPct > 0 && (
                          <div
                            style={{ width: `${critPct}%` }}
                            className="bg-rose-600 transition-all"
                            title={`Critical: ${critPct}% (${criticalCount})`}
                          />
                        )}
                        {highPct > 0 && (
                          <div
                            style={{ width: `${highPct}%` }}
                            className="bg-amber-500 transition-all"
                            title={`High: ${highPct}% (${highCount})`}
                          />
                        )}
                        {medPct > 0 && (
                          <div
                            style={{ width: `${medPct}%` }}
                            className="bg-amber-600 transition-all"
                            title={`Medium: ${medPct}% (${mediumCount})`}
                          />
                        )}
                        {lowPct > 0 && (
                          <div
                            style={{ width: `${lowPct}%` }}
                            className="bg-emerald-600 transition-all"
                            title={`Low: ${lowPct}% (${lowCount})`}
                          />
                        )}
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
                  </>
                )}
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
              <form
                onSubmit={onExport}
                className="grid grid-cols-1 gap-3 items-end sm:grid-cols-2 lg:grid-cols-4"
              >
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="w-full rounded-panel border border-line bg-surface-panel px-3 py-2 text-xs focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">
                    Category
                  </label>
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
                    className="flex w-full items-center justify-center gap-2 bg-[#0e7490] py-2 font-semibold text-white hover:bg-[#085f76]"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Generate CSV</span>
                  </Button>
                </div>
              </form>

              {expError && (
                <p className="mt-3 text-xs text-status-critical" role="alert">
                  {expError}
                </p>
              )}

              {exportId && !downloadUrl && (
                <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted" role="status">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                  Generating export… this may take a few seconds.
                </p>
              )}
              {downloadUrl && (
                <p className="mt-3" role="status">
                  <a
                    href={downloadUrl}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
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

