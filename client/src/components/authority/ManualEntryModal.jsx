import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Building,
  Camera,
  Check,
  CheckCircle2,
  Clipboard,
  Clock,
  Crosshair,
  FileText,
  Flame,
  FolderOpen,
  Info,
  Layers,
  MapPin,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  SwitchCamera,
  Trash2,
  Upload,
  User,
  Users,
  Wrench,
  X,
  ZoomIn,
} from 'lucide-react'
import { api, apiUpload } from '../../lib/api'
import { mediaErrorMessage, useCategories, useCityBoundary } from '../../hooks/data'
import { forwardGeocode, reverseGeocode } from '../../lib/geo'
import { BANGLADESH_CITIES, getJurisdictionLabel } from '../../lib/zones'
import {
  classifyTextWithAI,
  detectCategoryFromDescription,
  detectSeverityFromDescription,
} from '../../lib/classification'
import Button from '../ui/Button'
import MapPanel from '../MapPanel'
import Spinner from '../ui/Spinner'

const INTAKE_CHANNELS = [
  { id: 'hotline', label: 'Phone Hotline', icon: Phone, desc: 'Direct citizen hotline call' },
  { id: 'walk_in', label: 'Walk-in Counter', icon: Users, desc: 'Citizen in-person reporting' },
  { id: 'radio', label: 'Radio Dispatch', icon: Radio, desc: 'Patrol squad / field unit call' },
  { id: 'emergency', label: 'Emergency Alert', icon: Flame, desc: 'High-priority incident report' },
]

const URGENCY_LEVELS = [
  { id: 'low', label: 'Low', tone: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { id: 'medium', label: 'Medium', tone: 'bg-sky-50 text-sky-800 border-sky-300' },
  { id: 'high', label: 'High', tone: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'critical', label: 'Critical', tone: 'bg-rose-50 text-rose-800 border-rose-300' },
]

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
          const file = new File([blob], `camera_evidence_${Date.now()}.jpg`, {
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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
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
            className="rounded-lg p-1 text-ink-muted hover:bg-surface-panel hover:text-ink transition"
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
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-3 py-1.5 text-xs font-semibold text-ink hover:border-line-focus transition disabled:opacity-40"
            title="Switch front / rear camera"
          >
            <SwitchCamera className="h-4 w-4 text-ink-muted" />
            <span>Switch</span>
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={isInitializing || !!cameraError}
            className="flex items-center gap-2 rounded-full bg-[#005a4c] hover:bg-[#00483c] px-6 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-40 active:scale-95"
          >
            <Camera className="h-4 w-4" />
            <span>Snap Photo</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface-panel px-3 py-1.5 text-xs font-medium text-ink hover:border-line-focus transition"
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
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-fade-in"
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
            <button
              type="button"
              onClick={() => {
                onRemove(photo.localId)
                onClose()
              }}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Photo</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink transition"
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

export default function ManualEntryModal({ isOpen, onClose, onSuccess, defaultArea = '' }) {
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const boundaryQuery = useCityBoundary()
  const fileInputRef = useRef(null)

  // Intake channel
  const [channel, setChannel] = useState('hotline')

  // Incident details
  const [description, setDescription] = useState('')
  const [callerName, setCallerName] = useState('')
  const [callerPhone, setCallerPhone] = useState('')

  // AI auto-detection & classification states
  const [category, setCategory] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [aiDetectedCategory, setAiDetectedCategory] = useState(null)
  const [aiDetectedUrgency, setAiDetectedUrgency] = useState(null)
  const [aiRationale, setAiRationale] = useState('')
  const [manualCategoryOverride, setManualCategoryOverride] = useState(false)
  const [manualUrgencyOverride, setManualUrgencyOverride] = useState(false)

  // Location & Map
  const [selectedCityId, setSelectedCityId] = useState('dhaka')
  const currentCity = useMemo(
    () => BANGLADESH_CITIES.find((c) => c.id === selectedCityId) || BANGLADESH_CITIES[0],
    [selectedCityId],
  )

  const [marker, setMarker] = useState({ lat: 23.7806, lng: 90.4152 })
  const [address, setAddress] = useState('')
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [isLocating, setIsLocating] = useState(false)

  // Photos, dropzone, camera, lightbox & paste states
  const [photos, setPhotos] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [activeLightboxPhoto, setActiveLightboxPhoto] = useState(null)
  const [pasteNotice, setPasteNotice] = useState(null)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(null)

  // Reset modal state on open & detect default area
  useEffect(() => {
    if (isOpen) {
      setSubmitError(null)
      setSubmitSuccess(null)
      setDescription('')
      setCallerName('')
      setCallerPhone('')
      setPhotos([])
      setIsDragging(false)
      setIsCameraOpen(false)
      setActiveLightboxPhoto(null)
      setPasteNotice(null)
      setCategory('')
      setUrgency('medium')
      setManualCategoryOverride(false)
      setManualUrgencyOverride(false)
      setAiDetectedCategory(null)
      setAiDetectedUrgency(null)
      setAiRationale('')

      // Detect city from defaultArea
      const area = (defaultArea || '').toLowerCase()
      const matched = BANGLADESH_CITIES.find((c) => area.includes(c.id) || c.id === area)
      const targetCity = matched || BANGLADESH_CITIES[0]

      setSelectedCityId(targetCity.id)
      const initialPos = { lat: targetCity.center.lat, lng: targetCity.center.lng }
      setMarker(initialPos)

      setIsGeocoding(true)
      reverseGeocode(initialPos.lat, initialPos.lng)
        .then((addr) => {
          setAddress(addr || `${targetCity.nameEn.split(' ')[0]}, Bangladesh`)
        })
        .finally(() => setIsGeocoding(false))
    }
  }, [isOpen, defaultArea])

  // Real-time automatic AI classification on description changes
  useEffect(() => {
    const text = description.trim()
    if (text.length < 3) {
      setAiDetectedCategory(null)
      setAiDetectedUrgency(null)
      setAiRationale('')
      return
    }

    // 1. Instant client-side inference (0ms latency!)
    const instantCat = detectCategoryFromDescription(text)
    const instantSev = detectSeverityFromDescription(text)

    if (instantCat?.category) {
      setAiDetectedCategory(instantCat.category)
      if (!manualCategoryOverride) {
        setCategory(instantCat.category)
      }
    }
    if (instantSev?.severity) {
      setAiDetectedUrgency(instantSev.severity)
      if (!manualUrgencyOverride) {
        setUrgency(instantSev.severity)
      }
    }

    // 2. Debounced backend AI classification (300ms)
    setIsAiAnalyzing(true)
    const timer = setTimeout(async () => {
      try {
        const fullResult = await classifyTextWithAI(text)
        if (fullResult) {
          if (fullResult.category) {
            setAiDetectedCategory(fullResult.category)
            if (!manualCategoryOverride) {
              setCategory(fullResult.category)
            }
          }
          if (fullResult.severity) {
            setAiDetectedUrgency(fullResult.severity)
            if (!manualUrgencyOverride) {
              setUrgency(fullResult.severity)
            }
          }
          if (fullResult.rationale) {
            setAiRationale(fullResult.rationale)
          }
        }
      } catch (err) {
        console.warn('AI classification error:', err)
      } finally {
        setIsAiAnalyzing(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [description, manualCategoryOverride, manualUrgencyOverride])

  // City selection change
  const handleCityChange = async (cityId) => {
    setSelectedCityId(cityId)
    const city = BANGLADESH_CITIES.find((c) => c.id === cityId) || BANGLADESH_CITIES[0]
    const newPos = { lat: city.center.lat, lng: city.center.lng }
    setMarker(newPos)
    setIsGeocoding(true)
    try {
      const resolved = await reverseGeocode(newPos.lat, newPos.lng)
      setAddress(resolved || `${city.nameEn.split(' ')[0]}, Bangladesh`)
    } catch {
      setAddress(`${city.nameEn.split(' ')[0]}, Bangladesh`)
    } finally {
      setIsGeocoding(false)
    }
  }

  // Interactive Map click / drag
  const handleMarkerChange = async (newPos) => {
    setMarker(newPos)
    setIsGeocoding(true)
    try {
      const resolved = await reverseGeocode(newPos.lat, newPos.lng)
      if (resolved) setAddress(resolved)
    } finally {
      setIsGeocoding(false)
    }
  }

  // Current GPS Location
  const handleLocateMe = () => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMarker(newPos)
        setIsLocating(false)
        setIsGeocoding(true)
        const resolved = await reverseGeocode(newPos.lat, newPos.lng)
        if (resolved) setAddress(resolved)
        setIsGeocoding(false)
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  // Address search in map box
  const handleAddressSearch = async (e) => {
    e?.preventDefault()
    if (!address.trim()) return
    setIsGeocoding(true)
    const found = await forwardGeocode(address)
    if (found) {
      setMarker({ lat: found.lat, lng: found.lng })
      setAddress(found.displayName)
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

  const removePhoto = (localId) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.localId === localId)
      if (target?.preview) URL.revokeObjectURL(target.preview)
      return prev.filter((p) => p.localId !== localId)
    })
    if (activeLightboxPhoto?.localId === localId) {
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

  // Clipboard paste support (Ctrl+V)
  useEffect(() => {
    if (!isOpen) return

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
  }, [isOpen, photos.length])

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

  // Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanDesc = description.trim()
    if (cleanDesc.length < 15) {
      setSubmitError('Incident description must contain at least 15 characters.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // Build structured audit metadata tag
    const channelLabel = INTAKE_CHANNELS.find((c) => c.id === channel)?.label || channel
    const urgencyLabel = URGENCY_LEVELS.find((u) => u.id === urgency)?.label || urgency
    const metaParts = [`Channel: ${channelLabel}`, `Urgency Signal: ${urgencyLabel}`]
    if (aiRationale) metaParts.push(`AI Analysis: ${aiRationale}`)
    if (callerName.trim()) metaParts.push(`Reported By: ${callerName.trim()}`)
    if (callerPhone.trim()) metaParts.push(`Contact: ${callerPhone.trim()}`)
    const fullDescription = `${cleanDesc}\n\n[Official Intake Record — ${metaParts.join(' | ')}]`

    try {
      const readyMediaIds = photos.filter((p) => p.state === 'ready' && p.mediaId).map((p) => p.mediaId)

      const ack = await api('/reports', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          description: fullDescription,
          category: category || undefined,
          location: { lng: marker.lng, lat: marker.lat },
          address: address.trim(),
          mediaIds: readyMediaIds,
          language: /[\u0980-\u09FF]/.test(fullDescription) ? 'bn' : 'en',
        },
      })

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['issues'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })

      setSubmitSuccess(ack)
      if (onSuccess) onSuccess(ack)

      // Auto close after 1.8s
      setTimeout(() => {
        onClose()
      }, 1800)
    } catch (err) {
      setSubmitError(err.message || 'Failed to file municipal incident report.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div
        className="relative my-auto flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-surface-panel shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-entry-title"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-line bg-surface-sunken/60 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#005a4c] text-white shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id="manual-entry-title" className="text-base font-bold text-ink flex items-center gap-2">
                <span>Manual Incident Intake</span>
                <span className="rounded-full bg-[#005a4c]/10 px-2 py-0.5 text-[10px] font-bold text-[#005a4c] uppercase">
                  Official Entry
                </span>
              </h2>
              <p className="text-xs text-ink-muted">
                Log reports received via phone hotline, citizen walk-in, or radio dispatch into the triage queue.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-panel hover:text-ink transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* SUCCESS OVERLAY */}
        {submitSuccess ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-ink">Incident Logged Successfully!</h3>
            <p className="text-xs text-ink-muted max-w-md">
              Report has been registered with ID <code className="bg-surface-sunken px-1.5 py-0.5 rounded font-mono text-ink">{submitSuccess.reportId?.slice(0, 8)}</code> and queued for automated municipal review and spatial clustering.
            </p>
            <div className="pt-2">
              <Button size="sm" onClick={onClose} className="bg-[#005a4c] text-white font-semibold">
                Done &amp; Return to Queue
              </Button>
            </div>
          </div>
        ) : (
          /* MAIN FORM CONTENT */
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
            {submitError && (
              <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <p>{submitError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 p-5">
              {/* LEFT COLUMN: FORM DETAILS (7 cols) */}
              <div className="md:col-span-7 space-y-4">
                {/* 1. INTAKE CHANNEL */}
                <div>
                  <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                    1. Intake Source / Channel
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {INTAKE_CHANNELS.map((ch) => {
                      const Icon = ch.icon
                      const isSelected = channel === ch.id
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setChannel(ch.id)}
                          className={`flex items-center gap-2 rounded-xl p-2.5 text-left border transition ${
                            isSelected
                              ? 'border-[#005a4c] bg-[#005a4c]/5 text-[#005a4c] font-semibold ring-1 ring-[#005a4c]'
                              : 'border-line bg-surface-panel text-ink-muted hover:border-line-focus'
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-[#005a4c]' : 'text-ink-faint'}`} />
                          <div className="min-w-0">
                            <p className="text-xs leading-none">{ch.label}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2. INCIDENT DESCRIPTION (AI Trigger) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                      <span>2. Incident Description</span>
                      <span className="text-rose-500">*</span>
                      {isAiAnalyzing ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-primary animate-pulse ml-1">
                          <Sparkles className="h-3 w-3 animate-spin" /> AI Analyzing…
                        </span>
                      ) : (aiDetectedCategory || aiDetectedUrgency) ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-full ml-1">
                          <Sparkles className="h-3 w-3 text-emerald-600" /> AI Auto-Detected
                        </span>
                      ) : null}
                    </label>
                    <span className={`text-[11px] font-mono ${description.trim().length >= 15 ? 'text-emerald-700 font-semibold' : 'text-ink-muted'}`}>
                      {description.trim().length}/15 min chars
                    </span>
                  </div>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide specific details about the issue (e.g. Deep road cavity in main street causing vehicle damage, live electrical wire snapped and sparking, water pipeline ruptured)..."
                    className="w-full rounded-xl border border-line bg-surface-panel p-3 text-xs leading-relaxed text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  {aiRationale && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>AI Clustered: {aiRationale}</span>
                    </div>
                  )}
                </div>

                {/* 3. CATEGORY & INITIAL URGENCY (AI Auto-selected) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Category Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1">
                        <span>3. Category</span>
                        {aiDetectedCategory && !manualCategoryOverride && (
                          <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                            ✨ AI Match
                          </span>
                        )}
                      </label>
                      {manualCategoryOverride && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualCategoryOverride(false)
                            if (aiDetectedCategory) setCategory(aiDetectedCategory)
                          }}
                          className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                          title="Reset to AI detected category"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          <span>Reset to AI</span>
                        </button>
                      )}
                    </div>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value)
                        setManualCategoryOverride(true)
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-xs font-medium text-ink transition ${
                        aiDetectedCategory && !manualCategoryOverride
                          ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500'
                          : 'border-line bg-surface-panel focus:border-primary focus:ring-1 focus:ring-primary'
                      }`}
                    >
                      <option value="">AI Auto-Detect Category</option>
                      {(categories ?? []).filter((c) => c.active).map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label.en} {aiDetectedCategory === c.key ? '✨ (AI Match)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Initial Urgency Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1">
                        <span>Initial Urgency</span>
                        {aiDetectedUrgency && !manualUrgencyOverride && (
                          <span className="rounded-full bg-primary/10 text-primary border border-primary/30 px-1.5 py-0.2 text-[9px] font-bold">
                            ✨ AI Set
                          </span>
                        )}
                      </label>
                      {manualUrgencyOverride && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualUrgencyOverride(false)
                            if (aiDetectedUrgency) setUrgency(aiDetectedUrgency)
                          }}
                          className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                          title="Reset to AI detected urgency"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          <span>Reset to AI</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {URGENCY_LEVELS.map((u) => {
                        const isSelected = urgency === u.id
                        const isAiSuggested = aiDetectedUrgency === u.id
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setUrgency(u.id)
                              setManualUrgencyOverride(true)
                            }}
                            className={`relative flex-1 rounded-lg py-1.5 text-center text-xs font-bold border transition ${
                              isSelected
                                ? `${u.tone} shadow-xs ring-2 ring-current`
                                : 'border-line bg-surface-sunken text-ink-muted hover:text-ink'
                            }`}
                          >
                            <span>{u.label}</span>
                            {isAiSuggested && !manualUrgencyOverride && (
                              <span
                                className="absolute -top-1.5 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#005a4c] text-[8px] text-white shadow-xs"
                                title="AI Assessed"
                              >
                                ✨
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 4. CALLER / REPORTER INFORMATION (OPTIONAL) */}
                <div className="rounded-xl border border-line/70 bg-surface-sunken/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span>Caller / Citizen Contact (Optional)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={callerName}
                      onChange={(e) => setCallerName(e.target.value)}
                      placeholder="Caller Full Name (Optional)"
                      className="rounded-lg border border-line bg-surface-panel px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary"
                    />
                    <input
                      type="tel"
                      value={callerPhone}
                      onChange={(e) => setCallerPhone(e.target.value)}
                      placeholder="Phone (e.g. 017XXXXXXXX)"
                      className="rounded-lg border border-line bg-surface-panel px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary"
                    />
                  </div>
                </div>

                {/* 5. PHOTO EVIDENCE ATTACHMENT */}
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
                      className={`relative rounded-xl border-2 border-dashed p-3 transition-all text-center flex flex-col items-center justify-center ${
                        isDragging
                          ? 'border-[#005a4c] bg-[#005a4c]/10 scale-[1.01] shadow-inner'
                          : 'border-line bg-surface-sunken/40 hover:border-line-focus hover:bg-surface-sunken/70'
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

                      <div className="flex flex-wrap items-center justify-center gap-2 mb-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-2.5 py-1 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-primary" />
                          <span>Browse Files</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsCameraOpen(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-2.5 py-1 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition"
                        >
                          <Camera className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Live Camera</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleClipboardClick}
                          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-panel px-2.5 py-1 text-xs font-semibold text-ink shadow-2xs hover:border-[#005a4c] hover:text-[#005a4c] transition"
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
                            Drag &amp; drop photos, paste screenshot with <kbd className="rounded bg-surface-panel border border-line px-1 py-0.2 font-mono text-[9px] text-ink">Ctrl+V</kbd>, or snap with camera
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
                          className="group relative flex flex-col rounded-xl border border-line bg-surface-panel overflow-hidden shadow-xs hover:shadow-sm transition"
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
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink hover:bg-slate-100 transition shadow-xs"
                                title="View full photo"
                              >
                                <ZoomIn className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removePhoto(p.localId)}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 transition shadow-xs"
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
                                  className="mt-0.5 text-[9px] underline font-bold text-white hover:text-rose-100"
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Card footer details */}
                          <div className="flex items-center justify-between px-2 py-1 bg-surface-sunken/60 text-[10px]">
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
                      <span>Maximum 3 evidence photos attached. Ready for triage logging.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN: LOCATION & INTERACTIVE MAP (5 cols) */}
              <div className="md:col-span-5 flex flex-col space-y-3 border-t md:border-t-0 md:border-l border-line md:pl-5 pt-4 md:pt-0">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-[#005a4c]" />
                    <span>Incident Location</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleLocateMe}
                    disabled={isLocating}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#005a4c] hover:underline"
                  >
                    <Crosshair className={`h-3 w-3 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Locating…' : 'Use GPS'}</span>
                  </button>
                </div>

                {/* City Corporation Selector */}
                <div>
                  <select
                    value={selectedCityId}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-panel px-3 py-1.5 text-xs font-medium text-ink focus:border-primary"
                  >
                    {BANGLADESH_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.nameEn} ({c.nameBn})</option>
                    ))}
                  </select>
                </div>

                {/* Address Search / Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddressSearch()
                      }
                    }}
                    placeholder="Street address, road number or landmark…"
                    className="w-full rounded-xl border border-line bg-surface-panel py-2 pl-3 pr-8 text-xs text-ink placeholder:text-ink-faint focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddressSearch}
                    disabled={isGeocoding}
                    title="Search location"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <Search className={`h-4 w-4 ${isGeocoding ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Mini Interactive Map */}
                <div className="relative h-56 w-full rounded-xl border border-line overflow-hidden shadow-inner">
                  <MapPanel
                    center={marker}
                    marker={marker}
                    onMarkerChange={handleMarkerChange}
                    interactive={true}
                    zoom={14}
                    className="h-full w-full"
                  />
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-surface-panel/90 p-1.5 text-center text-[10px] font-medium text-ink shadow-xs backdrop-blur-xs border border-line/60">
                    Click or drag anywhere on the map to pinpoint spot
                  </div>
                </div>

                {/* Coordinates & Accuracy */}
                <div className="flex items-center justify-between rounded-lg bg-surface-sunken p-2 text-[11px] font-mono text-ink-muted">
                  <span>Lat: {marker.lat.toFixed(4)}</span>
                  <span>Lng: {marker.lng.toFixed(4)}</span>
                </div>
              </div>
            </div>

            {/* FOOTER ACTION BUTTONS */}
            <div className="flex items-center justify-between border-t border-line bg-surface-sunken/40 px-5 py-3">
              <span className="text-[11px] text-ink-muted">
                Report will be automatically assigned to municipal pipeline
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  disabled={submitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  disabled={submitting || description.trim().length < 15}
                  className="bg-[#005a4c] hover:bg-[#00483c] text-white font-semibold text-xs px-4 py-2 flex items-center gap-1.5 shadow-xs"
                >
                  <FileText className="h-4 w-4" />
                  <span>Log Incident</span>
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* LIVE CAMERA CAPTURE MODAL */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(capturedFile) => addPhotoFiles([capturedFile])}
      />

      {/* PHOTO LIGHTBOX MODAL */}
      <PhotoLightboxModal
        photo={activeLightboxPhoto}
        onClose={() => setActiveLightboxPhoto(null)}
        onRemove={(localId) => removePhoto(localId)}
      />
    </div>
  )
}
