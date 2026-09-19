import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  Camera,
  Check,
  Crosshair,
  Leaf,
  Loader2,
  MapPin,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api, apiUpload, ApiError } from '../../lib/api'
import { mediaErrorMessage, useCategories, useCityBoundary } from '../../hooks/data'
import { forwardGeocode, isPointInBoundary, reverseGeocode } from '../../lib/geo'
import { shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'

const MIN_DESCRIPTION = 15
const STEPS = ['Category', 'Details', 'Review']

const CATEGORY_MAP = {
  infrastructure: 'roads',
  environmental: 'water_drainage',
}

/**
 * Citizen Report Submission Wizard matching media_1789770150954.png pixel-for-pixel:
 * - Live click & drag pinpointing on map with instant reverse-geocoded address.
 * - Working crosshair location detector & address search.
 * - Stepper with circular badges and text below.
 * - Split-screen layout: left form card, right interactive pinpoint map.
 * - Issue Category tiles: Infrastructure Hazard & Environmental.
 * - Description input with BR-3 validation.
 * - Upload dropzone with camera icon + Privacy Protection Active box.
 */
export default function ReportWizardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)

  const step = location.pathname.endsWith('/details')
    ? 1
    : location.pathname.endsWith('/review')
      ? 2
      : 0

  const { data: categories } = useCategories()
  const boundaryQuery = useCityBoundary()
  const { center, polygons } = boundaryQuery

  // Stable idempotency key for this wizard session (FRONT-PLAN §9.2)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const [categoryGroup, setCategoryGroup] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).categoryGroup ?? 'infrastructure' : 'infrastructure'
    } catch {
      return 'infrastructure'
    }
  })

  const [category, setCategory] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).category ?? 'roads' : 'roads'
    } catch {
      return 'roads'
    }
  })

  const [marker, setMarker] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).marker ?? null : null
    } catch {
      return null
    }
  })

  const [address, setAddress] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).address ?? '' : ''
    } catch {
      return ''
    }
  })

  const [isLocating, setIsLocating] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)

  const [description, setDescription] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).description ?? '' : ''
    } catch {
      return ''
    }
  })

  const [photos, setPhotos] = useState([]) // [{localId, preview, mediaId, state, error}]
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null) // 202 acknowledgement

  const activeMarker = marker ?? center

  // Auto-detect citizen's precise GPS location on mount (or geocode center if permission denied)
  useEffect(() => {
    const isPlaceholder = !address || address.includes('4th Ave & Pike St')

    if (navigator.geolocation) {
      setIsLocating(true)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setMarker(userLoc)
          setIsLocating(false)
          setIsGeocoding(true)
          const resolved = await reverseGeocode(userLoc.lat, userLoc.lng)
          if (resolved) setAddress(resolved)
          setIsGeocoding(false)
        },
        () => {
          setIsLocating(false)
          if (isPlaceholder && activeMarker?.lat && activeMarker?.lng) {
            setIsGeocoding(true)
            reverseGeocode(activeMarker.lat, activeMarker.lng)
              .then((addr) => {
                if (addr) setAddress(addr)
              })
              .finally(() => setIsGeocoding(false))
          }
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 },
      )
    } else if (isPlaceholder && activeMarker?.lat && activeMarker?.lng) {
      setIsGeocoding(true)
      reverseGeocode(activeMarker.lat, activeMarker.lng)
        .then((addr) => {
          if (addr) setAddress(addr)
        })
        .finally(() => setIsGeocoding(false))
    }
  }, [])

  // Autosave draft to localStorage
  useEffect(() => {
    try {
      if (category || marker || address || description || categoryGroup) {
        localStorage.setItem(
          'urbanmend_report_draft',
          JSON.stringify({ categoryGroup, category, marker, address, description }),
        )
      }
    } catch {
      // ignore storage quota or disabled storage
    }
  }, [categoryGroup, category, marker, address, description])

  // Boundary validation (FRONT-PLAN §9.2, prevent 422 OUT_OF_CITY)
  const isInsideBoundary = useMemo(
    () => isPointInBoundary(activeMarker, boundaryQuery.data),
    [activeMarker, boundaryQuery.data],
  )

  // BR-3: at least one of description (min 15 chars) or media is required.
  const hasValidContent = photos.length > 0 || description.trim().length >= MIN_DESCRIPTION
  const canSubmit = Boolean(category && activeMarker && isInsideBoundary && hasValidContent)

  const handleSelectGroup = (group) => {
    setCategoryGroup(group)
    setCategory(CATEGORY_MAP[group] || 'roads')
  }

  // Handle marker change from map click or marker drag: updates coordinates and automatically reverse-geocodes address
  const handleMarkerChange = async (newPos) => {
    setMarker(newPos)
    setIsGeocoding(true)
    const resolvedAddress = await reverseGeocode(newPos.lat, newPos.lng)
    if (resolvedAddress) {
      setAddress(resolvedAddress)
    }
    setIsGeocoding(false)
  }

  // Use browser GPS geolocation to pinpoint marker
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMarker(newLoc)
        setIsLocating(false)
        setIsGeocoding(true)
        const resolvedAddress = await reverseGeocode(newLoc.lat, newLoc.lng)
        if (resolvedAddress) setAddress(resolvedAddress)
        setIsGeocoding(false)
      },
      (err) => {
        setIsLocating(false)
        console.warn('Geolocation error:', err)
        alert('Could not access your location. Please click anywhere on the map to place your pin.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  // Search address typed in the floating box
  const handleSearchAddress = async (e) => {
    e?.preventDefault()
    if (!address?.trim()) return
    setIsGeocoding(true)
    const found = await forwardGeocode(address)
    if (found) {
      setMarker({ lat: found.lat, lng: found.lng })
      setAddress(found.displayName)
    } else {
      alert('Address not found. Please click directly on the map to position your pin.')
    }
    setIsGeocoding(false)
  }

  const addPhotos = (files) => {
    const room = 3 - photos.length
    if (room <= 0) return
    files.slice(0, Math.max(0, room)).forEach((file) => {
      const localId = crypto.randomUUID()
      const entry = {
        localId,
        preview: URL.createObjectURL(file),
        mediaId: null,
        state: 'uploading',
        error: null,
      }
      setPhotos((list) => [...list, entry])
      apiUpload('/media', file)
        .then((media) =>
          setPhotos((list) =>
            list.map((p) =>
              p.localId === localId ? { ...p, mediaId: media.id, state: 'ready' } : p,
            ),
          ),
        )
        .catch((err) =>
          setPhotos((list) =>
            list.map((p) =>
              p.localId === localId
                ? { ...p, state: 'error', error: mediaErrorMessage(err) }
                : p,
            ),
          ),
        )
    })
  }

  const removePhoto = (index) => {
    setPhotos((list) => {
      const removed = list[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return list.filter((_, i) => i !== index)
    })
  }

  const submit = useMutation({
    mutationFn: () =>
      api('/reports', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          description: description.trim(),
          location: { lng: activeMarker.lng, lat: activeMarker.lat },
          address: address.trim(),
          category,
          mediaIds: photos.filter((p) => p.mediaId).map((p) => p.mediaId),
          language: 'en',
        },
      }),
    onSuccess: (ack) => {
      try {
        localStorage.removeItem('urbanmend_report_draft')
      } catch {}
      setSubmitted(ack)
    },
    onError: (err) => setSubmitError(submitErrorMessage(err)),
  })

  const categoryMeta = categories?.find((c) => c.key === category)
  const readyPhotos = photos.filter((p) => p.state === 'ready')
  const uploading = photos.some((p) => p.state === 'uploading')

  // ---- Confirmation state (after 202) --------------------------------------
  if (submitted) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="p-8 text-center rounded-2xl shadow-sm border border-line">
          <ShieldCheck className="mx-auto mb-4 h-14 w-14 text-[#005a4c]" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-ink">Report submitted</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your report ID is{' '}
            <span className="font-mono font-bold text-ink">UM-{shortId(submitted.reportId)}</span>.
            Our AI system will review and classify it, and an authority will inspect it shortly.
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Full reference: {submitted.reportId}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/citizen/dashboard')}
              className="border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Back to Dashboard
            </Button>
            <Button
              onClick={() => navigate(`/citizen/reports/${submitted.reportId}`)}
              className="bg-[#005a4c] text-white hover:bg-[#004a3e]"
            >
              Track this report
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Title & Subtitle */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Submit New Report</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Please provide details about the public safety issue. Your privacy is protected.
        </p>
      </div>

      {/* Stepper with circular badges and text labels below (media_1789770150954.png) */}
      <div className="mb-6 flex items-center gap-10 sm:gap-14">
        {STEPS.map((label, idx) => {
          const isActive = idx === step
          const isDone = idx < step
          return (
            <div key={label} className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-[#005a4c] text-white shadow-xs ring-2 ring-[#005a4c]/20'
                    : isDone
                      ? 'bg-[#005a4c] text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={`mt-1.5 text-xs font-semibold ${
                  isActive || isDone ? 'text-[#005a4c]' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Two-Column Split Screen: Form on Left, Map on Right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
        {/* Left Form Card */}
        <div className="rounded-2xl border border-line bg-surface-panel p-6 shadow-xs">
          {/* STEP 0: Category, Description & Photos */}
          {step === 0 && (
            <div className="space-y-5">
              {/* Issue Category */}
              <div>
                <label className="mb-2.5 block text-sm font-semibold text-ink">Issue Category</label>
                <div className="grid grid-cols-2 gap-3.5">
                  {/* Infrastructure Hazard Tile */}
                  <button
                    type="button"
                    onClick={() => handleSelectGroup('infrastructure')}
                    className={`flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all ${
                      categoryGroup === 'infrastructure'
                        ? 'border-2 border-[#005a4c] bg-white ring-1 ring-[#005a4c]/20 shadow-xs'
                        : 'border-line bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      categoryGroup === 'infrastructure' ? 'text-[#005a4c]' : 'text-slate-400'
                    }`}>
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-ink leading-tight">Infrastructure Hazard</span>
                  </button>

                  {/* Environmental Tile */}
                  <button
                    type="button"
                    onClick={() => handleSelectGroup('environmental')}
                    className={`flex items-center gap-3.5 rounded-xl border p-4 text-left transition-all ${
                      categoryGroup === 'environmental'
                        ? 'border-2 border-[#005a4c] bg-white ring-1 ring-[#005a4c]/20 shadow-xs'
                        : 'border-line bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      categoryGroup === 'environmental' ? 'text-[#005a4c]' : 'text-slate-400'
                    }`}>
                      <Leaf className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-ink leading-tight">Environmental</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-ink">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  className="w-full rounded-xl border border-line bg-white p-3.5 text-sm placeholder:text-ink-faint focus:border-[#005a4c] focus:outline-none focus:ring-1 focus:ring-[#005a4c]"
                />
                {readyPhotos.length === 0 && description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">
                    Rule BR-3: At least 15 characters required when submitting without photos ({description.trim().length}/{MIN_DESCRIPTION}).
                  </p>
                )}
              </div>

              {/* Photos Dropzone */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">Photos</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (e.dataTransfer.files) addPhotos(Array.from(e.dataTransfer.files))
                  }}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) addPhotos(Array.from(e.target.files))
                    }}
                  />
                  <div className="flex h-10 w-10 items-center justify-center text-slate-600 mb-2">
                    <Camera className="h-6 w-6 text-slate-700" />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    Drag & Drop or Click to Upload
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Max 3 photos (JPG, PNG)
                  </p>
                </div>

                {/* Uploaded photo thumbnails */}
                {photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {photos.map((p, idx) => (
                      <div key={p.localId} className="relative h-16 w-16 rounded-lg overflow-hidden border border-line bg-slate-100">
                        <img src={p.preview} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePhoto(idx)
                          }}
                          className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-0.5 hover:bg-black/80"
                          aria-label="Remove photo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Privacy Protection Active box */}
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 mt-3.5 text-left">
                  <Shield className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Privacy Protection Active</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                      All EXIF data (location, device info) is automatically stripped from uploaded photos before processing. No PII is stored permanently.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/citizen/dashboard')}
                  className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-5 py-2 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate('/citizen/reports/new/details')}
                  className="bg-[#005a4c] hover:bg-[#004a3e] text-white px-5 py-2 text-xs font-semibold rounded-lg shadow-xs"
                >
                  Continue to Details
                </Button>
              </div>
            </div>
          )}

          {/* STEP 1: Additional Details */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Fine-tune Specific Category</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Choose the closest taxonomy classification for faster dispatch:</p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {(categories ?? []).filter((c) => c.active).map((c) => {
                    const isSelected = category === c.key
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition-all ${
                          isSelected
                            ? 'border-2 border-[#005a4c] bg-white ring-1 ring-[#005a4c]/20 text-[#005a4c]'
                            : 'border-line bg-white text-ink hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate">{c.label.en}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="address-detail" className="mb-1.5 block text-sm font-semibold text-ink">
                  Location Landmark / Notes
                </label>
                <input
                  id="address-detail"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Near corner of Road 11, opposite market"
                  className="w-full rounded-xl border border-line bg-white p-3 text-sm placeholder:text-ink-faint focus:border-[#005a4c] focus:outline-none focus:ring-1 focus:ring-[#005a4c]"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/citizen/reports/new')}
                  className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-5 py-2 text-xs font-semibold rounded-lg"
                >
                  Back to Category
                </Button>
                <Button
                  type="button"
                  disabled={!hasValidContent}
                  onClick={() => navigate('/citizen/reports/new/review')}
                  className="bg-[#005a4c] hover:bg-[#004a3e] text-white px-5 py-2 text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
                >
                  Continue to Review
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Review & Final Submit */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-ink">Review Report Details</h2>
              <dl className="space-y-3">
                <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Category</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">
                      {categoryMeta?.label?.en || (categoryGroup === 'infrastructure' ? 'Infrastructure Hazard' : 'Environmental')}
                    </dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/reports/new')}
                    className="text-xs font-semibold text-[#005a4c] hover:underline"
                  >
                    Edit
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Location</dt>
                    <dd className="mt-0.5 text-sm text-ink">{address || 'Downtown Sector'}</dd>
                    <dd className="text-xs font-mono text-ink-muted mt-0.5">
                      {activeMarker.lat.toFixed(5)}, {activeMarker.lng.toFixed(5)}
                    </dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/reports/new')}
                    className="text-xs font-semibold text-[#005a4c] hover:underline"
                  >
                    Edit
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Description</dt>
                    <dd className="mt-0.5 text-sm text-ink">{description.trim() || '(Photo-only report)'}</dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/reports/new')}
                    className="text-xs font-semibold text-[#005a4c] hover:underline"
                  >
                    Edit
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Photos</dt>
                    <dd className="mt-0.5 text-sm text-ink">{readyPhotos.length ? `${readyPhotos.length} photo(s) attached` : 'None'}</dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/citizen/reports/new')}
                    className="text-xs font-semibold text-[#005a4c] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </dl>

              {readyPhotos.length > 0 && (
                <div className="mt-3 flex gap-2.5">
                  {readyPhotos.map((p) => (
                    <div key={p.localId} className="h-16 w-16 rounded-lg overflow-hidden border border-line">
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}

              {!isInsideBoundary && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Outside city service boundary. Please align the pin inside Dhaka boundaries before submitting.</span>
                </div>
              )}

              {submitError && (
                <p className="rounded-xl border border-status-critical/30 bg-status-critical-soft px-3 py-2 text-xs text-status-critical" role="alert">
                  {submitError}
                </p>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/citizen/reports/new/details')}
                  className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-5 py-2 text-xs font-semibold rounded-lg"
                >
                  Back to Details
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmit || uploading}
                  loading={submit.isPending}
                  onClick={() => {
                    setSubmitError(null)
                    submit.mutate()
                  }}
                  className="bg-[#005a4c] hover:bg-[#004a3e] text-white px-6 py-2 text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
                >
                  Submit Report
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Interactive Map Column (media_1789770150954.png) */}
        <div className="relative h-[550px] lg:h-[650px] w-full overflow-hidden rounded-2xl border border-line shadow-xs bg-slate-100">
          {/* Floating Pinpoint Location Card on top-left of the map */}
          <div className="absolute left-4 top-4 z-20 w-84 max-w-[calc(100%-32px)] rounded-xl border border-line bg-white/95 backdrop-blur-xs p-3.5 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#005a4c]/10 text-[#005a4c]">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 leading-tight">Pinpoint Location</p>
                <p className="text-[11px] text-slate-500">Click or drag the map to align the pin</p>
              </div>
            </div>
            <form onSubmit={handleSearchAddress} className="relative mt-2.5">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Search street or click on map..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-14 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#005a4c] focus:outline-none"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isGeocoding && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#005a4c]" />
                )}
                <button
                  type="button"
                  onClick={handleLocateMe}
                  disabled={isLocating}
                  title="Detect my exact location"
                  className="rounded p-1 text-[#005a4c] hover:bg-[#005a4c]/10 disabled:opacity-50 transition-colors"
                >
                  <Crosshair className={`h-4 w-4 ${isLocating ? 'animate-spin text-primary' : ''}`} />
                </button>
              </div>
            </form>

            {isLocating && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#005a4c]">
                <Crosshair className="h-3 w-3 animate-spin" />
                <span>Detecting your exact GPS location...</span>
              </p>
            )}
            {isGeocoding && !isLocating && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-[#005a4c]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Locating street address...</span>
              </p>
            )}

            {activeMarker && !isInsideBoundary && (
              <div className="mt-2 flex items-center gap-1.5 rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 border border-rose-200">
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" />
                <span>Outside city service boundary.</span>
              </div>
            )}
            {activeMarker && (
              <p className="mt-1 text-[10px] font-mono text-slate-400 truncate">
                Coords: {activeMarker.lat.toFixed(5)}, {activeMarker.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* Interactive Leaflet Map with boundary polygons & draggable marker */}
          <MapPanel
            center={activeMarker}
            marker={activeMarker}
            onMarkerChange={handleMarkerChange}
            polygons={polygons}
            interactive={true}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  )
}

function submitErrorMessage(err) {
  if (!(err instanceof ApiError)) return 'Submission failed. Please try again.'
  if (err.status === 0) return 'Cannot reach the server — your report was not sent. Reconnect and submit again.'
  if (err.status === 422 && err.code === 'OUT_OF_CITY') {
    return 'That location is outside the city served by UrbanMend — move the pin inside the boundary.'
  }
  if (err.status === 429) return 'Too many submissions — wait a little and retry.'
  if (err.code === 'IDEMPOTENCY_IN_PROGRESS') return 'Still sending your previous click — one moment.'
  const field = err.details?.map((d) => d.message).filter(Boolean).join(' ')
  return field || err.message
}
