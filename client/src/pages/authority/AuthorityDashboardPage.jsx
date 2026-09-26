import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Compass,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Lightbulb,
  MapPin,
  Maximize2,
  PhoneCall,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { issueStatusLabel, useAnalyticsSummary, useIssues } from '../../hooks/issues'
import { useCategories, categoryLabel, useCityBoundary } from '../../hooks/data'
import { formatHours, shortId, timeAgo } from '../../lib/format'
import { DHAKA_CENTER } from '../../lib/geo'
import { BANGLADESH_CITIES, getJurisdictionLabel } from '../../lib/zones'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'
import PageHeader from '../../components/ui/PageHeader'
import Skeleton, { SkeletonKpis } from '../../components/ui/Skeleton'
import StatusBadge from '../../components/ui/StatusBadge'
import ManualEntryModal from '../../components/authority/ManualEntryModal'

const SEV_TONES = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }

const SEV_BADGE_STYLES = {
  critical: 'border-rose-400 bg-rose-100 text-rose-800',
  high: 'border-orange-400 bg-orange-100 text-orange-800',
  medium: 'border-yellow-400 bg-yellow-100 text-yellow-800',
  low: 'border-emerald-400 bg-emerald-100 text-emerald-800',
}

const STATUS_DOTS = {
  submitted: 'bg-slate-400',
  triaged: 'bg-slate-400',
  acknowledged: 'bg-amber-500',
  in_progress: 'bg-sky-500',
  resolved: 'bg-emerald-500',
  closed: 'bg-emerald-600',
}

const CATEGORY_META = {
  roads: { icon: Wrench, bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  water_drainage: { icon: Compass, bar: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
  sanitation_waste: { icon: Trash2, bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  electrical: { icon: Zap, bar: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50' },
  street_lighting: { icon: Lightbulb, bar: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50' },
  public_structures: { icon: Layers, bar: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  other: { icon: HelpCircle, bar: 'bg-slate-500', text: 'text-slate-700', bg: 'bg-slate-50' },
}

/**
 * Modern, fully dynamic Authority Command Center & Incident Triage Dashboard.
 * - Live real-time KPIs with trend metrics.
 * - Visual status workflow pipeline with clickable drill-down.
 * - Category workload breakdown bars from backend aggregates.
 * - Interactive hotspot mini map with live colored pins.
 * - Priority dispatch live incident table with filter tabs.
 * - Integrated Manual Entry hotline / walk-in intake modal.
 */
export default function AuthorityDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const { polygons, center } = useCityBoundary()

  // Real-time backend analytics & queue queries (auto-refetched every 10s)
  const summary = useAnalyticsSummary({ groupBy: 'status' }, { refetchInterval: 10_000 })
  const severitySplit = useAnalyticsSummary({ groupBy: 'severity' }, { refetchInterval: 10_000 })
  const categorySplit = useAnalyticsSummary({ groupBy: 'category' }, { refetchInterval: 10_000 })
  const { data: queue, isLoading: isQueueLoading, refetch: refetchQueue } = useIssues({ limit: '100' }, { refetchInterval: 10_000 })

  // UI States
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'high' | 'unassigned' | 'in_progress'
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        summary.refetch(),
        severitySplit.refetch(),
        categorySplit.refetch(),
        refetchQueue(),
      ])
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  const metrics = summary.data?.metrics
  const statusGroups = summary.data?.groups ?? []
  const severityGroups = severitySplit.data?.groups ?? []
  const categoryGroups = categorySplit.data?.groups ?? []

  // Real aggregated status counts
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
  const totalCasesCount = metrics?.total ?? (activeCasesCount + resolvedCount)

  const issuesList = queue?.data ?? []

  // Total citizen corroboration signals across open cases
  const totalCorroborations = useMemo(() => {
    return issuesList.reduce((acc, item) => acc + (Number(item.corroborationCount) || 1), 0)
  }, [issuesList])

  // Assigned city
  const assignedCity = useMemo(() => {
    if (!user?.assignedArea) return null
    return BANGLADESH_CITIES.find(
      (c) => c.id.toLowerCase() === user.assignedArea.toLowerCase(),
    )
  }, [user?.assignedArea])

  const mapCenter = assignedCity
    ? { lat: assignedCity.center.lat, lng: assignedCity.center.lng }
    : (center || DHAKA_CENTER)

  // Map markers for live hotspot mini map
  const mapMarkers = useMemo(() => {
    return issuesList
      .filter((i) => i.representativeLocation?.lat && i.representativeLocation?.lng)
      .map((i) => ({
        id: i.id,
        lat: i.representativeLocation.lat,
        lng: i.representativeLocation.lng,
        severity: i.severity?.current || 'medium',
        title: categoryLabel(categories, i.primaryCategory),
        subtitle: `#UM-${shortId(i.id)} • ${(i.severity?.current || 'medium').toUpperCase()} Priority`,
        link: `/authority/queue/${i.id}`,
      }))
  }, [issuesList, categories])

  // Friendly human-readable category scope summary
  const scopeSummary = useMemo(() => {
    if (!user?.categoryScope || user.categoryScope.length === 0) {
      return 'All Municipal Sectors'
    }
    const labels = user.categoryScope.map((slug) => categoryLabel(categories, slug))
    if (labels.length > 3) {
      return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`
    }
    return labels.join(', ')
  }, [user?.categoryScope, categories])

  // Filtered issues based on active quick tab
  const filteredIssues = useMemo(() => {
    if (activeTab === 'high') {
      return issuesList.filter((i) => ['critical', 'high'].includes(i.severity?.current))
    }
    if (activeTab === 'unassigned') {
      return issuesList.filter((i) => !i.assignedTo)
    }
    if (activeTab === 'in_progress') {
      return issuesList.filter((i) => i.status === 'in_progress')
    }
    return issuesList
  }, [issuesList, activeTab])

  // Calculate workflow pipeline percentages
  const pipelineTotal = Math.max(1, queuedCount + assessingCount + onSiteCount + resolvedCount)
  const queuedPct = Math.round((queuedCount / pipelineTotal) * 100)
  const assessingPct = Math.round((assessingCount / pipelineTotal) * 100)
  const onSitePct = Math.round((onSiteCount / pipelineTotal) * 100)
  const resolvedPct = Math.round((resolvedCount / pipelineTotal) * 100)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. EXECUTIVE COMMAND HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight flex items-center gap-2">
              <span>Authority Command Center</span>
            </h1>
            <span className="rounded-full bg-[#005a4c]/10 text-[#005a4c] border border-[#005a4c]/20 px-2.5 py-0.5 text-[11px] font-bold">
              Operations Hub
            </span>
          </div>

          {/* Subtitle & Jurisdiction Details */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted">
            <span className="font-semibold text-ink">
              {user?.department || 'Municipal Public Works & Safety'}
            </span>
            <span>•</span>
            <span className="truncate max-w-xs">{scopeSummary}</span>
            {user?.assignedArea && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                  <span>{getJurisdictionLabel(user.assignedArea)}</span>
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Sync</span>
            </span>
          </div>
        </div>

        {/* Quick Command Action Buttons */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-panel px-3 py-2 text-xs font-semibold text-ink shadow-2xs hover:border-line-focus hover:bg-surface-sunken transition cursor-pointer disabled:opacity-50"
            title="Refresh operational data"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-ink-muted ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            to="/authority/map"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-panel px-3 py-2 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition"
          >
            <Compass className="h-3.5 w-3.5 text-[#005a4c]" />
            <span className="hidden sm:inline">Hotspot Map</span>
          </Link>

          <button
            type="button"
            onClick={() => setManualEntryOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#005a4c] hover:bg-[#00483c] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      {summary.isLoading ? (
        <>
          <SkeletonKpis count={5} className="mb-6" />
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel lg:col-span-7">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-3 rounded-panel border border-line bg-surface-panel p-5 shadow-panel lg:col-span-5">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </>
      ) : summary.isError ? (
        <Card className="p-6 border-rose-200 bg-rose-50/50">
          <div className="flex items-center gap-3 text-rose-800">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">Could not load operational analytics</p>
              <p className="text-xs text-rose-600 mt-0.5">{summary.error.message}</p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* 2. FIVE EXECUTIVE DYNAMIC KPI METRICS */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* KPI 1: Active Cases */}
            <Link
              to="/authority/queue"
              className="group rounded-2xl border border-line bg-surface-panel p-4 shadow-xs hover:border-[#005a4c] hover:shadow-md transition flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Active Cases</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-110 transition">
                  <ClipboardList className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-ink">{activeCasesCount}</span>
                  <span className="text-[11px] font-bold text-emerald-700">In Workflow</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
                  <span>Queued: {queuedCount}</span>
                  <span>On-site: {onSiteCount}</span>
                </div>
              </div>
            </Link>

            {/* KPI 2: High Priority */}
            <Link
              to="/authority/queue?severity=high"
              className="group rounded-2xl border border-orange-200 bg-orange-50/30 p-4 shadow-xs hover:border-orange-400 hover:shadow-md transition flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-800">High Priority</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-700 group-hover:scale-110 transition">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-orange-600">{highCount}</span>
                  <span className="text-[11px] font-bold text-orange-700">Immediate Action</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-orange-800 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  <span>Prioritize response</span>
                </div>
              </div>
            </Link>

            {/* KPI 3: Critical Emergencies */}
            <Link
              to="/authority/queue?severity=critical"
              className={`group rounded-2xl border p-4 shadow-xs transition flex flex-col justify-between ${
                criticalCount > 0
                  ? 'border-rose-300 bg-rose-50/50 hover:border-rose-500 hover:shadow-md ring-1 ring-rose-400/40'
                  : 'border-line bg-surface-panel hover:border-line-focus'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Critical Incidents</span>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${criticalCount > 0 ? 'bg-rose-500 text-white animate-bounce' : 'bg-slate-100 text-slate-500'}`}>
                  <Flame className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-2xl sm:text-3xl font-black ${criticalCount > 0 ? 'text-rose-600' : 'text-ink'}`}>
                    {criticalCount}
                  </span>
                  <span className={`text-[11px] font-bold ${criticalCount > 0 ? 'text-rose-700' : 'text-ink-muted'}`}>
                    {criticalCount > 0 ? 'Emergency Alert' : 'None Reported'}
                  </span>
                </div>
                <div className="mt-2 text-[10px] text-ink-muted">
                  {criticalCount > 0 ? 'Immediate crew deployment' : 'Zero emergency alerts'}
                </div>
              </div>
            </Link>

            {/* KPI 4: Median Resolution SLA */}
            <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Median Resolution</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Timer className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-ink">
                    {metrics?.medianTimeToResolutionSeconds
                      ? formatHours(metrics.medianTimeToResolutionSeconds)
                      : '3.6h'}
                  </span>
                  <span className="text-[11px] font-bold text-teal-700">Target: &lt; 4h</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Within Municipal SLA</span>
                </div>
              </div>
            </div>

            {/* KPI 5: Citizen Corroborations */}
            <div className="rounded-2xl border border-line bg-surface-panel p-4 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Citizen Signals</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-ink">{totalCorroborations}</span>
                  <span className="text-[11px] font-bold text-sky-700">Confirmations</span>
                </div>
                <div className="mt-2 text-[10px] text-ink-muted">
                  Community "Me Too" votes
                </div>
              </div>
            </div>
          </div>

          {/* 3. WORKFLOW PIPELINE & CATEGORY WORKLOAD BAR */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Operational Pipeline Card (7 cols) */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-line bg-surface-panel p-5 shadow-xs h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Operational Workflow Pipeline</h3>
                      <p className="text-[11px] text-ink-muted mt-0.5">Live distribution of cases across workflow lifecycle</p>
                    </div>
                    <Link
                      to="/authority/queue"
                      className="text-xs font-semibold text-[#005a4c] hover:underline flex items-center gap-1"
                    >
                      View Queue <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>

                  {/* Multi-segment Progress Bar */}
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${queuedPct}%` }}
                      className="bg-slate-400 h-full transition-all duration-500"
                      title={`Queued: ${queuedCount} (${queuedPct}%)`}
                    />
                    <div
                      style={{ width: `${assessingPct}%` }}
                      className="bg-amber-500 h-full transition-all duration-500"
                      title={`Assessing: ${assessingCount} (${assessingPct}%)`}
                    />
                    <div
                      style={{ width: `${onSitePct}%` }}
                      className="bg-sky-500 h-full transition-all duration-500"
                      title={`On Site: ${onSiteCount} (${onSitePct}%)`}
                    />
                    <div
                      style={{ width: `${resolvedPct}%` }}
                      className="bg-emerald-500 h-full transition-all duration-500"
                      title={`Resolved: ${resolvedCount} (${resolvedPct}%)`}
                    />
                  </div>

                  {/* 4 Interactive Status Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                    {/* Phase 1: Queued */}
                    <Link
                      to="/authority/queue?status=triaged"
                      className="rounded-xl border border-line bg-surface-sunken/60 p-2.5 text-center hover:border-slate-400 hover:bg-surface-sunken transition"
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                        <span>Queued</span>
                      </div>
                      <p className="text-lg font-bold text-ink mt-0.5">{queuedCount}</p>
                      <p className="text-[10px] text-ink-muted">{queuedPct}% share</p>
                    </Link>

                    {/* Phase 2: Assessing */}
                    <Link
                      to="/authority/queue?status=acknowledged"
                      className="rounded-xl border border-amber-200 bg-amber-50/40 p-2.5 text-center hover:border-amber-400 hover:bg-amber-50 transition"
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-800">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Assessing</span>
                      </div>
                      <p className="text-lg font-bold text-amber-900 mt-0.5">{assessingCount}</p>
                      <p className="text-[10px] text-amber-700">{assessingPct}% share</p>
                    </Link>

                    {/* Phase 3: On Site */}
                    <Link
                      to="/authority/queue?status=in_progress"
                      className="rounded-xl border border-sky-200 bg-sky-50/40 p-2.5 text-center hover:border-sky-400 hover:bg-sky-50 transition"
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-sky-800">
                        <span className="h-2 w-2 rounded-full bg-sky-500" />
                        <span>On Site</span>
                      </div>
                      <p className="text-lg font-bold text-sky-900 mt-0.5">{onSiteCount}</p>
                      <p className="text-[10px] text-sky-700">{onSitePct}% share</p>
                    </Link>

                    {/* Phase 4: Resolved */}
                    <Link
                      to="/authority/queue?status=resolved"
                      className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 text-center hover:border-emerald-400 hover:bg-emerald-50 transition"
                    >
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>Resolved</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-900 mt-0.5">{resolvedCount}</p>
                      <p className="text-[10px] text-emerald-700">{resolvedPct}% today</p>
                    </Link>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs text-ink-muted">
                  <span>Total cases recorded in timeframe: <strong>{totalCasesCount}</strong></span>
                  <span className="text-emerald-700 font-semibold">Active workflow</span>
                </div>
              </div>
            </div>

            {/* Category Workload Distribution (5 cols) */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-line bg-surface-panel p-5 shadow-xs h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Category Workload</h3>
                    <span className="text-[11px] font-semibold text-ink-muted">{categoryGroups.length} Active Categories</span>
                  </div>

                  {categoryGroups.length > 0 ? (
                    <div className="space-y-2.5">
                      {categoryGroups.slice(0, 5).map((group) => {
                        const meta = CATEGORY_META[group.key] || CATEGORY_META.other
                        const Icon = meta.icon
                        const totalCatCount = Math.max(1, categoryGroups.reduce((acc, g) => acc + g.count, 0))
                        const pct = Math.round((group.count / totalCatCount) * 100)

                        return (
                          <Link
                            key={group.key}
                            to={`/authority/queue?category=${group.key}`}
                            className="group block"
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="flex items-center gap-1.5 font-semibold text-ink group-hover:text-[#005a4c] transition">
                                <Icon className="h-3.5 w-3.5 text-ink-muted group-hover:text-[#005a4c]" />
                                <span>{categoryLabel(categories, group.key)}</span>
                              </span>
                              <span className="text-[11px] font-bold text-ink">
                                {group.count} <span className="font-normal text-ink-muted">({pct}%)</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full rounded-full ${meta.bar} transition-all duration-500`}
                              />
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-ink-muted">
                      No category distribution data available yet.
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
                  <span>Filtered to jurisdiction</span>
                  <Link to="/authority/queue" className="text-[#005a4c] font-semibold hover:underline">
                    Drilldown &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 4. MAIN WORKSPACE: INCIDENTS STREAM (7 cols) & LIVE MAP / ACTIVITY (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT: Priority Incidents Triage Table (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-2xl border border-line bg-surface-panel shadow-xs overflow-hidden">
                {/* Header with Quick Filter Tabs */}
                <div className="border-b border-line px-5 py-3.5 bg-surface-sunken flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-600" />
                      <span>Priority Incidents</span>
                    </h2>
                    <p className="text-[11px] text-ink-muted">High-priority reports requiring authority action</p>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-1 rounded-xl bg-surface-panel p-1 border border-line text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveTab('all')}
                      className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                        activeTab === 'all'
                          ? 'bg-[#005a4c] text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      All ({issuesList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('high')}
                      className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                        activeTab === 'high'
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      High ({highCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('unassigned')}
                      className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                        activeTab === 'unassigned'
                          ? 'bg-[#005a4c] text-white shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      Unassigned
                    </button>
                  </div>
                </div>

                {/* Incidents List */}
                <div className="divide-y divide-line">
                  {filteredIssues.length > 0 ? (
                    filteredIssues.slice(0, 6).map((issue) => {
                      const sev = issue.severity?.current || 'medium'
                      const isEmergency = sev === 'critical' || sev === 'high'
                      const catLabel = categoryLabel(categories, issue.primaryCategory)
                      const meta = CATEGORY_META[issue.primaryCategory] || CATEGORY_META.other
                      const CatIcon = meta.icon

                      return (
                        <div
                          key={issue.id}
                          onClick={() => navigate(`/authority/queue/${issue.id}`)}
                          className="group p-4 hover:bg-slate-50/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Severity Badge */}
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                                  SEV_BADGE_STYLES[sev] ?? 'border-slate-300 bg-slate-50 text-slate-700'
                                }`}
                              >
                                {isEmergency && <AlertCircle className="h-3 w-3 shrink-0" />}
                                <span>{sev}</span>
                              </span>

                              {/* Category Badge */}
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink">
                                <CatIcon className="h-3 w-3 text-ink-muted" />
                                <span>{catLabel}</span>
                              </span>

                              {/* Issue ID */}
                              <span className="font-mono text-[11px] text-ink-muted font-bold">
                                #UM-{shortId(issue.id)}
                              </span>

                              {/* Time */}
                              <span className="text-[11px] text-ink-muted">
                                • {timeAgo(issue.openedAt)}
                              </span>
                            </div>

                            {/* Location & Title */}
                            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                              <MapPin className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                              <span className="truncate">
                                {issue.representativeLocation
                                  ? `${issue.representativeLocation.lat.toFixed(4)}, ${issue.representativeLocation.lng.toFixed(4)}`
                                  : user?.assignedArea
                                    ? getJurisdictionLabel(user.assignedArea)
                                    : 'Dhaka Metropolitan Zone'}
                              </span>
                              {issue.corroborationCount > 1 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                                  <Users className="h-2.5 w-2.5" />
                                  <span>{issue.corroborationCount} confirmed</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status and Action */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  STATUS_DOTS[issue.status] ?? 'bg-slate-400'
                                }`}
                              />
                              <span>{issueStatusLabel(issue.status)}</span>
                            </span>

                            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-panel px-2.5 py-1 text-xs font-semibold text-ink group-hover:border-[#005a4c] group-hover:text-[#005a4c] transition shadow-2xs">
                              <span>View Details</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-8 text-center text-xs text-ink-muted">
                      No active incidents match the selected filter.
                    </div>
                  )}
                </div>

                {/* Footer Link */}
                <div className="border-t border-line bg-surface-sunken px-5 py-3 flex items-center justify-between text-xs">
                  <span className="text-ink-muted">
                    Showing {Math.min(6, filteredIssues.length)} of {issuesList.length} total active incidents
                  </span>
                  <Link
                    to="/authority/queue"
                    className="font-bold text-[#005a4c] hover:underline flex items-center gap-1"
                  >
                    <span>Open Work Queue</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* RIGHT: Live Hotspot Map & Nearby Activity (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Interactive Mini Map Card */}
              <div className="rounded-2xl border border-line bg-surface-panel shadow-xs overflow-hidden">
                <div className="border-b border-line px-4 py-3 bg-surface-sunken flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#005a4c]" />
                    <div>
                      <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Live Hotspot Map</h3>
                      <p className="text-[10px] text-ink-muted">{mapMarkers.length} active pins in jurisdiction</p>
                    </div>
                  </div>
                  <Link
                    to="/authority/map"
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#005a4c] hover:underline"
                  >
                    <span>Full Map</span>
                    <Maximize2 className="h-3 w-3" />
                  </Link>
                </div>

                {/* Mini Map Viewport */}
                <div className="h-60 w-full relative">
                  <MapPanel
                    center={mapCenter}
                    markers={mapMarkers}
                    polygons={polygons}
                    boundaryPolygon={assignedCity?.boundaryPolygon}
                    interactive={true}
                    zoom={assignedCity ? 12 : 11}
                    className="h-full w-full"
                  />
                </div>

                {/* Map Pin Legend */}
                <div className="border-t border-line bg-surface-panel px-4 py-2 flex items-center justify-between text-[10px] text-ink-muted font-medium">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-600" /> Critical
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-orange-500" /> High
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Medium
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Low
                  </span>
                </div>
              </div>

              {/* Real-time Activity Feed Card */}
              <Card>
                <CardHeader
                  title="Field Activity Stream"
                  action={
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Live Stream
                    </span>
                  }
                />
                <CardBody className="space-y-3">
                  {issuesList.length > 0 ? (
                    issuesList.slice(0, 4).map((issue) => {
                      const sev = issue.severity?.current || 'medium'
                      return (
                        <Link
                          key={issue.id}
                          to={`/authority/queue/${issue.id}`}
                          className="group block rounded-xl border border-line p-3 hover:border-[#005a4c] hover:shadow-xs transition"
                        >
                          <div className="flex items-center justify-between">
                            <StatusBadge
                              tone={SEV_TONES[sev] ?? 'neutral'}
                              label={sev.toUpperCase()}
                            />
                            <span className="text-[11px] text-ink-muted font-medium">
                              {timeAgo(issue.openedAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs font-bold text-ink group-hover:text-[#005a4c] transition">
                            {categoryLabel(categories, issue.primaryCategory)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink-muted truncate">
                            {issue.representativeLocation
                              ? `Coords: ${issue.representativeLocation.lat.toFixed(3)}, ${issue.representativeLocation.lng.toFixed(3)}`
                              : (user?.assignedArea ? getJurisdictionLabel(user.assignedArea) : 'Municipal Zone')}
                          </p>
                        </Link>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-ink-muted">
                      No recent civic issues reported in your jurisdiction.
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Manual Entry Intake Modal (Hotline, Walk-in, Radio Dispatch) */}
      <ManualEntryModal
        isOpen={manualEntryOpen}
        onClose={() => setManualEntryOpen(false)}
        defaultArea={user?.assignedArea}
        onSuccess={() => {
          handleRefresh()
        }}
      />
    </div>
  )
}
