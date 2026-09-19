# UrbanMend Frontend Plan

This plan is based on the screenshot references in this folder. The product should be implemented as one role-aware web application for UrbanMend, with a shared shell and three permission-scoped workspaces.

## 1. Product Structure

The application has three roles:

- **Citizen:** submit and track personal public-safety reports.
- **Authority:** triage, assign, investigate, and resolve reports within a jurisdiction.
- **Admin:** monitor system performance, moderate reports, and manage authority personnel.

All roles use the same authenticated application shell:

- Left sidebar navigation.
- Top search bar.
- Notification bell.
- User/profile menu.
- Pale blue-gray page background.
- White content panels with subtle borders.
- Fixed footer with organization, privacy, terms, language, and support links.

Navigation should remain consistent where possible:

- Dashboard
- Queue
- Map
- Reports
- Settings

The destination and content of each navigation item changes according to the user’s role.

## 2. Route Map

```text
/auth/login
/auth/forgot-password

/citizen/dashboard
/citizen/reports
/citizen/reports/new
/citizen/reports/new/details
/citizen/reports/new/review
/citizen/reports/:reportId
/citizen/map
/citizen/settings

/authority/dashboard
/authority/queue
/authority/queue/:reportId
/authority/map
/authority/reports
/authority/settings

/admin/dashboard
/admin/queue
/admin/moderation/:flagId
/admin/map
/admin/reports
/admin/authorities
/admin/authorities/new
/admin/authorities/:authorityId
/admin/settings
/admin/audit-log
```

Add route guards for authentication, role permissions, jurisdiction/category scope, and read-only versus write access.

## 3. Citizen Workspace

### Citizen Dashboard

Match the structure shown in `citizen-dashboard.png`:

- Overview heading and supporting text.
- KPI cards for processing, high-priority, and resolved reports.
- Primary “Report a Problem” action.
- Nearby activity card grid.
- Search by report ID, location, or keyword.
- Status badges on every report.
- “View all on Map” action.

### New Report Wizard

Use a three-step flow:

1. Category
2. Details
3. Review

Category step:

- Infrastructure hazard.
- Environmental issue.
- Traffic or road problem.
- Public health.
- Sanitation.
- Vandalism.
- Other configurable categories.

Details step:

- Map-based location picker.
- Address search.
- Draggable map pin.
- Description field.
- Photo upload with preview.
- File count, type, and size validation.
- Privacy notice explaining EXIF stripping and personal-data handling.

Review step:

- Category summary.
- Location summary.
- Description.
- Uploaded media.
- Edit links for each section.
- Final submission confirmation.

After submission:

- Show a confirmation state with the report ID.
- Display the initial AI classification and severity.
- Explain that an authority may review the classification.
- Link directly to status tracking.

### Citizen Report Details

Match `citizen-report-status-tracking.png`:

- Report title and ID.
- Submitted date and time.
- Category and location summary.
- Description.
- Main uploaded image.
- Location map.
- AI triage assessment.
- Status timeline.
- Assignment state.
- Resolution information when complete.
- Privacy and media-processing indicators.

Citizen report statuses:

- Draft
- Submitted
- Processing
- Assigned
- In Progress
- On Site
- Resolved
- Closed
- Rejected or Needs More Information

## 4. Authority Workspace

### Authority Dashboard

Match `authority-dashboard.png`:

- Total active cases.
- High-priority count.
- Average resolution time.
- Hotspot density.
- Queue status breakdown.
- Nearby activity panel.
- Quick access to the full queue.
- Jurisdiction or sector label near the page title.

### Authority Queue

Match `authority-queue.png`:

- Search reports, IDs, and locations.
- Filter by category, severity, status, date, and assignment.
- Sort by severity, age, and elapsed time.
- Manual entry action.
- Selectable table rows.
- Pagination.
- Empty, loading, and no-results states.
- Clear-all-filters control.

Recommended table columns:

- Severity
- Issue title and ID
- Location
- Status
- Assigned team or person
- Time elapsed
- Actions

### Incident Details

Match `authority-issu-details.png`:

- Incident title, ID, and current lifecycle status.
- Incident-area map.
- Bundled citizen reports.
- Related media.
- Lifecycle action panel.
- Current status selector.
- Assigned unit selector.
- Manual severity override.
- Required override reason.
- Internal notes.
- Audit trail.
- Timestamped activity history.

Authority actions should support:

- Assign or reassign a unit.
- Change status.
- Escalate severity.
- Request more information.
- Add internal notes.
- Mark as resolved.
- Link related reports.
- View original citizen submissions.

Every operational change must produce an audit event.

## 5. Admin Workspace

### Analytics Dashboard

Match `admin-dashboard.png`:

- Date-range selector.
- Total active cases.
- Average resolution time.
- Hotspot density.
- Reports-by-category chart.
- Severity distribution chart.
- Comparison with previous period.
- CSV export controls.
- Start date, end date, and category filters.

### Admin Moderation Queue

Match `admin-queue.png`:

- Tabs for All Flags, PII Detected, and Inappropriate.
- Flag severity indicator.
- Flagged report title and ID.
- Highlighted text or image concern.
- Submitter information.
- Automated triage source.
- Time since flagging.
- Review action area.

Moderation actions:

- Approve.
- Redact.
- Reject.
- Escalate for manual review.
- Mark as false positive.
- Suspend or restrict the submitting account when appropriate.

### Authority Provisioning

Match `admin-authority-provisioning.png`:

- Authority personnel table.
- Role.
- Category scope.
- Jurisdiction.
- Account status.
- Last activity.
- Provision new authority action.
- Active and revoked personnel summary.
- Role distribution chart.
- Compliance report export.

Provisioning form fields:

- Name and email.
- Organization.
- Role.
- Jurisdiction.
- Category scope.
- Access level.
- Account expiration.
- MFA requirement.
- Activation status.

Add an audit log for all provisioning, revocation, scope changes, and moderation decisions.

## 6. Shared Design System

The visual language from the screenshots should be formalized into reusable tokens.

### Visual Direction

- Background: very light blue-gray.
- Main text: dark navy.
- Primary accent: teal or green-teal.
- Borders: cool gray-blue, usually 1px.
- Panels: white with subtle borders.
- Dense but readable desktop layouts.
- Minimal decoration; hierarchy comes from spacing, borders, typography, and status color.

### Status Colors

- Critical: red.
- High: red-orange.
- Processing: gray-blue.
- Medium: amber.
- Low: green.
- Resolved: green.

Create tokens for color, typography, spacing, border radius, shadows, breakpoints, focus, disabled, and validation states.

Use a consistent icon library such as Lucide for navigation, status, map, upload, search, export, settings, and lifecycle actions.

### Reusable Components

- `AppShell`
- `Sidebar`
- `Topbar`
- `PageHeader`
- `MetricCard`
- `StatusBadge`
- `ReportCard`
- `DataTable`
- `FilterBar`
- `MapPanel`
- `Timeline`
- `StepIndicator`
- `UploadDropzone`
- `AuditTrail`
- `EmptyState`
- `ConfirmationDialog`
- `Toast`
- `SkeletonLoader`

## 7. Responsive Behavior

Desktop is the primary reference layout, but the frontend must support tablet and mobile.

### Desktop

- Persistent sidebar.
- Multi-column dashboard grids.
- Split map and detail layouts.
- Full data tables.

### Tablet

- Collapsible sidebar.
- Two-column dashboard grids.
- Reduced table columns.
- Sticky filter controls.

### Mobile

- Sidebar becomes a drawer or bottom navigation.
- KPI cards become horizontal scrolling cards or a two-column grid.
- Tables become stacked report cards.
- Split map/detail screens stack vertically.
- Upload and location controls use full width.
- Sticky primary actions for report submission and review.

Maintain stable dimensions for buttons, table rows, status chips, map panels, form fields, dashboard cards, and loading states.

## 8. State and Data Architecture

Use server-state caching for reports, queues, dashboards, users, and notifications. Keep filters, sorting, and pagination synchronized with the URL so views can be bookmarked and shared.

Recommended frontend entities:

- User
- Role
- Jurisdiction
- Report
- ReportLocation
- ReportMedia
- AIClassification
- Assignment
- StatusEvent
- ModerationFlag
- AuthorityProfile
- InternalNote
- AuditEvent
- Notification

Important frontend behaviors:

- Autosave citizen report drafts.
- Preserve form state between wizard steps.
- Use optimistic updates for assignment and status changes with rollback on failure.
- Poll or subscribe to live queue changes for authority users.
- Cache dashboard aggregates by selected date range.
- Hide unauthorized actions rather than only disabling them.
- Display clear permission-denied states for invalid deep links.

## 9. Accessibility and Trust

Implement:

- WCAG-compliant contrast.
- Keyboard navigation for all controls.
- Visible focus styles.
- Screen-reader labels for map, upload, filter, and icon-only actions.
- Error messages connected to their fields.
- Confirmation before destructive moderation or revocation actions.
- Clear timestamps and timezone handling.
- Status indicators that do not rely on color alone.
- Privacy explanations near photo upload and AI classification.

## 10. Implementation Phases

### Phase 1: Foundation

- Configure routing and authentication.
- Build the shared shell.
- Add design tokens.
- Implement navigation, topbar, footer, buttons, inputs, cards, badges, and dialogs.
- Add role-based route protection.

### Phase 2: Citizen MVP

- Citizen dashboard.
- Report submission wizard.
- Location picker.
- Media upload.
- Report details and timeline.
- Draft persistence and validation.

### Phase 3: Authority Operations

- Authority dashboard.
- Queue table and filters.
- Incident details.
- Assignment and lifecycle actions.
- Internal notes and audit trail.

### Phase 4: Admin Operations

- Analytics dashboard.
- Moderation queue.
- Authority provisioning.
- Compliance export.
- Admin audit log.

### Phase 5: Quality and Production Readiness

- Responsive layouts.
- Loading, empty, error, and offline states.
- Accessibility audit.
- Permission and edge-case testing.
- Visual regression testing against the screenshots.
- Performance optimization for maps, images, charts, and large queues.

## 11. Definition of Done

The frontend is ready when:

- Each role lands on the correct dashboard after login.
- Users cannot access unauthorized routes or actions.
- A citizen can submit a complete report and track it.
- An authority can filter, assign, update, and resolve a report.
- An admin can moderate content and manage authority access.
- Major screens have loading, empty, error, and success states.
- Desktop, tablet, and mobile layouts remain usable.
- The visual system matches the screenshots in spacing, color, density, and hierarchy.
- Critical workflows are covered by end-to-end tests.
- Keyboard navigation and contrast meet accessibility requirements.

The first implementation milestone should be the shared `AppShell` plus the citizen dashboard, because every later role reuses the same navigation, topbar, cards, status system, spacing, and responsive behavior.
