import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clipboard,
  Crosshair,
  FolderOpen,
  Leaf,
  Loader2,
  Lock,
  MapPin,
  Shield,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { api, apiUpload, ApiError } from '../../lib/api'
import { categoryLabel, mediaErrorMessage, useCategories, useCityBoundary } from '../../hooks/data'
import { forwardGeocode, isPointInBoundary, reverseGeocode } from '../../lib/geo'
import { BANGLADESH_CITIES, isPointInPolygon } from '../../lib/zones'
import {
  CATEGORY_GROUP_MAPPING,
  classifyTextWithAI,
  detectCategoryFromDescription,
} from '../../lib/classification'
import { shortId } from '../../lib/format'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import MapPanel from '../../components/MapPanel'
import Spinner from '../../components/ui/Spinner'

const MIN_DESCRIPTION = 15
const STEPS = ['Category', 'Details', 'Review']

const CATEGORY_MAP = {
  infrastructure: 'roads',
  environmental: 'water_drainage',
}

function getCategoryName(categories, slug) {
  if (!slug) return 'Public Safety Incident'
  return categoryLabel(categories, slug) || slug
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function CameraCaptureModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facingMode, setFacingMode] = useState('environment')
  const [cameraError, setCameraError] = useState(null)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsInitializing(true)
    setCameraError(null)

    async function startCamera() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        const constraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!isMounted) {
          mediaStream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = mediaStream
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (err) {
        console.warn('Camera initialization failed:', err)
        if (isMounted) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setCameraError('Camera access was denied. Please allow camera permissions in your browser address bar.')
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setCameraError('No camera found on this device.')
          } else {
            setCameraError('Camera unavailable or in use by another application.')
          }
        }
      } finally {
        if (isMounted) setIsInitializing(false)
      }
    }

    startCamera()

    return () => {
      isMounted = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [isOpen, facingMode])

  const handleCapture = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `citizen_camera_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          })
          onCapture(file)
          onClose()
        }
      },
      'image/jpeg',
      0.92,
    )
  }

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface-panel shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-sunken">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#005a4c] text-white">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-tight">Live Evidence Camera</h3>
              <p className="text-[10px] text-ink-muted">Snap instant photo proof directly from your camera</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-muted hover:bg-surface-panel hover:text-ink transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center text-rose-300 space-y-2 max-w-sm">
              <AlertCircle className="h-8 w-8 mx-auto text-rose-400" />
              <p className="text-xs">{cameraError}</p>
            </div>
          ) : (
            <>
              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white z-10 gap-2">
                  <Spinner className="h-5 w-5" />
                  <span className="text-xs">Initializing camera feed...</span>
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-6 border border-white/25 rounded-xl flex items-center justify-center">
                <div className="h-3 w-3 rounded-full border border-white/40" />
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between border-t border-line bg-surface-sunken px-4 py-3">
          <button
            type="button"
            onClick={toggleFacingMode}
            disabled={!!cameraError}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-3 py-1.5 text-xs font-semibold text-ink hover:border-line-focus transition disabled:opacity-40 cursor-pointer"
            title="Switch front / rear camera"
          >
            <SwitchCamera className="h-4 w-4 text-ink-muted" />
            <span>Switch</span>
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={isInitializing || !!cameraError}
            className="flex items-center gap-2 rounded-full bg-[#005a4c] hover:bg-[#00483c] px-6 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-40 active:scale-95 cursor-pointer"
          >
            <Camera className="h-4 w-4" />
            <span>Snap Photo</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface-panel px-3 py-1.5 text-xs font-medium text-ink hover:border-line-focus transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function PhotoLightboxModal({ photo, onClose, onRemove }) {
  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-3xl w-full flex flex-col rounded-2xl bg-surface-panel border border-line shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface-sunken">
          <div className="min-w-0 pr-3">
            <h4 className="text-xs font-bold text-ink truncate">{photo.name || 'Evidence Photo'}</h4>
            <div className="flex items-center gap-2 text-[10px] text-ink-muted mt-0.5">
              {photo.sizeFormatted && <span>{photo.sizeFormatted}</span>}
              <span>•</span>
              {photo.state === 'ready' && (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Uploaded to Server
                </span>
              )}
              {photo.state === 'uploading' && (
                <span className="text-primary font-semibold flex items-center gap-1">
                  <Spinner className="h-3 w-3" /> Uploading...
                </span>
              )}
              {photo.state === 'error' && (
                <span className="text-rose-600 font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Upload Failed
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  onRemove(photo.localId)
                  onClose()
                }}
                className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Photo</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Large Image View */}
        <div className="flex flex-1 items-center justify-center bg-black/90 p-2 sm:p-4 overflow-hidden max-h-[75vh]">
          <img
            src={photo.preview}
            alt={photo.name || 'Evidence preview'}
            className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-lg"
          />
        </div>
      </div>
    </div>
  )
}

function haversineMeters(a, b) {
  const lat1 = Number(a?.lat ?? a?.latitude)
  const lng1 = Number(a?.lng ?? a?.longitude)
  const lat2 = Number(b?.lat ?? b?.latitude)
  const lng2 = Number(b?.lng ?? b?.longitude)
  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return 999999
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371000 // meters
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function DuplicatePromptModal({
  isOpen,
  detectedIssue,
  categories,
  onConfirmSameIssue,
  onProceedAsNew,
  isConfirming,
  onClose,
}) {
  if (!isOpen || !detectedIssue) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface-panel shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 bg-amber-50/70 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-tight">
                AI Duplicate Detection (সম্ভাব্য একই সমস্যা শনাক্ত)
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                Active issue found within {detectedIssue.distanceMeters}m of your pin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-panel hover:text-ink transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Our spatial AI detected that a municipal issue of this same category is already reported within{' '}
            <strong className="text-ink">{detectedIssue.distanceMeters} meters</strong> of your pinpoint:
          </p>

          {/* Detected issue summary card */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink text-sm">
                {getCategoryName(categories, detectedIssue.primaryCategory)}
              </span>
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                #UM-{shortId(detectedIssue.id)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-ink-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{detectedIssue.address || 'Reported nearby'}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-amber-200/60 text-[11px]">
              <span className="text-ink-muted font-medium">
                Current Status: <strong className="text-ink capitalize">{detectedIssue.status?.replace('_', ' ')}</strong>
              </span>
              <span className="font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                {detectedIssue.corroborationCount || 1} citizens affected
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-900">
            <p className="font-bold">
              Is your report for this same existing issue, or is this a completely new issue?
            </p>
            <p className="text-[11px] text-sky-700 mt-0.5">
              (আপনার রিপোর্টটি কি এই সমস্যারই অংশ, নাকি এটি একটি নতুন ভিন্ন সমস্যা?)
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            <Button
              type="button"
              loading={isConfirming}
              onClick={onConfirmSameIssue}
              className="w-full bg-[#005a4c] hover:bg-[#00483c] text-white py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Yes, Same Issue — Add My Voice (+1 Affect Count)</span>
            </Button>
            <p className="text-[10px] text-center text-ink-faint">
              Increases the community impact count (+1) for authorities without creating clutter.
            </p>

            <Button
              type="button"
              variant="secondary"
              onClick={onProceedAsNew}
              className="w-full border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
            >
              No, this is a New / Different Issue (নতুন সমস্যা হিসেবে জমা দিন)
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Citizen Report Submission Wizard matching media_1789770150954.png pixel-for-pixel:
 * - Live click & drag pinpointing on map with instant reverse-geocoded address.
 * - Working crosshair location detector & address search.
 * - Stepper with circular badges and text below.
 * - Split-screen layout: left form card, right interactive pinpoint map.
 * - Issue Category tiles: Infrastructure Hazard & Environmental.
 * - Description input with BR-3 validation.
 * - Multi-modal photo upload: drag & drop, live camera capture, clipboard paste (Ctrl+V), and lightbox inspection.
 */
export default function ReportWizardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)

  if (user?.isGuest) {
    return (
      <div className="mx-auto max-w-xl py-12 px-4">
        <Card className="border border-line shadow-panel overflow-hidden">
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 mb-4">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-ink">Sign In Required to Report Issues</h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
              You are exploring UrbanMend in <strong>Guest Mode (অতিথি মোড)</strong>. To report civic problems, submit photos, and track repair status, please sign in with a citizen account.
            </p>
          </div>
          <div className="p-6 flex flex-col gap-3">
            <Button
              type="button"
              className="w-full justify-center"
              onClick={() => navigate('/auth/login')}
            >
              Sign In or Create Account
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center"
              onClick={() => navigate('/citizen/dashboard')}
            >
              Back to Dashboard (Explore Nearby)
            </Button>
          </div>
        </Card>
      </div>
    )
  }

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

  const [selectedCityId, setSelectedCityId] = useState(() => {
    try {
      const saved = localStorage.getItem('urbanmend_report_draft')
      return saved ? JSON.parse(saved).selectedCityId ?? 'dhaka' : 'dhaka'
    } catch {
      return 'dhaka'
    }
  })

  const currentCity = useMemo(
    () => BANGLADESH_CITIES.find((c) => c.id === selectedCityId) || BANGLADESH_CITIES[0],
    [selectedCityId],
  )

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
  const [hasManualOverride, setHasManualOverride] = useState(false)
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [serverAiResult, setServerAiResult] = useState(null)

  // Real-time instant semantic inference
  const detectedCategory = useMemo(() => {
    return detectCategoryFromDescription(description)
  }, [description])

  // Automatically select category and group when detected, unless the citizen manually picked one
  useEffect(() => {
    if (detectedCategory && !hasManualOverride && !serverAiResult) {
      setCategory(detectedCategory.category)
      setCategoryGroup(detectedCategory.group)
    }
  }, [detectedCategory, hasManualOverride, serverAiResult])

  // Asynchronous Backend AI Analysis (debounced 600ms)
  useEffect(() => {
    if (!description || description.trim().length < 6) {
      setServerAiResult(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsAiAnalyzing(true)
      const aiRes = await classifyTextWithAI(description)
      setIsAiAnalyzing(false)
      if (aiRes?.category) {
        setServerAiResult(aiRes)
        if (!hasManualOverride) {
          setCategory(aiRes.category)
          setCategoryGroup(CATEGORY_GROUP_MAPPING[aiRes.category] || 'infrastructure')
        }
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [description, hasManualOverride])

  const handleTriggerAiAnalyze = async () => {
    if (!description || description.trim().length < 4) return
    setIsAiAnalyzing(true)
    const aiRes = await classifyTextWithAI(description)
    setIsAiAnalyzing(false)
    if (aiRes?.category) {
      setServerAiResult(aiRes)
      setCategory(aiRes.category)
      setCategoryGroup(CATEGORY_GROUP_MAPPING[aiRes.category] || 'infrastructure')
      setHasManualOverride(false)
    }
  }

  const [photos, setPhotos] = useState([]) // [{localId, name, size, sizeFormatted, preview, mediaId, state, error, file}]
  const [isDragging, setIsDragging] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState(null)
  const [pasteNotice, setPasteNotice] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null) // 202 acknowledgement

  const defaultCityCenter = useMemo(
    () => (selectedCityId === 'dhaka' && center ? center : currentCity.center),
    [selectedCityId, center, currentCity],
  )
  const activeMarker = marker ?? defaultCityCenter

  // Handle City Corporation selection: shifts map view, relocates pin, and reverse-geocodes
  const handleCityChange = async (cityId) => {
    setSelectedCityId(cityId)
    const city = BANGLADESH_CITIES.find((c) => c.id === cityId) || BANGLADESH_CITIES[0]
    const newLoc = { lat: city.center.lat, lng: city.center.lng }
    setMarker(newLoc)
    setIsGeocoding(true)
    try {
      const resolved = await reverseGeocode(newLoc.lat, newLoc.lng)
      if (resolved) {
        setAddress(resolved)
      } else {
        setAddress(`${city.nameEn.split(' ')[0]}, Bangladesh`)
      }
    } catch {
      setAddress(`${city.nameEn.split(' ')[0]}, Bangladesh`)
    } finally {
      setIsGeocoding(false)
    }
  }

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
          // Automatically detect matched City Corporation if inside one of them
          const matchedCity = BANGLADESH_CITIES.find(
            (c) => c.boundaryPolygon && isPointInPolygon(userLoc, c.boundaryPolygon),
          )
          if (matchedCity) {
            setSelectedCityId(matchedCity.id)
          }
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
      if (category || marker || address || description || categoryGroup || selectedCityId) {
        localStorage.setItem(
          'urbanmend_report_draft',
          JSON.stringify({ categoryGroup, category, marker, address, description, selectedCityId }),
        )
      }
    } catch {
      // ignore storage quota or disabled storage
    }
  }, [categoryGroup, category, marker, address, description, selectedCityId])

  // Boundary validation against selected City Corporation (FRONT-PLAN §9.2, prevent 422 OUT_OF_CITY)
  const isInsideBoundary = useMemo(() => {
    if (!activeMarker) return false
    // 1. If Dhaka and backend GeoJSON boundary is loaded, check GeoJSON
    if (selectedCityId === 'dhaka' && boundaryQuery.data) {
      if (isPointInBoundary(activeMarker, boundaryQuery.data)) return true
    }
    // 2. Check against selected city corporation boundary polygon
    if (currentCity?.boundaryPolygon && currentCity.boundaryPolygon.length >= 3) {
      if (isPointInPolygon(activeMarker, currentCity.boundaryPolygon)) return true
    }
    // 3. Fallback: check city bounds bounding box
    if (currentCity?.bounds) {
      const [[minLat, minLng], [maxLat, maxLng]] = currentCity.bounds
      return (
        activeMarker.lat >= minLat - 0.05 &&
        activeMarker.lat <= maxLat + 0.05 &&
        activeMarker.lng >= minLng - 0.05 &&
        activeMarker.lng <= maxLng + 0.05
      )
    }
    return true
  }, [activeMarker, currentCity, selectedCityId, boundaryQuery.data])

  // BR-3: at least one of description (min 15 chars) or media is required.
  const hasValidContent = photos.length > 0 || description.trim().length >= MIN_DESCRIPTION
  const canSubmit = Boolean(category && activeMarker && isInsideBoundary && hasValidContent)

  const handleSelectGroup = (group) => {
    setCategoryGroup(group)
    setCategory(CATEGORY_MAP[group] || 'roads')
    setHasManualOverride(true)
  }

  const applyDetectedCategory = (detected) => {
    if (!detected) return
    setCategory(detected.category)
    setCategoryGroup(detected.group)
    setHasManualOverride(false)
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

  // Multi-intake Photo Handlers (Browse, Camera, Drag & Drop, Paste)
  const addPhotoFiles = (fileList) => {
    const validImages = Array.from(fileList || []).filter(
      (f) => f.type && f.type.startsWith('image/'),
    )
    if (!validImages.length) return

    const room = 3 - photos.length
    if (room <= 0) return

    const toAdd = validImages.slice(0, room)
    const newEntries = toAdd.map((file) => ({
      localId: crypto.randomUUID(),
      name: file.name || `evidence_${Date.now()}.jpg`,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
      preview: URL.createObjectURL(file),
      mediaId: null,
      state: 'uploading',
      error: null,
      file,
    }))

    setPhotos((prev) => [...prev, ...newEntries])

    newEntries.forEach((entry) => {
      apiUpload('/media', entry.file)
        .then((media) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === entry.localId ? { ...p, mediaId: media.id, state: 'ready' } : p,
            ),
          )
        })
        .catch((err) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.localId === entry.localId
                ? { ...p, state: 'error', error: mediaErrorMessage(err) }
                : p,
            ),
          )
        })
    })
  }

  const addPhotos = (files) => addPhotoFiles(files)

  const retryUpload = (localId) => {
    const target = photos.find((p) => p.localId === localId)
    if (!target || !target.file) return
    setPhotos((prev) =>
      prev.map((p) =>
        p.localId === localId ? { ...p, state: 'uploading', error: null } : p,
      ),
    )
    apiUpload('/media', target.file)
      .then((media) => {
        setPhotos((prev) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, mediaId: media.id, state: 'ready' } : p,
          ),
        )
      })
      .catch((err) => {
        setPhotos((prev) =>
          prev.map((p) =>
            p.localId === localId
              ? { ...p, state: 'error', error: mediaErrorMessage(err) }
              : p,
          ),
        )
      })
  }

  const removePhoto = (targetIdOrIndex) => {
    setPhotos((prev) => {
      let target
      if (typeof targetIdOrIndex === 'number') {
        target = prev[targetIdOrIndex]
      } else {
        target = prev.find((p) => p.localId === targetIdOrIndex)
      }
      if (target?.preview) URL.revokeObjectURL(target.preview)
      return prev.filter((p, i) =>
        typeof targetIdOrIndex === 'number' ? i !== targetIdOrIndex : p.localId !== targetIdOrIndex,
      )
    })
    if (activeLightboxPhoto && (activeLightboxPhoto.localId === targetIdOrIndex || activeLightboxPhoto === targetIdOrIndex)) {
      setActiveLightboxPhoto(null)
    }
  }

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer?.files) {
      addPhotoFiles(e.dataTransfer.files)
    }
  }

  // Clipboard paste support (Ctrl+V) anywhere on the page
  useEffect(() => {
    const handleWindowPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items || items.length === 0) return

      const imageFiles = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type && item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) {
            imageFiles.push(
              new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type }),
            )
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        addPhotoFiles(imageFiles)
        setPasteNotice('Image pasted from clipboard!')
        setTimeout(() => setPasteNotice(null), 3000)
      }
    }

    window.addEventListener('paste', handleWindowPaste)
    return () => window.removeEventListener('paste', handleWindowPaste)
  }, [photos.length])

  const handleClipboardClick = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        const files = []
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'))
          if (imageType) {
            const blob = await item.getType(imageType)
            files.push(new File([blob], `clipboard_${Date.now()}.png`, { type: imageType }))
          }
        }
        if (files.length > 0) {
          addPhotoFiles(files)
          setPasteNotice('Image pasted from clipboard!')
          setTimeout(() => setPasteNotice(null), 3000)
          return
        }
      }
      setPasteNotice('Press Ctrl+V to paste a copied image or screenshot.')
      setTimeout(() => setPasteNotice(null), 3500)
    } catch {
      setPasteNotice('Press Ctrl+V anywhere in this window to paste.')
      setTimeout(() => setPasteNotice(null), 3500)
    }
  }

  const { data: nearbyIssuesData } = useQuery({
    queryKey: ['issues', 'duplicate-check'],
    queryFn: () => api('/issues?limit=100'),
    staleTime: 30_000,
  })

  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [confirmedSameIssue, setConfirmedSameIssue] = useState(null)
  const [isConfirmingSame, setIsConfirmingSame] = useState(false)
  const [forceNewIssue, setForceNewIssue] = useState(false)

  const categoryMeta = categories?.find((c) => c.key === category)

  // AI Automatic Duplicate Detection (within 100 meters and same category or category group)
  const nearbyDuplicateIssue = useMemo(() => {
    if (!activeMarker || !category) return null
    const allIssues = nearbyIssuesData?.data ?? []
    const candidates = allIssues
      .filter((iss) => {
        if (['resolved', 'closed', 'rejected', 'hidden', 'removed'].includes(iss.status)) return false

        const cat1 = category
        const cat2 = iss.primaryCategory || iss.category
        const group1 = categoryGroup || CATEGORY_GROUP_MAPPING[cat1]
        const group2 = CATEGORY_GROUP_MAPPING[cat2]

        const matchesCategory =
          cat1 === cat2 ||
          (group1 && group2 && group1 === group2)
        if (!matchesCategory) return false

        const loc = iss.representativeLocation || iss.representative_location || iss.location
        const dist = haversineMeters(activeMarker, loc)
        return dist <= 100 // within 100 meters
      })
      .map((iss) => {
        const loc = iss.representativeLocation || iss.representative_location || iss.location
        return {
          ...iss,
          distanceMeters: Math.round(haversineMeters(activeMarker, loc)),
        }
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)

    return candidates.length > 0 ? candidates[0] : null
  }, [activeMarker, category, categoryGroup, nearbyIssuesData])

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
          language: /[\u0980-\u09FF]/.test(description) ? 'bn' : 'en',
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

  const handleInitiateSubmit = () => {
    setSubmitError(null)
    if (!canSubmit) {
      if (!hasValidContent) {
        setSubmitError(
          'Please enter a description of at least 15 characters or attach at least one photo (Rule BR-3).'
        )
      } else if (!isInsideBoundary) {
        setSubmitError(
          `The selected pin is outside ${currentCity.nameEn} boundary. Please adjust your map pin inside the city.`
        )
      } else if (!category) {
        setSubmitError('Please select a category for this issue.')
      } else {
        setSubmitError('Please complete all required fields before submitting.')
      }
      return
    }

    // If an existing issue within 100m is detected and citizen hasn't already chosen to force new
    if (nearbyDuplicateIssue && !forceNewIssue) {
      setDuplicateModalOpen(true)
      return
    }
    submit.mutate()
  }

  const handleConfirmSameIssue = async () => {
    if (!nearbyDuplicateIssue) return
    setIsConfirmingSame(true)
    try {
      await api(`/issues/${nearbyDuplicateIssue.id}/confirmations`, {
        method: 'POST',
      })
      setConfirmedSameIssue(nearbyDuplicateIssue)
      setDuplicateModalOpen(false)
      try {
        localStorage.removeItem('urbanmend_report_draft')
      } catch {}
    } catch (err) {
      setConfirmedSameIssue({
        ...nearbyDuplicateIssue,
        note: err.message?.includes('already') ? 'You have already corroborated this issue.' : null,
      })
      setDuplicateModalOpen(false)
    } finally {
      setIsConfirmingSame(false)
    }
  }

  const handleProceedAsNew = () => {
    setForceNewIssue(true)
    setDuplicateModalOpen(false)
    submit.mutate()
  }

  const readyPhotos = photos.filter((p) => p.state === 'ready')
  const uploading = photos.some((p) => p.state === 'uploading')

  // ---- Corroboration confirmation state (Same Issue selected, +1 affect count) ----
  if (confirmedSameIssue) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="p-8 text-center rounded-2xl shadow-sm border border-line">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 mb-3">
            Affect Count +1 (জনমত যুক্ত হয়েছে)
          </span>
          <h1 className="text-2xl font-bold text-ink">Impact Corroborated!</h1>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            Your verification has been recorded for active incident{' '}
            <strong className="font-mono text-ink">#UM-{shortId(confirmedSameIssue.id)}</strong>.
            The affected citizen count has been incremented by <strong>+1</strong> ({confirmedSameIssue.distanceMeters}m from your pin).
          </p>
          <div className="mt-4 rounded-xl border border-line bg-surface-sunken/40 p-4 text-left text-xs space-y-1.5">
            <p className="font-semibold text-ink">
              Category: {getCategoryName(categories, confirmedSameIssue.primaryCategory)}
            </p>
            <p className="text-ink-muted">
              Location: {confirmedSameIssue.address || (confirmedSameIssue.representativeLocation ? `${confirmedSameIssue.representativeLocation.lat.toFixed(4)}, ${confirmedSameIssue.representativeLocation.lng.toFixed(4)}` : 'Location nearby')}
            </p>
            <p className="text-emerald-700 font-semibold">
              ✓ Prevents duplicate tickets while escalating urgency for municipal authorities.
            </p>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/citizen/dashboard')}
              className="border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Back to Dashboard
            </Button>
            <Button
              onClick={() => navigate('/citizen/dashboard')}
              className="bg-[#005a4c] text-white hover:bg-[#004a3e]"
            >
              Done
            </Button>
          </div>
        </Card>
      </div>
    )
  }

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
              {/* City Corporation Selector */}
              <div>
                <label htmlFor="city-select" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Building2 className="h-4 w-4 text-[#005a4c]" />
                  <span>City Corporation</span>
                </label>
                <div className="relative">
                  <select
                    id="city-select"
                    value={selectedCityId}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="w-full cursor-pointer rounded-xl border border-line bg-white p-3 text-sm font-medium text-ink focus:border-[#005a4c] focus:outline-none focus:ring-1 focus:ring-[#005a4c]"
                  >
                    {BANGLADESH_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn} ({c.nameBn})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Issue Category */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-ink">Issue Category</label>
                  {detectedCategory && !hasManualOverride && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#005a4c] border border-emerald-200 shadow-2xs">
                      <Sparkles className="h-3 w-3 text-emerald-600 animate-pulse" />
                      Auto-detected: {detectedCategory.labelEn}
                    </span>
                  )}
                </div>
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

                {/* Active Specific Subcategory Badge */}
                <div className="mt-2.5 flex items-center justify-between text-xs text-ink-muted bg-slate-50 border border-slate-200/70 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] font-medium">Selected Category:</span>
                  <span className="font-semibold text-[#005a4c]">
                    {categoryMeta?.label?.en || detectedCategory?.labelEn || category}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="description" className="block text-sm font-semibold text-ink">
                    Description
                  </label>
                  <button
                    type="button"
                    onClick={handleTriggerAiAnalyze}
                    disabled={isAiAnalyzing || !description.trim()}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#005a4c] hover:text-[#004a3e] bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                  >
                    {isAiAnalyzing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <span>{isAiAnalyzing ? 'Analyzing AI...' : 'AI Analyze'}</span>
                  </button>
                </div>
                <textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail... (e.g. gas pipeline leak, broken road, drain blocked)"
                  className="w-full rounded-xl border border-line bg-white p-3.5 text-sm placeholder:text-ink-faint focus:border-[#005a4c] focus:outline-none focus:ring-1 focus:ring-[#005a4c]"
                />

                {/* AI Analysis Status / Result */}
                {(detectedCategory || serverAiResult || isAiAnalyzing) && !hasManualOverride && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50/90 border border-emerald-200 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-900">
                      {isAiAnalyzing ? (
                        <Loader2 className="h-4 w-4 text-emerald-600 animate-spin shrink-0" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-emerald-600 shrink-0 animate-pulse" />
                      )}
                      <span>
                        AI Analyzed Category:{' '}
                        <strong>
                          {categoryMeta?.label?.en ||
                            detectedCategory?.labelEn ||
                            serverAiResult?.category ||
                            category}
                        </strong>
                        {detectedCategory?.labelBn ? ` (${detectedCategory.labelBn})` : ''}
                      </span>
                    </div>
                    {isAiAnalyzing ? (
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                        Deep analyzing intent...
                      </span>
                    ) : serverAiResult?.rationale ? (
                      <span
                        className="text-[11px] font-medium text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded max-w-[240px] truncate"
                        title={serverAiResult.rationale}
                      >
                        {serverAiResult.rationale}
                      </span>
                    ) : detectedCategory?.matchedTerms?.length > 0 ? (
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded">
                        Analyzed: "{detectedCategory.matchedTerms.slice(0, 2).join(' • ')}"
                      </span>
                    ) : null}
                  </div>
                )}

                {/* When user manually chose a category, but description points to something else */}
                {hasManualOverride && detectedCategory && detectedCategory.category !== category && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-900">
                      <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>
                        AI suggests <strong>{detectedCategory.labelEn}</strong> based on description.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyDetectedCategory(detectedCategory)}
                      className="font-semibold text-emerald-800 hover:text-emerald-900 bg-white border border-emerald-300 px-2.5 py-1 rounded shadow-2xs hover:bg-emerald-50 transition-colors"
                    >
                      Apply AI Category
                    </button>
                  </div>
                )}

                {readyPhotos.length === 0 && description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">
                    Rule BR-3: At least 15 characters required when submitting without photos ({description.trim().length}/{MIN_DESCRIPTION}).
                  </p>
                )}
              </div>

              {/* Photos Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-[#005a4c]" />
                    <span>Attach Evidence Photos</span>
                    <span className="text-[11px] font-normal text-ink-muted">({photos.length}/3)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {pasteNotice && (
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full animate-fade-in">
                        {pasteNotice}
                      </span>
                    )}
                    <span className="hidden sm:inline-flex text-[10px] text-ink-muted">
                      Drop, Paste (Ctrl+V), or Camera
                    </span>
                  </div>
                </div>

                {/* Drop Zone & Action Buttons */}
                {photos.length < 3 && (
                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative rounded-xl border-2 border-dashed p-4 transition-all text-center flex flex-col items-center justify-center ${
                      isDragging
                        ? 'border-[#005a4c] bg-[#005a4c]/10 scale-[1.01] shadow-inner'
                        : 'border-slate-300 bg-slate-50/50 hover:border-[#005a4c] hover:bg-slate-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addPhotoFiles(e.target.files)
                        e.target.value = ''
                      }}
                    />

                    <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition cursor-pointer"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-primary" />
                        <span>Browse Files</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition cursor-pointer"
                      >
                        <Camera className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Live Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleClipboardClick}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition cursor-pointer"
                        title="Paste image directly or press Ctrl+V"
                      >
                        <Clipboard className="h-3.5 w-3.5 text-sky-600" />
                        <span>Paste (Ctrl+V)</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-ink-muted leading-tight">
                      {isDragging ? (
                        <strong className="text-[#005a4c]">Drop image files here to upload</strong>
                      ) : (
                        <>
                          Drag &amp; drop photos, paste screenshot with <kbd className="rounded bg-white border border-line px-1 py-0.2 font-mono text-[9px] text-ink">Ctrl+V</kbd>, or snap with camera
                        </>
                      )}
                    </p>
                  </div>
                )}

                {/* Attached Photos Thumbnail Cards */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {photos.map((p, idx) => (
                      <div
                        key={p.localId}
                        className="group relative flex flex-col rounded-xl border border-line bg-white overflow-hidden shadow-xs hover:shadow-sm transition"
                      >
                        {/* Thumbnail preview */}
                        <div className="relative aspect-video w-full bg-slate-900/10 overflow-hidden">
                          <img
                            src={p.preview}
                            alt={p.name || `Evidence ${idx + 1}`}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 cursor-pointer"
                            onClick={() => setActiveLightboxPhoto(p)}
                          />

                          {/* Hover overlay with zoom and delete */}
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveLightboxPhoto(p)}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink hover:bg-slate-100 transition shadow-xs cursor-pointer"
                              title="View full photo"
                            >
                              <ZoomIn className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removePhoto(p.localId)}
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 transition shadow-xs cursor-pointer"
                              title="Remove photo"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          {/* State indicators */}
                          {p.state === 'uploading' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white text-[10px] gap-1">
                              <Spinner className="h-3.5 w-3.5" />
                              <span>Uploading...</span>
                            </div>
                          )}
                          {p.state === 'error' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/85 text-white p-1 text-center">
                              <span className="text-[10px] font-semibold text-rose-200">Failed</span>
                              <button
                                type="button"
                                onClick={() => retryUpload(p.localId)}
                                className="mt-0.5 text-[9px] underline font-bold text-white hover:text-rose-100 cursor-pointer"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Card footer details */}
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-50 text-[10px]">
                          <span className="truncate max-w-[70px] text-ink font-medium" title={p.name}>
                            {p.sizeFormatted || `#${idx + 1}`}
                          </span>
                          {p.state === 'ready' && (
                            <span className="flex items-center gap-0.5 text-emerald-700 font-semibold">
                              <Check className="h-3 w-3" /> Ready
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {photos.length === 3 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>Maximum 3 evidence photos attached. Ready for submission.</span>
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
                    const isDetected = detectedCategory?.category === c.key
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => {
                          setCategory(c.key)
                          setCategoryGroup(CATEGORY_GROUP_MAPPING[c.key] || 'infrastructure')
                          setHasManualOverride(true)
                        }}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left text-xs font-semibold transition-all ${
                          isSelected
                            ? 'border-2 border-[#005a4c] bg-white ring-1 ring-[#005a4c]/20 text-[#005a4c]'
                            : 'border-line bg-white text-ink hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate">{c.label.en}</span>
                        {isDetected && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
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
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">City Corporation</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">
                      {currentCity.nameEn} ({currentCity.nameBn})
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
                    <div
                      key={p.localId}
                      className="group relative h-16 w-16 rounded-lg overflow-hidden border border-line cursor-pointer"
                      onClick={() => setActiveLightboxPhoto(p)}
                      title="Click to preview full size"
                    >
                      <img src={p.preview} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <ZoomIn className="h-4 w-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!hasValidContent && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Content Requirement (Rule BR-3)</p>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      Please provide at least 15 characters in the description (currently {description.trim().length} chars) or attach at least 1 photo before submitting.
                    </p>
                  </div>
                </div>
              )}

              {!isInsideBoundary && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Outside city service boundary. Please align the pin inside {currentCity.nameEn} boundaries before submitting.</span>
                </div>
              )}

              {submitError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 font-medium flex items-center gap-2" role="alert">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Duplicate Notice Banner if within 100m */}
              {nearbyDuplicateIssue && !forceNewIssue && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5 shadow-2xs">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <p className="font-bold text-amber-950">
                      AI Duplicate Alert: Similar active issue detected {nearbyDuplicateIssue.distanceMeters}m away
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                      Issue <strong className="text-amber-950">#UM-{shortId(nearbyDuplicateIssue.id)}</strong> ({getCategoryName(categories, nearbyDuplicateIssue.primaryCategory)}) is already open nearby. Submitting will prompt you to add your voice (+1 affect count) or submit as a separate ticket.
                    </p>
                  </div>
                </div>
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
                  disabled={uploading}
                  loading={submit.isPending}
                  onClick={handleInitiateSubmit}
                  className="bg-[#005a4c] hover:bg-[#004a3e] text-white px-6 py-2 text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#005a4c]/10 text-[#005a4c]">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 leading-tight">Pinpoint Location</p>
                  <p className="text-[11px] text-slate-500">Click or drag the map</p>
                </div>
              </div>
              <select
                value={selectedCityId}
                onChange={(e) => handleCityChange(e.target.value)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#005a4c] shadow-2xs focus:border-[#005a4c] focus:outline-none"
                title="Switch City Corporation"
              >
                {BANGLADESH_CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn.split(' ')[0]}
                  </option>
                ))}
              </select>
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
                <span>Outside {currentCity.nameEn.split(' ')[0]} boundary.</span>
              </div>
            )}
            {activeMarker && (
              <p className="mt-1 text-[10px] font-mono text-slate-400 truncate">
                {currentCity.nameEn.split(' ')[0]} • Coords: {activeMarker.lat.toFixed(5)}, {activeMarker.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* Interactive Leaflet Map with boundary polygons & draggable marker */}
          <MapPanel
            center={activeMarker}
            marker={activeMarker}
            onMarkerChange={handleMarkerChange}
            polygons={selectedCityId === 'dhaka' && polygons?.length ? polygons : undefined}
            boundaryPolygon={currentCity?.boundaryPolygon}
            zoom={currentCity?.zoom || 13}
            interactive={true}
            className="h-full w-full"
          />
        </div>
      </div>

      {/* Live Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(file) => addPhotoFiles([file])}
      />

      {/* Photo Lightbox Modal */}
      <PhotoLightboxModal
        photo={activeLightboxPhoto}
        onClose={() => setActiveLightboxPhoto(null)}
        onRemove={removePhoto}
      />

      {/* AI Duplicate Detection Modal */}
      <DuplicatePromptModal
        isOpen={duplicateModalOpen}
        detectedIssue={nearbyDuplicateIssue}
        categories={categories}
        onConfirmSameIssue={handleConfirmSameIssue}
        onProceedAsNew={handleProceedAsNew}
        isConfirming={isConfirmingSame}
        onClose={() => setDuplicateModalOpen(false)}
      />
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
