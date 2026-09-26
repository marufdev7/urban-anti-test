import { useEffect, useState } from 'react'
import { AlertCircle, Check, Info, MapPin, Pencil, Sparkles, Tag, Wrench } from 'lucide-react'
import Dialog from '../ui/Dialog'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import { useCategories } from '../../hooks/data'
import { api } from '../../lib/api'
import { detectCategoryFromDescription } from '../../lib/classification'

export default function EditReportModal({ open, onClose, report, onSaved }) {
  const { data: categories, isLoading: isCategoriesLoading } = useCategories()

  const initialDescription = report?.description || ''
  const initialCategory = report?.classification?.category || report?.category || ''
  const initialAddress = report?.location?.address || report?.address || ''

  const [description, setDescription] = useState(initialDescription)
  const [category, setCategory] = useState(initialCategory)
  const [address, setAddress] = useState(initialAddress)

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Sync state whenever modal opens or report id changes (prevents background polling from resetting typed input)
  useEffect(() => {
    if (open && report) {
      setDescription(report.description || '')
      setCategory(report.classification?.category || report.category || '')
      setAddress(report.location?.address || report.address || '')
      setErrorMsg('')
    }
  }, [open, report?.id])

  // Real-time AI category suggestion based on updated description
  const aiDetected = detectCategoryFromDescription(description)

  const hasChanges =
    description.trim() !== initialDescription.trim() ||
    category !== initialCategory ||
    address.trim() !== initialAddress.trim()

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    if (!description.trim()) {
      setErrorMsg('Please enter a description for the report.')
      return
    }

    setSaving(true)
    setErrorMsg('')

    try {
      const payload = {
        description: description.trim(),
        category: category || undefined,
        address: address.trim(),
      }

      const updated = await api(`/reports/${report.id}`, {
        method: 'PATCH',
        body: payload,
      })

      if (onSaved) {
        onSaved(updated)
      }
      onClose()
    } catch (err) {
      if (err.status === 409 || err.code === 'NOT_EDITABLE') {
        setErrorMsg('কর্তৃপক্ষ এই রিপোর্টটি গ্রহণ (acknowledge) করেছে, তাই এটি আর পরিবর্তন করা যাবে না। (This report has already been acknowledged by an authority and can no longer be edited.)')
      } else {
        setErrorMsg(err.message || 'Failed to update report. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div className="flex w-full flex-col gap-3">
      {/* Notice text above buttons */}
      <div className="flex items-center gap-1.5 text-ink-muted">
        <Info className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <p className="text-[11px] text-ink-muted">
          * Editable until municipal authority acknowledges
        </p>
      </div>

      {/* Modal Action Buttons */}
      <div className="flex items-center justify-end gap-2.5 pt-0.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={saving}
          className="min-w-24 text-xs font-semibold cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={saving || !hasChanges || !description.trim()}
          loading={saving}
          className="min-w-32 whitespace-nowrap text-xs font-semibold shadow-xs cursor-pointer"
        >
          {!saving && <Check className="h-4 w-4" />}
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </Button>
      </div>
    </div>
  )

  const handleClose = () => {
    if (!saving) {
      onClose?.()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Edit Incident Report"
      footer={footer}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Notice Banner */}
        <div className="rounded-panel border border-emerald-300 bg-emerald-50/70 p-3 text-xs text-emerald-900">
          <p className="font-semibold flex items-center gap-1.5 text-emerald-800">
            <Pencil className="h-3.5 w-3.5 text-emerald-600" />
            রিপোর্ট সম্পাদনা (Edit Window)
          </p>
          <p className="mt-0.5 text-emerald-950/80 leading-relaxed">
            কর্তৃপক্ষ এই রিপোর্টটি গ্রহণ (acknowledge) করার পূর্ব পর্যন্ত আপনি তথ্য পরিবর্তন করতে পারবেন।
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-panel border border-status-critical/30 bg-status-critical/10 p-3 text-xs text-status-critical" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Description Field */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="edit-description" className="text-xs font-bold text-ink">
              Description (বিবরণ) <span className="text-status-critical">*</span>
            </label>
            <span className="text-[11px] text-ink-muted">
              {description.length} characters
            </span>
          </div>
          <textarea
            id="edit-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..."
            className="w-full rounded-panel border border-line bg-surface-panel p-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            required
          />
        </div>

        {/* AI Category Suggestion Pill */}
        {aiDetected && aiDetected.category !== category && (
          <div className="flex items-center justify-between rounded-panel border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-ink">
                AI Suggestion: <strong>{aiDetected.label}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCategory(aiDetected.category)}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              Apply Suggestion
            </button>
          </div>
        )}

        {/* Category Field */}
        <div>
          <label htmlFor="edit-category" className="block text-xs font-bold text-ink mb-1">
            Category (ক্যাটেগরি)
          </label>
          <div className="relative">
            <select
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isCategoriesLoading}
              className="w-full rounded-panel border border-line bg-surface-panel py-2 pl-3 pr-8 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select Category...</option>
              {categories?.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.label?.en || cat.key} {cat.label?.bn ? `(${cat.label.bn})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Address / Location Field */}
        <div>
          <label htmlFor="edit-address" className="block text-xs font-bold text-ink mb-1">
            Address / Landmark Location (ঠিকানা)
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              id="edit-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Sector 4, Road 7, Near Lake View Hospital"
              className="w-full rounded-panel border border-line bg-surface-panel py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </form>
    </Dialog>
  )
}
