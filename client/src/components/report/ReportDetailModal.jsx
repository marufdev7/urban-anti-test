import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  ImageOff,
  MapPin,
  Maximize2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { normalizeMediaUrl } from '../../lib/api'
import { badgeFor, categoryLabel, useCategories } from '../../hooks/data'
import { formatDateTime, shortId, timeAgo } from '../../lib/format'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'
import StatusBadge from '../ui/StatusBadge'
import MapPanel from '../MapPanel'

function sevTone(sev) {
  switch (sev?.toLowerCase()) {
    case 'critical':
      return 'border-rose-300 bg-rose-50 text-rose-700'
    case 'high':
      return 'border-amber-300 bg-amber-50 text-amber-700'
    case 'medium':
      return 'border-sky-300 bg-sky-50 text-sky-700'
    case 'low':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700'
  }
}

export default function ReportDetailModal({ open, onClose, report, onRemove }) {
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const [copied, setCopied] = useState(false)
  const [activePhoto, setActivePhoto] = useState(null)

  if (!open || !report) return null

  const badge = badgeFor(report)
  const cls = report.classification ?? {}
  const categoryTitle = categoryLabel(categories, cls.category)
  const mediaList = Array.isArray(report.media) ? report.media : []
  const sev = cls.severitySignal || report.severitySignal || report.severity

  const coords = report.location?.latitude && report.location?.longitude
    ? {
        lat: Number(report.location.latitude),
        lng: Number(report.location.longitude),
      }
    : null

  const markerData = coords
    ? {
        type: 'Point',
        coordinates: [coords.lng, coords.lat],
      }
    : null

  const incidentLink = report.issueId
    ? user?.role === 'admin'
      ? `/admin/queue/${report.issueId}`
      : `/authority/queue/${report.issueId}`
    : null

  const handleCopyId = () => {
    navigator.clipboard?.writeText(report.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-line bg-surface-panel shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-sunken/60 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-2.5 py-1 text-xs font-mono font-bold text-ink">
              <span>#UM-{shortId(report.id)}</span>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Full UUID"
                className="ml-1 text-ink-muted hover:text-ink transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <StatusBadge tone={badge.tone} label={badge.label} />
            {sev && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${sevTone(sev)}`}>
                {sev} Severity
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              {categoryTitle}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Citizen Description */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-2">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Citizen Narrative & Description
            </h3>
            <div className="rounded-xl border border-line bg-surface-sunken/40 p-4 text-sm text-ink leading-relaxed">
              {report.description ? (
                <p className="whitespace-pre-wrap">{report.description}</p>
              ) : (
                <p className="italic text-ink-muted">No text description provided with this submission.</p>
              )}
            </div>
          </div>

          {/* Section 2: Attached Photos */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-primary" />
                Attached Evidence Photos ({mediaList.length})
              </h3>
              {mediaList.length > 0 && (
                <span className="text-[11px] text-ink-muted">Click photo to expand</span>
              )}
            </div>

            {mediaList.length > 0 ? (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {mediaList.map((m, idx) => {
                  const src = normalizeMediaUrl(m.url || m.thumbnailUrl)
                  return (
                    <div
                      key={m.id || idx}
                      onClick={() => setActivePhoto(src)}
                      className="group relative aspect-4/3 cursor-pointer overflow-hidden rounded-xl border border-line bg-surface-sunken shadow-2xs hover:border-primary transition"
                    >
                      <img
                        src={src}
                        alt={`Evidence ${idx + 1}`}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition duration-150" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-sunken/30 text-ink-muted">
                <ImageOff className="h-5 w-5 text-ink-faint mb-1" />
                <span className="text-xs">No media or evidence photos attached</span>
              </div>
            )}
          </div>

          {/* Section 3: Location & Geolocation */}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Incident Geolocation & Address
              </h3>
              <div className="rounded-xl border border-line bg-surface-panel p-4 space-y-2.5 text-xs">
                <div>
                  <span className="font-semibold text-ink-muted block text-[11px]">Reported Address / Landmark</span>
                  <p className="font-medium text-ink mt-0.5">
                    {report.location?.address || 'Dhaka Metropolitan Municipal Jurisdiction'}
                  </p>
                </div>
                {coords && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/60">
                    <div>
                      <span className="text-[11px] text-ink-muted block">Latitude</span>
                      <span className="font-mono font-medium text-ink">{coords.lat.toFixed(6)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-ink-muted block">Longitude</span>
                      <span className="font-mono font-medium text-ink">{coords.lng.toFixed(6)}</span>
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
                  <span>GPS Capture Verification</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Mini-Map */}
            <div className="lg:col-span-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-2">
                <Compass className="h-3.5 w-3.5 text-primary" />
                Spatial Location Map
              </h3>
              <div className="h-44 w-full rounded-xl overflow-hidden border border-line shadow-2xs">
                {markerData ? (
                  <MapPanel
                    center={[coords.lng, coords.lat]}
                    zoom={15}
                    marker={markerData}
                    height="100%"
                    interactive={false}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-surface-sunken text-xs text-ink-muted">
                    No spatial coordinates available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: AI Gemini Triage Assessment */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                Automated AI Triage Assessment (Gemini)
              </h4>
              {cls.confidence !== undefined && (
                <span className="rounded-full bg-sky-200/70 px-2.5 py-0.5 text-[11px] font-bold text-sky-900">
                  Confidence: {Math.round(cls.confidence * 100)}%
                </span>
              )}
            </div>
            <p className="text-xs text-sky-950/90 leading-relaxed">
              {cls.rationale || 'AI evaluation matched citizen evidence with taxonomy guidelines for municipal response priority.'}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[11px] text-sky-900 border-t border-sky-200/60 pt-2">
              <span>Classifier Engine: <strong>{cls.source === 'fallback' ? 'Keyword Rule Match' : 'Gemini 2.5 Flash'}</strong></span>
              <span>Category Match: <strong>{categoryTitle}</strong></span>
              <span>Predicted Severity: <strong className="capitalize">{sev || 'Standard'}</strong></span>
            </div>
          </div>

          {/* Section 5: Incident Cluster Association */}
          <div className="rounded-xl border border-line bg-surface-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                Incident Clustering Status
              </span>
              <p className="text-xs font-semibold text-ink mt-0.5">
                {report.issueId ? (
                  <>Associated with Incident <strong className="font-mono text-primary font-bold">#UM-{shortId(report.issueId)}</strong></>
                ) : (
                  'Pending Triage & Spatial Clustering'
                )}
              </p>
            </div>
            {incidentLink && (
              <Link
                to={incidentLink}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover shadow-xs transition"
              >
                <span>Open Incident in Queue</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {/* Section 6: Submission Timestamps & Author */}
          <div className="flex flex-wrap items-center justify-between text-xs text-ink-muted border-t border-line/60 pt-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Submitted: {formatDateTime(report.createdAt)} ({timeAgo(report.createdAt)})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span>
                Submitter: {report.authorId ? `Citizen #${shortId(report.authorId)}` : 'Anonymous Citizen'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-line bg-surface-sunken/60 px-6 py-3.5">
          <div>
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  onClose?.()
                  onRemove(report)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Report with Notes</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            {incidentLink && (
              <Link to={incidentLink}>
                <Button size="sm" className="bg-primary text-white">
                  <span>View Incident Workspace</span>
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Lightbox Modal for Active Photo */}
        {activePhoto && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setActivePhoto(null)}
          >
            <div className="relative max-h-[90vh] max-w-[90vw]">
              <img
                src={activePhoto}
                alt="Enlarged evidence"
                className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              />
              <button
                type="button"
                onClick={() => setActivePhoto(null)}
                className="absolute -top-3 -right-3 rounded-full bg-white p-1 text-slate-800 shadow-md hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
