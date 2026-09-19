import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, ImageOff, MapPin } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import { badgeFor, categoryLabel, isReportSolved, severityBadgeFor, useCategories } from '../../hooks/data'
import { shortId, timeAgo, truncate } from '../../lib/format'
import { normalizeMediaUrl } from '../../lib/api'

/**
 * One report in the dashboard grid: photo with status & severity badges,
 * title, location, id + age, and clear resolution verification.
 */
export default function ReportCard({ report, linkBase = '/citizen/reports' }) {
  const { data: categories } = useCategories()
  const badge = badgeFor(report)
  const sevBadge = severityBadgeFor(report)
  const isSolved = isReportSolved(report)
  const photo = report.media?.find((m) => m.thumbnailUrl || m.url)
  const title =
    truncate(report.description, 45) ||
    categoryLabel(categories, report.classification?.category)
  const place = report.location?.address?.trim() || 'Dhaka Sector'

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${isSolved ? 'border-status-resolved/50 ring-1 ring-status-resolved/30 bg-status-resolved/[0.02]' : ''}`}>
      <Link to={`${linkBase}/${report.id}`} className="block">
        <div className="relative h-40 bg-surface-sunken">
          {photo ? (
            <img
              src={normalizeMediaUrl(photo.thumbnailUrl || photo.url)}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-faint">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
            </div>
          )}

          {/* Left: Severity Level Indicator */}
          {sevBadge && (
            <div className="absolute left-2.5 top-2.5">
              <StatusBadge
                pill
                tone={sevBadge.tone}
                label={sevBadge.label}
                className="shadow-xs font-semibold"
              />
            </div>
          )}

          {/* Right: Authoritative Resolution / Lifecycle Status */}
          <div className="absolute right-2.5 top-2.5">
            <StatusBadge
              pill
              tone={badge.tone}
              label={badge.label}
              className={`shadow-xs font-bold ${isSolved ? 'bg-emerald-600 text-white border-emerald-700' : ''}`}
            />
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          </div>

          <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            {place}
          </p>

          {/* Prominent Solved Verification Banner */}
          {isSolved ? (
            <div className="mt-2.5 flex items-center gap-1.5 rounded border border-status-resolved/30 bg-status-resolved/10 px-2 py-1 text-[11px] font-bold text-status-resolved">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Problem Solved &amp; Verified</span>
            </div>
          ) : badge.label === 'In Progress' ? (
            <div className="mt-2.5 flex items-center gap-1.5 rounded border border-primary/30 bg-primary-soft px-2 py-1 text-[11px] font-semibold text-primary">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              <span>Repair Work in Progress</span>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-faint">
            <span className="font-mono">ID: UM-{shortId(report.id)}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {timeAgo(report.createdAt)}
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}
