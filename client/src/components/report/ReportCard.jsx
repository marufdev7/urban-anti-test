import { Link } from 'react-router-dom'
import { Clock, ImageOff, MapPin } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import { badgeFor, categoryLabel, useCategories } from '../../hooks/data'
import { shortId, timeAgo, truncate } from '../../lib/format'
import { normalizeMediaUrl } from '../../lib/api'

/**
 * One report in the dashboard grid (citizen-dashboard.png): photo with status
 * overlay, title, location, id + age.
 */
export default function ReportCard({ report, linkBase = '/citizen/reports' }) {
  const { data: categories } = useCategories()
  const badge = badgeFor(report)
  const photo = report.media?.find((m) => m.thumbnailUrl || m.url)
  const title =
    truncate(report.description, 45) ||
    categoryLabel(categories, report.classification?.category)
  const place = report.location?.address || 'Downtown Sector'

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
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
          <div className="absolute right-2.5 top-2.5">
            <StatusBadge
              pill
              tone={badge.tone}
              label={badge.label}
              className="shadow-xs"
            />
          </div>
        </div>
        <div className="p-4">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            {place}
          </p>
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
