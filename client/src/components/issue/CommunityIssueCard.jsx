import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  ImageOff,
  MapPin,
  Users,
  Wrench,
} from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import ConfirmIssueButton from './ConfirmIssueButton'
import { categoryLabel, useCategories } from '../../hooks/data'
import { shortId, timeAgo, truncate } from '../../lib/format'
import { normalizeMediaUrl } from '../../lib/api'

const SEV_BADGES = {
  critical: { tone: 'critical', label: 'Critical' },
  high: { tone: 'high', label: 'High' },
  medium: { tone: 'medium', label: 'Medium' },
  low: { tone: 'low', label: 'Low' },
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  triaged: 'Under Review',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export default function CommunityIssueCard({ issue, distanceKm = null }) {
  const { data: categories } = useCategories()
  const [imgFailed, setImgFailed] = useState(false)
  const [useOriginal, setUseOriginal] = useState(false)

  const sevKey = (issue.severity?.current || issue.computedSeverity || 'medium').toLowerCase()
  const sevBadge = SEV_BADGES[sevKey] || SEV_BADGES.medium

  const statusKey = issue.status || 'triaged'
  const isSolved = statusKey === 'resolved' || statusKey === 'closed'
  const statusLabel = STATUS_LABELS[statusKey] || statusKey.replace('_', ' ')

  const photo = issue.media?.find((m) => m.thumbnailUrl || m.url)
  const imageSrc = useOriginal
    ? normalizeMediaUrl(photo?.url)
    : normalizeMediaUrl(photo?.thumbnailUrl || photo?.url)

  const catName = categoryLabel(categories, issue.primaryCategory)
  const title =
    truncate(issue.description, 60) ||
    `${catName} Incident`

  const coords = issue.representativeLocation
  const locText = coords?.address
    ? coords.address
    : coords?.lat && coords?.lng
      ? `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`
      : 'Area Sector'

  return (
    <Card
      className={`group flex flex-col justify-between overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        isSolved
          ? 'border-status-resolved/50 ring-1 ring-status-resolved/30 bg-status-resolved/[0.02]'
          : 'border-line'
      }`}
    >
      <div>
        {/* Photo / Media Banner */}
        <Link to={`/citizen/reports/${issue.id}`} className="block relative h-40 bg-surface-sunken overflow-hidden">
          {photo && !imgFailed && imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-100 to-slate-200 text-ink-muted">
              <Wrench className="h-7 w-7 text-primary/60" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-ink-muted capitalize">
                {catName}
              </span>
            </div>
          )}

          {/* Top Left: Severity Badge */}
          <div className="absolute left-2.5 top-2.5">
            <StatusBadge
              pill
              tone={sevBadge.tone}
              label={sevBadge.label}
              className="shadow-xs font-semibold text-black"
            />
          </div>

          {/* Top Right: Status Badge */}
          <div className="absolute right-2.5 top-2.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs capitalize ${
                isSolved
                  ? 'bg-emerald-100 text-black border border-emerald-400'
                  : statusKey === 'in_progress'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-white/90 text-slate-800 backdrop-blur-xs border border-slate-200'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          {/* Bottom Right: Media count indicator */}
          {issue.media && issue.media.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs shadow-xs">
              +{issue.media.length - 1} photos
            </div>
          )}

          {/* Bottom Left: Distance Pill if available */}
          {distanceKm !== null && (
            <div className="absolute bottom-2.5 left-2.5 rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs shadow-xs flex items-center gap-1">
              <MapPin className="h-3 w-3 text-emerald-400" />
              <span>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away</span>
            </div>
          )}
        </Link>

        {/* Card Body */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/citizen/reports/${issue.id}`} className="hover:text-primary transition-colors">
              <h3 className="text-sm font-bold text-ink leading-snug">
                {title}
              </h3>
            </Link>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{locText}</span>
          </div>

          {/* Corroboration summary notice */}
          <div className="mt-3 flex items-center justify-between rounded border border-line/80 bg-surface-sunken/50 px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-ink-muted">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-[11px]">
                <strong className="text-ink">{issue.corroborationCount || 1}</strong> {issue.corroborationCount === 1 ? 'citizen reported' : 'citizens affected'}
              </span>
            </div>
            {issue.reportCount > 1 && (
              <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-semibold text-sky-800">
                {issue.reportCount} reports bundled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions: Me Too Button & Details Link */}
      <div className="border-t border-line/70 px-4 py-3 bg-surface-panel/40 flex items-center justify-between gap-2">
        <ConfirmIssueButton
          issueId={issue.id}
          initialCount={issue.corroborationCount || 1}
          initialConfirmed={issue.hasConfirmed || false}
          size="xs"
        />

        <Link
          to={`/citizen/reports/${issue.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
        >
          <span>Track</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  )
}
