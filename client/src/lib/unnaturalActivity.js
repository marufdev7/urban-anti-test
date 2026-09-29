/**
 * Unnatural Activity & Bulk Action Abuse Protection (UrbanMend Security Framework).
 *
 * Detects bulk operations (>= 5 reports/issues concurrently approved, rejected, or assigned):
 * - Level 1 (1st Violation): 15-minute temporary operational cooldown.
 * - Level 2 (Consecutive/Repeated Violation): Fully restricted account until Admin reactivation.
 * - Generates high-priority audit events for Admin review.
 */

const STORAGE_KEY_PREFIX = 'urbanmend_authority_restriction_'
const ALL_RESTRICTIONS_INDEX = 'urbanmend_all_restricted_authorities'

/**
 * Checks if an authority user currently has an active restriction.
 */
export function getAuthorityRestriction(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    if (!raw) return null
    const data = JSON.parse(raw)

    // Check if temporary restriction has expired
    if (data.level === 'temporary' && data.restrictedUntil) {
      if (Date.now() > data.restrictedUntil) {
        // Expired -> clean up
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`)
        removeFromIndex(userId)
        try {
          window.dispatchEvent(new CustomEvent('urbanmend_security_alert', { detail: { action: 'restriction_expired', userId } }))
        } catch {}
        return null
      }
    }

    return data
  } catch {
    return null
  }
}

/**
 * Formats remaining cooldown duration into a compact human-readable string (e.g., '14m 32s', '45s').
 */
export function formatRemainingCooldown(restrictedUntil) {
  if (!restrictedUntil) return null
  const diffMs = Number(restrictedUntil) - Date.now()
  if (diffMs <= 0) return '0s'

  const totalSec = Math.floor(diffMs / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60

  if (m > 0) {
    return `${m}m ${s.toString().padStart(2, '0')}s`
  }
  return `${s}s`
}

/**
 * Returns remaining cooldown seconds.
 */
export function getRemainingCooldownSeconds(restrictedUntil) {
  if (!restrictedUntil) return 0
  const diffMs = Number(restrictedUntil) - Date.now()
  return Math.max(0, Math.floor(diffMs / 1000))
}

/**
 * Records a bulk action. If count >= 5, triggers automatic progressive restriction.
 */
export function trackBulkAction({ user, count, actionType, targetIds = [] }) {
  if (!user || count < 5) return { triggered: false }

  const userId = String(user.id)
  const current = getAuthorityRestriction(userId)
  const violationsCount = (current?.violationsCount || 0) + 1

  const isPermanent = violationsCount >= 2
  const level = isPermanent ? 'permanent' : 'temporary'
  const cooldownMs = 15 * 60 * 1000 // 15 minutes
  const restrictedUntil = isPermanent ? null : Date.now() + cooldownMs

  const restrictionData = {
    userId,
    userEmail: user.email || 'officer@urbanmend.local',
    userName: user.fullName || 'Municipal Officer',
    level,
    violationsCount,
    restrictedAt: new Date().toISOString(),
    restrictedUntil,
    reason: `Unnatural bulk ${actionType} activity (${count} items modified simultaneously)`,
    actionType,
    count,
    targetIds,
  }

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(restrictionData))
    addToIndex(userId, restrictionData)

    // Store in global audit events so it immediately appears in Admin Audit Log
    const anomalyEvent = {
      id: crypto.randomUUID(),
      action: 'security.unnatural_bulk_action',
      actorId: userId,
      actorEmail: user.email,
      actorRole: user.role,
      actorName: user.fullName || 'Municipal Officer',
      targetType: 'AuthorityAccount',
      targetId: userId,
      before: { status: 'active', restriction: current ? current.level : 'none' },
      after: { status: isPermanent ? 'suspended' : 'restricted', restriction: level },
      metadata: {
        count,
        actionType,
        level,
        violationsCount,
        reason: restrictionData.reason,
        restrictedUntil: restrictionData.restrictedUntil,
      },
      at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    const savedEvents = JSON.parse(localStorage.getItem('urbanmend_local_audit_events') || '[]')
    savedEvents.unshift(anomalyEvent)
    localStorage.setItem('urbanmend_local_audit_events', JSON.stringify(savedEvents.slice(0, 100)))

    // Dispatch global event for live reactive UI updates
    window.dispatchEvent(new CustomEvent('urbanmend_security_alert', { detail: anomalyEvent }))
  } catch (err) {
    console.error('Failed to persist unnatural activity:', err)
  }

  return {
    triggered: true,
    level,
    violationsCount,
    restrictionData,
  }
}

/**
 * Admin action to reactivate and lift restrictions on an authority account.
 */
export function reactivateAuthorityAccount(userId, adminUser) {
  if (!userId) return false
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    const prev = raw ? JSON.parse(raw) : null

    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`)
    removeFromIndex(userId)

    // Record audit event for reactivation
    const reactivationEvent = {
      id: crypto.randomUUID(),
      action: 'security.admin_reactivated_authority',
      actorId: adminUser?.id || 'admin',
      actorEmail: adminUser?.email || 'admin@urbanmend.gov',
      actorRole: 'admin',
      actorName: adminUser?.fullName || 'System Administrator',
      targetType: 'AuthorityAccount',
      targetId: String(userId),
      before: { status: prev?.level || 'restricted', violations: prev?.violationsCount || 1 },
      after: { status: 'active', restriction: 'none' },
      metadata: {
        reactivatedBy: adminUser?.fullName || 'System Administrator',
        clearedViolations: prev?.violationsCount || 1,
        restoredAt: new Date().toISOString(),
      },
      at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    const savedEvents = JSON.parse(localStorage.getItem('urbanmend_local_audit_events') || '[]')
    savedEvents.unshift(reactivationEvent)
    localStorage.setItem('urbanmend_local_audit_events', JSON.stringify(savedEvents.slice(0, 100)))

    window.dispatchEvent(new CustomEvent('urbanmend_security_alert', { detail: reactivationEvent }))
    return true
  } catch {
    return false
  }
}

/**
 * Returns all currently restricted authorities.
 */
export function getAllRestrictedAuthorities() {
  try {
    const index = JSON.parse(localStorage.getItem(ALL_RESTRICTIONS_INDEX) || '{}')
    const list = []
    for (const [id, data] of Object.entries(index)) {
      const active = getAuthorityRestriction(id)
      if (active) list.push(active)
    }
    return list
  } catch {
    return []
  }
}

function addToIndex(userId, data) {
  try {
    const index = JSON.parse(localStorage.getItem(ALL_RESTRICTIONS_INDEX) || '{}')
    index[userId] = data
    localStorage.setItem(ALL_RESTRICTIONS_INDEX, JSON.stringify(index))
  } catch {}
}

function removeFromIndex(userId) {
  try {
    const index = JSON.parse(localStorage.getItem(ALL_RESTRICTIONS_INDEX) || '{}')
    delete index[userId]
    localStorage.setItem(ALL_RESTRICTIONS_INDEX, JSON.stringify(index))
  } catch {}
}
