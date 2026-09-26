import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  MapPin,
  PlusCircle,
} from 'lucide-react'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import ReportCard from '../../components/report/ReportCard'
import CommunityIssueCard from '../../components/issue/CommunityIssueCard'
import { useAuth } from '../../auth/AuthContext'

/** Haversine distance in km between two {lat, lng} points. */
function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371 // Earth's radius in km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Citizen dashboard with real live database data. */
export default function DashboardPage() {
  const { user } = useAuth()
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
  // Detect citizen's GPS location for proximity filtering
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, // silently ignore if denied
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
      )
    }
  }, [])

  // Nearby Activity: computed from community issues so other citizens' reports appear!
  const { nearbyItems, nearbyRadiusKm } = useMemo(() => {
    const list = issues.length > 0 ? issues : []
    if (list.length === 0) {
      return { nearbyItems: [], nearbyRadiusKm: null }
    }

    if (!userLocation) {
      return {
        nearbyItems: list.slice(0, 6).map((issue) => ({ issue, distance: null })),
        nearbyRadiusKm: null,
      }
    }

    // Attach distance to each issue that has representativeLocation
    const withDistance = list
      .map((issue) => {
        const loc = issue.representativeLocation
        if (loc?.lat && loc?.lng) {
          return {
            issue,
            distance: haversineKm(userLocation, { lat: loc.lat, lng: loc.lng }),
          }
        }
        return { issue, distance: 9999 }
      })
      .sort((a, b) => a.distance - b.distance)

    // Try 1 km first
    const within1km = withDistance.filter((item) => item.distance <= 1)
    if (within1km.length > 0) {
      return { nearbyItems: within1km.slice(0, 6), nearbyRadiusKm: 1 }
    }

    // Fallback to 5 km
    const within5km = withDistance.filter((item) => item.distance <= 5)
    if (within5km.length > 0) {
      return { nearbyItems: within5km.slice(0, 6), nearbyRadiusKm: 5 }
    }

    // Fallback to closest available
    return {
      nearbyItems: withDistance.slice(0, 6).map((item) => ({
        issue: item.issue,
        distance: item.distance < 9000 ? item.distance : null,
      })),
      nearbyRadiusKm: null,
    }
  }, [issues, userLocation])

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {user?.fullName ? `Welcome back, ${user.fullName}!` : 'Overview'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Monitor public safety reports and track community resilience efforts.
          </p>
        </div>
        {user?.photoUrl && (
          <div className="hidden sm:flex items-center gap-2.5 rounded-full border border-line bg-surface-panel p-1.5 pr-3.5 shadow-xs">
            <img
              src={user.photoUrl}
              alt={user.fullName || 'User'}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full object-cover border border-line"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <span className="text-xs font-semibold text-ink">{user.fullName}</span>
          </div>
        )}
      </div>

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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">Nearby Activity</h2>
            {nearbyRadiusKm && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#005a4c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#005a4c]">
                <MapPin className="h-3 w-3" />
                {nearbyRadiusKm} km
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            {nearbyRadiusKm === 1
              ? 'Community issues within 1 km of your location.'
              : nearbyRadiusKm === 5
                ? 'No issues within 1 km — showing community issues within 5 km.'
                : 'Recent community infrastructure issues reported in your district.'}
          </p>
        </div>
        <Link
          to="/citizen/map"
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          View all on Map
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {nearbyItems.length === 0 ? (
        <Card className="p-8 text-center">
          <EmptyState
            title="No nearby issues found"
            message="Civic infrastructure issues reported in your district will appear here."
            action={
              <Link to="/citizen/reports/new">
                <Button size="sm">Report a Problem</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {nearbyItems.map(({ issue, distance }) => (
            <CommunityIssueCard
              key={issue.id}
              issue={issue}
              distanceKm={distance}
            />
          ))}
        </div>
      )}
    </div>
  )
}
