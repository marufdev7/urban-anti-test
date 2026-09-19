import { useRef } from 'react'
import { ImagePlus, Loader2, ShieldCheck, XCircle, X } from 'lucide-react'

/**
 * Photo picker (FRONTEND_PLAN §3): drag & drop or click, up to `maxFiles`,
 * JPEG/PNG/WEBP. Shows previews with per-photo progress/error and an EXIF /
 * privacy notice. Actual upload to POST /media is wired by the parent.
 */
export default function UploadDropzone({ photos, onAdd, onRemove, maxFiles = 5 }) {
  const inputRef = useRef(null)

  const pick = (fileList) => {
    const selected = Array.from(fileList ?? [])
    if (selected.length) onAdd(selected)
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Add photos"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files)
        }}
        className="flex h-36 cursor-pointer flex-col items-center justify-center rounded-panel border border-dashed border-line bg-surface-sunken text-center hover:border-primary"
      >
        <ImagePlus className="mb-1.5 h-7 w-7 text-ink-faint" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink">Drag &amp; Drop or Click to Upload</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Max {maxFiles} photos (JPG, PNG, WEBP)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((photo, index) => (
            <li
              key={photo.localId}
              className="relative aspect-square overflow-hidden rounded-panel border border-line bg-surface-sunken"
            >
              <img src={photo.preview} alt={`Upload ${index + 1}`} className="h-full w-full object-cover" />
              {photo.state === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                </div>
              )}
              {photo.state === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-status-critical/80 px-1 text-center text-[11px] font-medium text-white">
                  <XCircle className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  {photo.error}
                </div>
              )}
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => onRemove(index)}
                className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-white hover:bg-ink/80"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-start gap-2.5 rounded-panel border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-ink">Privacy Protection Active</p>
          <p className="mt-0.5 leading-relaxed text-ink-muted">
            All EXIF data (location, device info) is automatically stripped from uploaded photos before processing. No PII is stored permanently.
          </p>
        </div>
      </div>
    </div>
  )
}
