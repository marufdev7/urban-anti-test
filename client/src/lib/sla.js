/**
 * Municipal SLA & Resolution Deadline Engine (UrbanMend Resilience Initiative).
 *
 * Enforces authoritative civic resolution deadlines:
 * - Critical: 24 Hours (Immediate emergency hazard)
 * - High: 72 Hours (3 Days)
 * - Medium: 7 Days (1 Week)
 * - Low: 14 Days (2 Weeks)
 */

export const SLA_DURATIONS_MS = {
  critical: 24 * 60 * 60 * 1000, // 24 hours
  high: 3 * 24 * 60 * 60 * 1000, // 72 hours
  medium: 7 * 24 * 60 * 60 * 1000, // 7 days
  low: 14 * 24 * 60 * 60 * 1000, // 14 days
}

export const SLA_LABELS = {
  critical: '24 Hours (Emergency)',
  high: '72 Hours (3 Days)',
  medium: '7 Days',
  low: '14 Days',
}

/**
 * Format duration into human-readable compact string, e.g. "5h 20m", "2d 4h"
 */
export function formatDurationCompact(ms) {
  const absMs = Math.abs(ms)
  const totalMinutes = Math.floor(absMs / (60 * 1000))
  const hours = Math.floor(totalMinutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remHours = hours % 24
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  }
  if (hours > 0) {
    const remMins = totalMinutes % 60
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  }
  return `${Math.max(1, totalMinutes)}m`
}

export function saveCustomDeadline(issueId, days) {
  if (typeof window === 'undefined' || !issueId) return
  const numDays = Number(days)
  if (isNaN(numDays) || numDays <= 0) return
  const payload = {
    days: numDays,
    updatedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(`urbanmend_custom_deadline_${issueId}`, JSON.stringify(payload))
  } catch {
    // ignore storage error
  }
}

export function clearCustomDeadline(issueId) {
  if (typeof window === 'undefined' || !issueId) return
  try {
    localStorage.removeItem(`urbanmend_custom_deadline_${issueId}`)
  } catch {
    // ignore storage error
  }
}

export function getCustomDeadline(issueId) {
  if (typeof window === 'undefined' || !issueId) return null
  try {
    const raw = localStorage.getItem(`urbanmend_custom_deadline_${issueId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Computes complete SLA compliance, target deadline, and remaining time for an issue or report.
 * Supports authority-fixed resolution deadlines.
 *
 * @param {Object} issue
 * @param {string|Date} issue.openedAt
 * @param {string} issue.status
 * @param {Object|string} issue.severity
 * @returns {Object} SLA analytics object
 */
export function getSlaInfo(issue) {
  if (!issue) return null

  const openedAtTime = issue.openedAt || issue.createdAt
  const parsedDate = openedAtTime ? new Date(openedAtTime) : new Date()
  const openedDate = !isNaN(parsedDate.getTime()) ? parsedDate : new Date()

  // Resolve severity key
  const rawSev =
    issue.severity?.current ||
    issue.computedSeverity ||
    issue.classification?.severitySignal ||
    issue.severity ||
    'medium'
  const severity = String(rawSev).toLowerCase()

  // Check custom authority-assigned deadline
  let customDeadline = issue.customDeadline || issue.customDeadlineDate
  let customDays = issue.customDeadlineDays || null

  if (!customDeadline && typeof window !== 'undefined' && issue.id) {
    try {
      const stored = localStorage.getItem(`urbanmend_custom_deadline_${issue.id}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.deadlineDate) {
          customDeadline = parsed.deadlineDate
          customDays = parsed.days || null
        } else if (parsed.days) {
          customDays = parsed.days
          customDeadline = new Date(openedDate.getTime() + parsed.days * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    } catch {
      // ignore
    }
  }

  let allowedDurationMs
  let isCustom = false

  if (customDeadline) {
    const customDate = new Date(customDeadline)
    if (!isNaN(customDate.getTime())) {
      isCustom = true
      allowedDurationMs = Math.max(60 * 60 * 1000, customDate.getTime() - openedDate.getTime())
      if (!customDays) {
        customDays = Math.max(1, Math.round(allowedDurationMs / (24 * 60 * 60 * 1000)))
      }
    }
  }

  if (!allowedDurationMs) {
    allowedDurationMs = SLA_DURATIONS_MS[severity] ?? SLA_DURATIONS_MS.medium
  }

  const deadlineDate = customDeadline && !isNaN(new Date(customDeadline).getTime())
    ? new Date(customDeadline)
    : new Date(openedDate.getTime() + allowedDurationMs)

  const now = Date.now()

  const isResolved =
    issue.status === 'resolved' ||
    issue.status === 'closed' ||
    issue.issueStatus === 'resolved' ||
    issue.issueStatus === 'closed'

  const remainingMs = deadlineDate.getTime() - now
  const elapsedMs = Math.max(0, now - openedDate.getTime())

  const rawPercent = Math.round((elapsedMs / (allowedDurationMs || 1)) * 100)
  const percentElapsed = isNaN(rawPercent) ? 0 : Math.min(100, Math.max(0, rawPercent))

  const isOverdue = !isResolved && remainingMs < 0
  const isDueSoon = !isResolved && remainingMs >= 0 && remainingMs <= 24 * 60 * 60 * 1000 // <= 24 hours

  let tone = 'on_track'
  let label = isResolved
    ? 'Resolved'
    : isOverdue
    ? `Overdue by ${formatDurationCompact(remainingMs)}`
    : `Due in ${formatDurationCompact(remainingMs)}`

  let badgeClass = 'border-teal-300 bg-teal-50 text-teal-800'
  let dotClass = 'bg-teal-600'

  if (isResolved) {
    tone = 'resolved'
    badgeClass = 'border-emerald-300 bg-emerald-50 text-emerald-800'
    dotClass = 'bg-emerald-600'
  } else if (isOverdue) {
    tone = 'overdue'
    badgeClass = 'border-rose-400 bg-rose-100 text-rose-900 font-bold'
    dotClass = 'bg-rose-600'
  } else if (isDueSoon) {
    tone = 'due_soon'
    badgeClass = 'border-amber-400 bg-amber-100 text-amber-950 font-semibold'
    dotClass = 'bg-amber-600'
  }

  const slaHours = Math.max(1, Math.round(allowedDurationMs / (60 * 60 * 1000))) || 72
  const ageHours = Math.max(0, Math.round(elapsedMs / (60 * 60 * 1000))) || 0

  return {
    openedDate,
    deadlineDate,
    deadline: deadlineDate,
    deadlineFormatted: deadlineDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    allowedDurationMs,
    allowedDurationLabel: isCustom
      ? `${customDays} Day${customDays === 1 ? '' : 's'} (Authority Fixed)`
      : (SLA_LABELS[severity] || '7 Days'),
    isCustom,
    customDays,
    slaHours,
    ageHours,
    percentElapsed,
    remainingMs,
    elapsedMs,
    progressPercent: percentElapsed,
    isOverdue,
    isDueSoon,
    isResolved,
    tone,
    label,
    badgeClass,
    dotClass,
  }
}
