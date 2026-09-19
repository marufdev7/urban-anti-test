import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { categoryLabel } from '../hooks/data'
import { formatDateTime, shortId } from './format'

/**
 * Export municipal issues to a professionally formatted PDF document.
 */
export function exportIssuesPdf({
  issues = [],
  categories = [],
  filters = {},
  user = null,
  filename = null,
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Primary brand colors
  const primaryColor = [14, 116, 144] // #0e7490 Deep Cyan
  const darkTextColor = [15, 23, 42] // #0f172a Slate-900
  const mutedTextColor = [100, 116, 139] // #64748b Slate-500
  const lightBg = [248, 250, 252] // #f8fafc

  // Header Banner
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 24, 'F')

  // Brand Name & Subtitle
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('UrbanMend Municipal Safety Platform', 14, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('PUBLIC INFRASTRUCTURE & INCIDENT AUDIT REPORT', 14, 18)

  // Top right metadata in banner
  doc.setFontSize(8)
  const nowStr = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  doc.text(`Generated: ${nowStr}`, pageWidth - 14, 11, { align: 'right' })
  doc.text(
    `Exported by: ${user?.name || user?.email || 'System Administrator'}`,
    pageWidth - 14,
    18,
    { align: 'right' }
  )

  // Filter & Scope Card
  let currentY = 30
  doc.setFillColor(...lightBg)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...primaryColor)
  doc.text('AUDIT FILTERS & OPERATIONAL SCOPE:', 18, currentY + 5.5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...darkTextColor)

  const dateScope =
    filters.from || filters.to
      ? `${filters.from ? filters.from.slice(0, 10) : 'Start'} to ${filters.to ? filters.to.slice(0, 10) : 'Current Date'}`
      : 'All Historic Records'

  const catScope = filters.category
    ? categoryLabel(categories, filters.category) || filters.category
    : 'All Municipal Categories'

  doc.text(`Date Range: ${dateScope}`, 18, currentY + 11.5)
  doc.text(`Category: ${catScope}`, 110, currentY + 11.5)
  doc.text(`Total Records: ${issues.length} incident${issues.length === 1 ? '' : 's'}`, 210, currentY + 11.5)

  currentY += 21

  // Metric Summary KPIs row
  const criticalCount = issues.filter((i) => {
    const s = typeof i.severity === 'object' ? i.severity?.current : i.severity
    return s === 'critical'
  }).length

  const highCount = issues.filter((i) => {
    const s = typeof i.severity === 'object' ? i.severity?.current : i.severity
    return s === 'high'
  }).length

  const inProcessCount = issues.filter(
    (i) => i.status === 'in_process' || i.status === 'triaged' || i.status === 'acknowledged',
  ).length

  const resolvedCount = issues.filter(
    (i) => i.status === 'resolved' || i.status === 'closed',
  ).length

  const kpis = [
    { label: 'Total Incidents', value: String(issues.length), color: primaryColor },
    { label: 'Critical Severity', value: String(criticalCount), color: [225, 29, 72] }, // Rose-600
    { label: 'High Priority', value: String(highCount), color: [217, 119, 6] }, // Amber-600
    { label: 'In Review / Progress', value: String(inProcessCount), color: [2, 132, 199] }, // Sky-600
    { label: 'Resolved / Closed', value: String(resolvedCount), color: [16, 185, 129] }, // Emerald-600
  ]

  const kpiBoxWidth = (pageWidth - 28 - 4 * 4) / 5
  kpis.forEach((kpi, idx) => {
    const kpiX = 14 + idx * (kpiBoxWidth + 4)
    doc.setFillColor(...lightBg)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(kpiX, currentY, kpiBoxWidth, 14, 1.5, 1.5, 'FD')

    // Top indicator line
    doc.setFillColor(...kpi.color)
    doc.rect(kpiX, currentY, kpiBoxWidth, 1.5, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...mutedTextColor)
    doc.text(kpi.label, kpiX + 4, currentY + 5.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...kpi.color)
    doc.text(kpi.value, kpiX + 4, currentY + 11.5)
  })

  currentY += 18

  // Table Data mapping
  const tableData = issues.map((item) => {
    const sev = (typeof item.severity === 'object' ? item.severity?.current : item.severity) || 'medium'
    const cat = categoryLabel(categories, item.primaryCategory) || item.primaryCategory || 'Public Safety Incident'
    const statusLabel = (item.status || 'submitted').replace('_', ' ').toUpperCase()
    const reportNum = String(item.reportCount || item.reportsCount || 1)

    let locationStr = 'Coordinates N/A'
    if (item.representativeLocation) {
      const lat = item.representativeLocation.lat ?? item.representativeLocation.latitude
      const lng = item.representativeLocation.lng ?? item.representativeLocation.longitude
      if (typeof lat === 'number' && typeof lng === 'number') {
        locationStr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }
    }

    const openedDate =
      item.openedAt || item.createdAt ? formatDateTime(item.openedAt || item.createdAt) : 'N/A'

    return [
      `#UM-${shortId(item.id)}`,
      cat,
      sev.toUpperCase(),
      statusLabel,
      reportNum,
      locationStr,
      openedDate,
    ]
  })

  // Render Table
  autoTable(doc, {
    startY: currentY,
    head: [['Incident ID', 'Primary Category', 'Severity', 'Workflow Status', 'Reports', 'Coordinates', 'Reported At']],
    body: tableData.length > 0 ? tableData : [['No records matching current filters', '', '', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: darkTextColor,
      cellPadding: 2.8,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26 }, // ID
      1: { cellWidth: 62 }, // Category
      2: { fontStyle: 'bold', cellWidth: 26 }, // Severity
      3: { cellWidth: 32 }, // Status
      4: { halign: 'center', cellWidth: 18 }, // Reports
      5: { cellWidth: 40 }, // Coordinates
      6: { cellWidth: 'auto' }, // Date
    },
    didParseCell: (data) => {
      // Color severity cells
      if (data.section === 'body' && data.column.index === 2) {
        const val = String(data.cell.raw).toLowerCase()
        if (val === 'critical') {
          data.cell.styles.textColor = [225, 29, 72] // Rose-600
        } else if (val === 'high') {
          data.cell.styles.textColor = [217, 119, 6] // Amber-600
        } else if (val === 'medium') {
          data.cell.styles.textColor = [2, 132, 199] // Sky-600
        } else {
          data.cell.styles.textColor = [100, 116, 139] // Slate-500
        }
      }
      // Color status cells
      if (data.section === 'body' && data.column.index === 3) {
        const val = String(data.cell.raw).toLowerCase()
        if (val.includes('resolved') || val.includes('closed')) {
          data.cell.styles.textColor = [16, 185, 129] // Emerald-600
        } else if (val.includes('in progress')) {
          data.cell.styles.textColor = [217, 119, 6] // Amber-600
        }
      }
    },
    didDrawPage: (data) => {
      // Footer on every page
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...mutedTextColor)

      const footerY = pageHeight - 8
      doc.setDrawColor(226, 232, 240)
      doc.line(14, footerY - 2, pageWidth - 14, footerY - 2)

      doc.text(
        'UrbanMend City Operations Management System • Official Audit Record • Confidential',
        14,
        footerY + 2
      )
      doc.text(
        `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
        pageWidth - 14,
        footerY + 2,
        { align: 'right' }
      )
    },
    margin: { left: 14, right: 14, bottom: 14 },
  })

  // Download PDF
  const finalFilename =
    filename || `urbanmend_incident_report_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(finalFilename)
}

/**
 * Export municipal issues to a CSV file.
 */
export function exportIssuesCsv({
  issues = [],
  categories = [],
  filename = null,
}) {
  const headers = [
    'Incident ID',
    'Category',
    'Severity',
    'Workflow Status',
    'Report Count',
    'Latitude',
    'Longitude',
    'Reported At',
  ]

  const rows = issues.map((item) => {
    const sev = (typeof item.severity === 'object' ? item.severity?.current : item.severity) || 'medium'
    const cat = categoryLabel(categories, item.primaryCategory) || item.primaryCategory || 'Uncategorized'
    const status = item.status || 'submitted'
    const reportCount = item.reportCount || item.reportsCount || 1
    const lat = item.representativeLocation?.lat ?? item.representativeLocation?.latitude ?? ''
    const lng = item.representativeLocation?.lng ?? item.representativeLocation?.longitude ?? ''
    const openedAt = item.openedAt || item.createdAt || ''

    return [
      `#UM-${shortId(item.id)}`,
      `"${cat.replace(/"/g, '""')}"`,
      sev,
      status,
      reportCount,
      lat,
      lng,
      `"${openedAt}"`,
    ]
  })

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute(
    'download',
    filename || `urbanmend_incident_report_${new Date().toISOString().slice(0, 10)}.csv`
  )
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export authority personnel compliance report to PDF.
 */
export function exportAuthoritiesPdf({ authorities = [], filename = null }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const primaryColor = [14, 116, 144]
  const darkTextColor = [15, 23, 42]
  const mutedTextColor = [100, 116, 139]

  // Header Banner
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('UrbanMend Municipal Security & Governance', 14, 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('AUTHORITY PERSONNEL COMPLIANCE & ACCESS AUDIT', 14, 16)

  const nowStr = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  doc.setFontSize(8)
  doc.text(`Generated: ${nowStr}`, pageWidth - 14, 10, { align: 'right' })
  doc.text(`Total Authorities: ${authorities.length}`, pageWidth - 14, 16, { align: 'right' })

  const tableData = authorities.map((a) => [
    `#${shortId(a.id)}`,
    a.name,
    a.email,
    a.role,
    Array.isArray(a.scope) ? a.scope.join(', ') : a.scope || 'All',
    (a.status || 'Active').toUpperCase(),
  ])

  autoTable(doc, {
    startY: 28,
    head: [['ID', 'Full Name', 'Official Email', 'Role', 'Category Scope', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: darkTextColor,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didDrawPage: (data) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...mutedTextColor)
      const footerY = pageHeight - 8
      doc.setDrawColor(226, 232, 240)
      doc.line(14, footerY - 2, pageWidth - 14, footerY - 2)
      doc.text('UrbanMend Access Governance • Official Personnel Audit Record', 14, footerY + 2)
      doc.text(
        `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
        pageWidth - 14,
        footerY + 2,
        { align: 'right' }
      )
    },
    margin: { left: 14, right: 14, bottom: 14 },
  })

  doc.save(
    filename || `authority_compliance_report_${new Date().toISOString().slice(0, 10)}.pdf`
  )
}

/**
 * Export complete immutable audit event log to PDF.
 */
export function exportAuditLogPdf({ events = [], user = null, filename = null }) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const primaryColor = [14, 116, 144] // #0e7490
  const darkTextColor = [15, 23, 42] // #0f172a
  const mutedTextColor = [100, 116, 139] // #64748b

  // Header Banner
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 24, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('UrbanMend Security & Operational Audit Log', 14, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('IMMUTABLE SYSTEM ACTIVITY & DECISION RECORD', 14, 18)

  const nowStr = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  doc.setFontSize(8)
  doc.text(`Generated: ${nowStr}`, pageWidth - 14, 11, { align: 'right' })
  doc.text(
    `Exported by: ${user?.name || user?.email || 'System Administrator'}`,
    pageWidth - 14,
    18,
    { align: 'right' }
  )

  const tableData = events.map((e) => {
    const timeStr = formatDateTime(e.at)
    const actorStr = `${e.actorName || 'System'} (${e.actorEmail || (e.actorId ? shortId(e.actorId) : 'N/A')})\n[Role: ${(e.actorRole || 'System').toUpperCase()}]`
    const actionStr = e.action
    const targetStr = `${(e.targetType || 'entity').toUpperCase()} #${shortId(e.targetId)}`

    // Format changes summary
    let details = ''
    if (e.before || e.after) {
      const parts = []
      if (e.before) parts.push(`Before: ${JSON.stringify(e.before)}`)
      if (e.after) parts.push(`After: ${JSON.stringify(e.after)}`)
      details = parts.join(' | ')
    }
    const reason = e.metadata?.reason || e.after?.reason || ''
    if (reason) {
      details = details ? `${details} — Reason: "${reason}"` : `Reason: "${reason}"`
    }
    if (!details) details = 'Activity verified and committed.'

    return [
      timeStr,
      actorStr,
      actionStr,
      targetStr,
      details,
    ]
  })

  autoTable(doc, {
    startY: 30,
    head: [['Timestamp', 'Actor (Who)', 'Action Taken', 'Target Entity', 'Change Details & Audit Reason']],
    body: tableData.length > 0 ? tableData : [['No events recorded matching criteria', '', '', '', '']],
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: darkTextColor,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 32 }, // Timestamp
      1: { cellWidth: 55 }, // Actor
      2: { cellWidth: 44, fontStyle: 'bold' }, // Action
      3: { cellWidth: 32 }, // Target
      4: { cellWidth: 'auto' }, // Details & Reason
    },
    didDrawPage: (data) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...mutedTextColor)
      const footerY = pageHeight - 8
      doc.setDrawColor(226, 232, 240)
      doc.line(14, footerY - 2, pageWidth - 14, footerY - 2)
      doc.text('UrbanMend Audit System • Cryptographically Chained Immutable Log', 14, footerY + 2)
      doc.text(
        `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
        pageWidth - 14,
        footerY + 2,
        { align: 'right' }
      )
    },
    margin: { left: 14, right: 14, bottom: 14 },
  })

  doc.save(
    filename || `urbanmend_audit_log_${new Date().toISOString().slice(0, 10)}.pdf`
  )
}

/**
 * Export audit events to CSV.
 */
export function exportAuditLogCsv({ events = [], filename = null }) {
  const headers = [
    'Event ID',
    'Timestamp',
    'Actor Name',
    'Actor Email',
    'Actor Role',
    'Action',
    'Target Type',
    'Target ID',
    'Before State',
    'After State',
    'Reason / Metadata',
  ]

  const rows = events.map((e) => [
    e.id || '',
    `"${e.at || ''}"`,
    `"${(e.actorName || '').replace(/"/g, '""')}"`,
    `"${(e.actorEmail || '').replace(/"/g, '""')}"`,
    `"${(e.actorRole || '').replace(/"/g, '""')}"`,
    `"${(e.action || '').replace(/"/g, '""')}"`,
    `"${(e.targetType || '').replace(/"/g, '""')}"`,
    `"${(e.targetId || '').replace(/"/g, '""')}"`,
    `"${JSON.stringify(e.before || {}).replace(/"/g, '""')}"`,
    `"${JSON.stringify(e.after || {}).replace(/"/g, '""')}"`,
    `"${(e.metadata?.reason || e.after?.reason || '').replace(/"/g, '""')}"`,
  ])

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute(
    'download',
    filename || `urbanmend_audit_log_${new Date().toISOString().slice(0, 10)}.csv`
  )
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
