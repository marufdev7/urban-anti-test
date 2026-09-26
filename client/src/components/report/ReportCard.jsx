import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, ImageOff, MapPin } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import { badgeFor, categoryLabel, isReportSolved, severityBadgeFor, useCategories } from '../../hooks/data'
import { shortId, timeAgo, truncate } from '../../lib/format'
import { normalizeMediaUrl } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'

/**
 * One report in the dashboard grid: photo with status & severity badges,
 * title, location, id + age, and clear resolution verification.
 */
export default function ReportCard({ report, linkBase = '/citizen/reports' }) {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const badge = badgeFor(report)
  const sevBadge = severityBadgeFor(report)
  const isSolved = isReportSolved(report)

  const issueStatus = report?.issueStatus || report?.issue?.status
  const isAcknowledged =
    issueStatus === 'acknowledged' ||
    issueStatus === 'in_progress' ||
    issueStatus === 'resolved' ||
    issueStatus === 'closed' ||
    issueStatus === 'rejected' ||
    report?.status === 'resolved'
  const isEditable =
    report?.isEditable !== undefined
      ? report.isEditable
      : !isAcknowledged && report?.status !== 'hidden' && report?.status !== 'removed'

  const isAuthor = Boolean(user?.id && report?.authorId && String(user.id) === String(report.authorId))
  const canEdit = isAuthor && isEditable

  const photo = report.media?.find((m) => m.thumbnailUrl || m.url)
  const [imgFailed, setImgFailed] = useState(false)
  const [useOriginal, setUseOriginal] = useState(false)

  const title =
    truncate(report.description, 45) ||
    categoryLabel(categories, report.classification?.category)
  const place = report.location?.address?.trim() || 'Dhaka Sector'

  const imageSrc = useOriginal
    ? normalizeMediaUrl(photo?.url)
    : normalizeMediaUrl(photo?.thumbnailUrl || photo?.url)

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${isSolved ? 'border-status-resolved/50 ring-1 ring-status-resolved/30 bg-status-resolved/[0.02]' : ''}`}>
      <Link to={`${linkBase}/${report.id}`} className="block">
        <div className="relative h-40 bg-surface-sunken">
          {photo && !imgFailed && imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => {
                if (!useOriginal && photo?.url && photo?.thumbnailUrl && photo.url !== photo.thumbnailUrl) {
                  setUseOriginal(true)
                } else {
                  setImgFailed(true)
                }
              }}
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
                className="shadow-xs font-semibold text-black"
              />
            </div>
          )}

          {/* Right: Authoritative Resolution / Lifecycle Status */}
          <div className="absolute right-2.5 top-2.5">
            <StatusBadge
              pill
              tone={badge.tone}
              label={badge.label}
              className={`shadow-xs font-bold text-black ${
                isSolved
                  ? 'bg-emerald-100 text-black border-emerald-400'
                  : 'text-black'
              }`}
            />
          </div>

          {/* Multiple Photos Count Indicator */}
          {report.media && report.media.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs shadow-xs">
              +{report.media.length - 1} photos
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
            {canEdit && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200" title="Editable until authority acknowledges">
                ✎ Editable
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            {place}
          </p>

          {/* Prominent Solved Verification Banner */}
          {isSolved ? (
            <div className="mt-2.5 flex items-center gap-1.5 rounded border border-status-resolved/40 bg-status-resolved/10 px-2 py-1 text-[11px] font-bold text-black">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-resolved" />
              <span className="text-black font-bold">Problem Solved &amp; Verified</span>
            </div>
          ) : badge.label === 'In Progress' ? (
            <div className="mt-2.5 flex items-center gap-1.5 rounded border border-primary/30 bg-primary-soft px-2 py-1 text-[11px] font-semibold text-black">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              <span className="text-black font-semibold">Repair Work in Progress</span>
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
