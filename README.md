# UrbanMend (নগর সেবা) - Municipal Civic Issue Platform

> **UrbanMend** is an AI-powered municipal civic reporting, automated triage, and community corroboration platform designed for urban governance (Dhaka Metropolitan Area). It bridges the gap between citizens, municipal service authorities, and city administrators.

---

## 📑 Table of Contents
1. [Platform Architecture & User Roles](#platform-architecture--user-roles)
2. [Citizen Portal — Features & Functions Overview](#citizen-portal--features--functions-overview)
   - [1. Authentication & Profile Management](#1-authentication--profile-management)
   - [2. Citizen Dashboard](#2-citizen-dashboard)
   - [3. Problem Reporting Wizard & AI Triage](#3-problem-reporting-wizard--ai-triage)
   - [4. Real-Time Report Tracking & Details](#4-real-time-report-tracking--details)
   - [5. Community Issues](#5-community-issues)
   - [6. Citizen Interactive Map](#6-citizen-interactive-map)
   - [7. My Reports Portal](#7-my-reports-portal)
   - [8. Citizen Settings & Profile Management](#8-citizen-settings--profile-management)
3. [Authority Portal — Features & Workflow](#authority-portal--features--workflow)
   - [1. Executive Operations Dashboard](#1-executive-operations-dashboard)
   - [2. Department Work Queue](#2-department-work-queue)
   - [3. "My Issues" Assigned Task Queue](#3-my-issues-assigned-task-queue)
   - [4. Comprehensive Issue Detail & Lifecycle Management](#4-comprehensive-issue-detail--lifecycle-management)
   - [5. Authority Operations Map](#5-authority-operations-map)
   - [6. Authority Profile & Operations Settings](#6-authority-profile--operations-settings)
4. [Admin Portal — Blueprint & Features](#admin-portal--blueprint--features)
5. [Technical Stack & Real-Time Sync Engine](#technical-stack--real-time-sync-engine)
6. [Future Expansion Roadmap](#future-expansion-roadmap)

---

## 👥 Platform Architecture & User Roles

UrbanMend is divided into three distinct, role-gated portals:

| Role | Access Level | Primary Objectives |
| :--- | :--- | :--- |
| **Citizen (নাগরিক)** | Public / Verified Citizen | Report civic hazards, corroborate ("Me Too") neighborhood issues, track resolution live on timeline & map. |
| **Authority (কর্তৃপক্ষ)** | Municipal Workers & Engineers | Inspect assigned department issues, adjust severity/status, dispatch crews, add internal notes, and mark resolved. |
| **Admin (প্রশাসক)** | City Super-Administrators | System-wide analytics, provision authority accounts, moderate reports, review audit logs, and configure AI clustering. |

---

## 🏛️ Citizen Portal — Features & Functions Overview

The **Citizen Portal** is tailored for fast, intuitive, and mobile-friendly community reporting with instant feedback. Below is a full breakdown of all functions and features available to citizens:

```mermaid
flowchart TD
    A["Citizen Login (Google / Email)"] --> B["Citizen Dashboard"]
    B --> C["Submit New Problem (AI-Assisted)"]
    B --> D["Nearby Activity (GPS Radius)"]
    B --> E["Community Processing Queue"]
    B --> F["City Interactive Map"]
    B --> G["My Reports Page"]
    
    C --> H["Gemini AI Auto-Classification & Clustering"]
    H --> I["Report Status Tracking Page"]
    D --> J["Instant 'Me Too / Confirm' Corroboration"]
    E --> J
    I --> J
```

---

### 1. Authentication & Profile Management

* **Firebase & Google OAuth Integration:**
  * One-click login with Google account (`GoogleAuthProvider`).
  * Email and Password login/registration fallback.
* **Live Profile Synchronization:**
  * Citizen's real Google display name and high-resolution profile photo are extracted and persisted in `localStorage` and `AuthContext`.
* **Animated Profile Dropdown Menu (`UserMenu.jsx`):**
  * Displays user avatar, verified Google badge, full name, email, and active role.
  * Smooth cubic-bezier opening and closing animation (`transition: 0.75s` with `0.3s` delay).
* **Citizen Settings Page (`/citizen/settings`):**
  * Displays profile avatar card with Google verification indicator.
  * Account details, preferred language switcher, notification toggles, and secure logout.

---

### 2. Citizen Dashboard (`/citizen/dashboard`)

* **Real-time KPI Metric Counters:**
  * **Processing:** Active civic cases currently under investigation or work.
  * **High Priority:** Urgent incidents requiring immediate municipal response.
  * **Resolved:** Total civic problems successfully repaired and closed this month.
* **GPS-Powered "Nearby Activity" Feed:**
  * Automatically detects citizen's GPS coordinates via browser geolocation.
  * Calculates exact distance using the **Haversine formula**.
  * Dynamic radius filtering: Displays issues within 1 km or 5 km of the citizen's location.
* **Community Issue Cards (`CommunityIssueCard.jsx`):**
  * Photo evidence thumbnail with fallback categories.
  * Category badge (Roads, Water & Drainage, Electrical, etc.).
  * Severity indicators (**Critical**, **High**, **Medium**, **Low**).
  * Resolution status pill (Submitted, Under Review, Dispatched, In Progress, Solved).
  * Distance pill (e.g., `350 m away`, `1.2 km away`).
  * Bundled report indicator (shows when multiple citizen complaints are merged into one cluster).
* **Instant "Me Too / Confirm" Button:**
  * Allows citizens to corroborate a problem with zero delay (0ms optimistic cache update).
  * Immediately updates the affected citizen count on both the button and card text.
* **Quick Navigation:**
  * One-click "Report a Problem" modal launcher.
  * "Track" button on each card for deep-dive status inspection.

---

### 3. Problem Reporting Wizard & AI Triage (`/citizen/reports/new`)

* **Multi-Step Guided Flow (`ReportWizardPage.jsx` / `ReportSubmitModal.jsx`):**
  * Step 1: Upload photo evidence.
  * Step 2: Set exact location on map or use device GPS.
  * Step 3: Select category & write description.
  * Step 4: Review AI assessment and submit.
* **Photo Upload & EXIF Privacy Sanitization:**
  * Accepts camera capture and file uploads (JPEG/PNG/WebP).
  * Client-side metadata stripping prevents leaking sensitive citizen device EXIF information.
* **Interactive Map Pinning:**
  * Integrated Dhaka city boundary polygon verification.
  * Draggable pin marker with reverse-geocoded road and area names.
* **Google Gemini AI Automated Triage:**
  * Multi-modal AI analyzes the uploaded photo and text description.
  * Assigns category, severity signal, and confidence score.
  * Generates an engineering rationale explaining why the issue is critical or moderate.
  * Built-in keyword fallback classifier in case of network disruptions.
* **Instant Redirection:** Automatically navigates to the tracking page upon submission.

---

### 4. Real-Time Report Tracking & Details (`/citizen/reports/:reportId`)

* **0ms Instant Cache Loading:**
  * Pre-loaded from React Query cache: Displays issue title, photo, location, and corroboration count with zero skeleton loading delay.
* **4-Stage Visual Status Timeline (`StatusTimeline.jsx`):**
  1. **Report Submitted:** Timestamp of submission.
  2. **AI Classification:** AI model assessment, confidence percentage, and triage rationale.
  3. **Assigned to Authority:** Department dispatch status and assigned official handle.
  4. **Issue Resolution:** Completion timestamp and post-repair verification.
* **Dual "Me Too / Confirm" Action Buttons:**
  * One in the top sticky action bar.
  * One in the highlighted community callout box ("Does this problem affect your area too?").
  * Both buttons stay synchronized with live citizen corroboration counts.
* **Evidence Photo Gallery (`ReportMediaGallery.jsx`):**
  * High-resolution viewer with "Verified Photo" badge.
* **Interactive Map Panel (`MapPanel.jsx`):**
  * Displays pinpoint GPS marker, latitude/longitude, and street address.
* **Author Edit Modal (`EditReportModal.jsx`):**
  * Allows the reporting citizen to edit description or add details until an authority officially locks/acknowledges the case.
* **Resolution Success Banner:**
  * Displays emerald verification banner when the issue is marked solved by municipal teams.

---

### 5. Community Issues (`/citizen/queue`)

* **Comprehensive Civic Incident Feed (formerly Processing Queue):**
  * Live feed of active civic issues and municipal operations currently being resolved across your area.
* **Live Aggregate Summary Bar:**
  * Shows total active issues and total affected citizens count across the entire sector.
* **Multi-Dimensional Filters:**
  * **Search:** Free-text keyword search across titles, descriptions, and locations.
  * **Category Filter:** Filter by Roads, Water & Drainage, Waste Management, Streetlights, Parks, etc.
  * **Severity Filter:** Critical, High, Medium, Low.
  * **Status Filter:** In Progress, Acknowledged, Under Review.
  * **"My Reports Only" Switch:** Quickly isolate your own submitted issues.
* **Intelligent Proximity Sorting:**
  * **Nearest First (GPS):** Sorts by physical proximity using Haversine calculation.
  * **Most Corroborations:** Highlights hotspots affecting the most community members.
  * **Newest First:** Real-time stream of recent submissions.
  * **Oldest First:** Identifies aging unaddressed problems.
* **Direct Actions:**
  * Instant "Me Too / Confirm" corroboration directly from any issue card.

---

### 6. Citizen Interactive Map (`/citizen/map`)

* **Interactive Fullscreen Map (`CitizenMapPage.jsx`):**
  * Powered by Leaflet / MapLibre with OpenStreetMap tiles.
  * Outlines Dhaka city ward boundaries and operational zones.
* **Dynamic Viewport Clustering:**
  * Fetches GeoJSON clusters and markers based on the current map bounding box (`bbox`) and zoom level.
* **Severity-Coded Markers:**
  * Red (Critical), Orange (High), Amber (Medium), Gray (Low).
* **Interactive Marker Popups:**
  * Displays photo thumbnail, category, street address, citizen corroboration count, and one-click "Track" button.
* **Floating Filter Controls:**
  * Filter map markers by category, severity, and status in real-time.

---

### 7. My Reports Portal (`/citizen/reports`)

* **Citizen's Personal Incident Archive (`MyReportsPage.jsx`):**
  * Central archive of all reports submitted by the authenticated citizen.
* **Dynamic Status Tabs & Live Counts:**
  * **All My Reports:** Complete chronological archive with total submission tally.
  * **Active in Processing:** Complaints currently undergoing investigation, dispatch, or field repair.
  * **Solved & Verified:** Successfully resolved complaints with official closure timestamps.
* **Search & Status Filtering:**
  * Instant search across description, ID, category, or address.
  * Filter dropdown for In Progress, Under Review, Submitted, and Solved statuses.
* **Direct Actions:**
  * Edit pending reports via polished `EditReportModal` (with clear notice banner and responsive action buttons).
  * One-click transition to Community Issues feed or live incident tracking.

---

### 8. Citizen Settings & Profile Management (`/citizen/settings`)

* **Executive Citizen Workspace:**
  * Modern, full-width responsive profile management interface.
* **Custom Profile Photo Upload:**
  * Circular avatar with camera upload badge.
  * Client-side canvas compression (max 800x800, JPEG 85%) for fast, lightweight photo saving.
* **Editable Display Name:**
  * Edit citizen display name with instant state persistence across the app.
* **Civic Impact Metrics:**
  * Dynamically computes total reports submitted and successfully resolved community issues.
* **Preferences & Security:**
  * Preferred language toggle (Bangla / English), email notification preferences, and account management.

---

## 🛠️ Authority Portal — Features & Workflow

The **Authority Portal** is an enterprise-grade operational command center designed for municipal field engineers, zonal inspectors, and department dispatchers across Dhaka city divisions.

```mermaid
flowchart LR
    A["Authority Login"] --> B["Authority Dashboard"]
    B --> C["Work Queue (/authority/queue)"]
    B --> D["My Assigned Issues (/authority/my-issues)"]
    B --> E["Jurisdiction Map (/authority/map)"]
    B --> F["Executive Settings (/authority/settings)"]
    
    C --> G["Assign / Review Issue"]
    G --> H["Issue Detail & Lifecycle (/authority/issues/:id)"]
    D --> H
    H --> I["Update Status (In Progress / Solved)"]
    H --> J["Override Severity (with Audit Reason)"]
    H --> K["Print Work Order / PDF Export"]
    H --> L["Add Internal Notes & Citizen Updates"]
```

### 1. Executive Operations Dashboard (`/authority/dashboard`)
* **Department-Scoped Real-time KPIs:**
  * **Active Work Queue:** Total unresolved cases within the authority's assigned department and jurisdiction.
  * **High & Critical Alerts:** Urgent public safety hazards requiring immediate response.
  * **In Progress Work Orders:** Field crews currently deployed on-site.
  * **Monthly Resolved:** Volume of verified repairs completed in the current billing cycle.
* **Urgent SLA Attention Feed:**
  * Prioritized listing of overdue or high-impact incidents with direct "Review & Dispatch" links.
* **Manual Walk-In Entry Modal (`ManualEntryModal.jsx`):**
  * Allows operators to log civic complaints received via walk-in counter, telephone hotline, or field inspection.

### 2. Department Work Queue (`/authority/queue`)
* **Review, Assign & Resolve Workflow:**
  * Streamlined municipal triage for incoming citizen reports and clustered issues.
* **Smart Filtering & Faceting:**
  * Filter by category, severity level, status, and proximity.
* **Assignment Engine:**
  * Assign issues to specific field officers, maintenance teams, or assign directly to oneself.
* **Batch Operations:**
  * Fast multi-select for bulk status updates and crew dispatches.

### 3. "My Issues" Assigned Task Queue (`/authority/my-issues`)
* **Dedicated Personal Workspace:**
  * Filtered view exclusively showing issues assigned to the logged-in authority officer.
* **Live Sidebar Notification Badge:**
  * Real-time numeric badge (`badgeKey: 'myIssues'`) notifying the officer of pending assigned workloads.

### 4. Comprehensive Issue Detail & Lifecycle Management (`/authority/issues/:issueId`)
* **Standard Municipal Lifecycle Transitions:**
  * Move cases through `Acknowledged` ➔ `In Progress` ➔ `Resolved` ➔ `Closed` ➔ `Rejected`.
* **Official Severity Override Engine:**
  * Authoritative override of AI-calculated severity (e.g. escalating Medium to Critical) with mandatory audit reason logging.
* **Report Clustering & Duplicate Management:**
  * Inspect all citizen reports merged into the parent issue.
  * Detach or re-cluster misclassified submissions.
* **Dual-Channel Incident Communication:**
  * **Internal Notes:** Confidential communication between municipal staff and field supervisors.
  * **Public Progress Updates:** Citizen-facing announcements visible on the public tracking timeline.
* **Official Work Order PDF Generation:**
  * One-click generation of formatted Municipal Work Order PDFs via `jspdf` and `jspdf-autotable`.
  * Includes department header, incident coordinates, QR code, assigned crew details, and signature blocks.

### 5. Authority Operations Map (`/authority/map`)
* **Zonal GIS Command Center:**
  * High-density incident clustering with severity heatmaps.
  * Filter by municipal ward boundaries and active crew locations.

### 6. Authority Profile & Operations Settings (`/authority/settings`)
* **Executive 2-Column Workspace:**
  * Full-width modern interface with high-contrast layout.
* **Official Avatar & Department Banner:**
  * Department identity card with official Municipal Shield badge.
  * Circular avatar with client-side canvas-compressed photo upload.
* **Jurisdiction & Contact Details:**
  * Official municipal ID, assigned department (e.g. Roads & Transport, Water & Drainage), contact email, and operational sector.
* **Operational Preferences:**
  * Dispatch notifications, emergency SMS alerts, and automated triage thresholds.

---

## 🛡️ Admin Portal — Blueprint & Features

*(Designed for city commissioners, department heads, and platform super-administrators)*

* **Admin Dashboard (`/admin/dashboard`):**
  * City-wide high-level operational intelligence and performance analytics.
  * Resolution time averages per department, citizen satisfaction trends.
* **Authority Account Provisioning (`/admin/authorities/provision`):**
  * Create, invite, and provision municipal authority officers.
  * Assign jurisdiction wards, department types, and permission roles.
* **Authority Directory (`/admin/authorities` & `/admin/authorities/:authorityId`):**
  * Manage active municipal worker accounts, monitor case completion rates.
* **Moderation Queue (`/admin/moderation`):**
  * Review flagged, inappropriate, or spam citizen submissions.
  * Soft-delete, hide, or ban malicious accounts.
* **System Audit Logs (`/admin/audit-logs`):**
  * Immutable event stream tracking every status change, severity override, merge, and login event.
* **Admin Map & City Boundary Configuration (`/admin/map`):**
  * Upload and modify GeoJSON boundary polygons for city zones.

---

## ⚙️ Technical Stack & Real-Time Sync Engine

### Frontend Architecture
* **Framework:** React 18 with Vite.
* **State & Caching:** TanStack React Query (`@tanstack/react-query`).
  * **Optimistic UI Engine:** Mutations (`useConfirmIssue`, `useWithdrawConfirmation`) instantly update query caches for `['issues']`, `['reports']`, and `['map-issues']` before the network request finishes.
  * **Automatic Rollback:** Reverts seamlessly if a network error occurs.
* **Styling & Icons:** Tailwind CSS with custom theme variables, Lucide React icons.
* **Document Generation:** `jspdf` & `jspdf-autotable` for client-side printable work order generation.
* **Maps & Geo:** Leaflet, React-Leaflet, OpenStreetMap, MapLibre.
* **Auth:** Firebase Authentication SDK (Google Auth & Email) with role-gated routing.

### Backend Architecture
* **Framework:** Python 3.12, Django 5.x, Django REST Framework (DRF).
* **Database & GIS:** PostgreSQL 16 with PostGIS extension for spatial queries.
* **Async Workers & Queue:** Celery with Redis for background tasks, clustering calculations, and EXIF processing.
* **AI Engine:** Google Gemini API for multimodal image understanding and automated triage.

---

## 🚀 Future Expansion Roadmap

1. **Bilingual Toggle (বাংলা / English):**
   * Dedicated internationalization (i18n) layer for citizen-friendly Bengali and English UI switching.
2. **Push Notifications & SMS Alerts:**
   * Automated SMS/Web-Push notifications to citizens when their reported issue changes status.
3. **Citizen Karma & Community Leaderboard:**
   * Gamification badges for civic-minded citizens who help corroborate and report neighborhood hazards.
4. **Offline PWA Support:**
   * Allow citizens to snap photos and queue reports while offline, automatically uploading when network reconnects.

---
*Maintained by the UrbanMend Engineering Team.*
