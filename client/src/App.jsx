import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { RequireAuth, RequireRole, RoleHomeRedirect } from './auth/guards'
import AppShell from './layout/AppShell'
import OfflineBanner from './components/ui/OfflineBanner'
import LoginPage from './pages/auth/LoginPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ForbiddenPage from './pages/ForbiddenPage'
import NotFoundPage from './pages/NotFoundPage'
import CitizenDashboardPage from './pages/citizen/DashboardPage'
import MyReportsPage from './pages/citizen/MyReportsPage'
import ReportWizardPage from './pages/citizen/ReportWizardPage'
import ReportTrackingPage from './pages/citizen/ReportTrackingPage'
import CitizenMapPage from './pages/citizen/CitizenMapPage'
import CitizenSettingsPage from './pages/citizen/CitizenSettingsPage'
import AuthorityDashboardPage from './pages/authority/AuthorityDashboardPage'
import QueuePage from './pages/authority/QueuePage'
import IssueDetailPage from './pages/authority/IssueDetailPage'
import AuthorityMapPage from './pages/authority/AuthorityMapPage'
import AuthorityReportsPage from './pages/authority/AuthorityReportsPage'
import AuthoritySettingsPage from './pages/authority/AuthoritySettingsPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import ModerationQueuePage from './pages/admin/ModerationQueuePage'
import AuthoritiesPage from './pages/admin/AuthoritiesPage'
import ProvisionAuthorityPage from './pages/admin/ProvisionAuthorityPage'
import AuthorityDetailPage from './pages/admin/AuthorityDetailPage'
import AdminMapPage from './pages/admin/AdminMapPage'
import AdminReportsPage from './pages/admin/AdminReportsPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AuditLogPage from './pages/admin/AuditLogPage'

function AuthorityQueueDetailRoute() {
  const { user } = useAuth()
  const { reportId } = useParams()
  if (user?.role === 'admin') {
    return <Navigate to={`/admin/queue/${reportId}`} replace />
  }
  return <IssueDetailPage />
}

/**
 * Route map = FRONTEND_PLAN.md §2, one-to-one.
 * All routes wired with real, role-protected screens.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OfflineBanner />
        <Routes>
          {/* Public */}
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />

          {/* Authenticated area */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<RoleHomeRedirect />} />

            {/* Citizen workspace */}
            <Route element={<RequireRole role="citizen" />}>
              <Route element={<AppShell />}>
                <Route path="/citizen/dashboard" element={<CitizenDashboardPage />} />
                <Route path="/citizen/queue" element={<MyReportsPage />} />
                <Route path="/citizen/reports" element={<MyReportsPage />} />
                <Route path="/citizen/reports/new" element={<ReportWizardPage />} />
                <Route path="/citizen/reports/new/details" element={<ReportWizardPage />} />
                <Route path="/citizen/reports/new/review" element={<ReportWizardPage />} />
                <Route path="/citizen/reports/:reportId" element={<ReportTrackingPage />} />
                <Route path="/citizen/map" element={<CitizenMapPage />} />
                <Route path="/citizen/settings" element={<CitizenSettingsPage />} />
              </Route>
            </Route>

            {/* Authority workspace */}
            <Route element={<RequireRole role={['authority', 'admin']} />}>
              <Route element={<AppShell />}>
                <Route path="/authority/queue/:reportId" element={<AuthorityQueueDetailRoute />} />
              </Route>
            </Route>

            <Route element={<RequireRole role="authority" />}>
              <Route element={<AppShell />}>
                <Route path="/authority/dashboard" element={<AuthorityDashboardPage />} />
                <Route path="/authority/queue" element={<QueuePage />} />
                <Route path="/authority/my-issues" element={<QueuePage />} />
                <Route path="/authority/map" element={<AuthorityMapPage />} />
                <Route path="/authority/reports" element={<AuthorityReportsPage />} />
                <Route path="/authority/settings" element={<AuthoritySettingsPage />} />
              </Route>
            </Route>

            {/* Admin workspace */}
            <Route element={<RequireRole role="admin" />}>
              <Route element={<AppShell />}>
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="/admin/queue" element={<ModerationQueuePage />} />
                <Route path="/admin/queue/:reportId" element={<IssueDetailPage />} />
                <Route path="/admin/moderation/:flagId" element={<ModerationQueuePage />} />
                <Route path="/admin/map" element={<AdminMapPage />} />
                <Route path="/admin/reports" element={<AdminReportsPage />} />
                <Route path="/admin/authorities" element={<AuthoritiesPage />} />
                <Route path="/admin/authorities/new" element={<ProvisionAuthorityPage />} />
                <Route path="/admin/authorities/:authorityId" element={<AuthorityDetailPage />} />
                <Route path="/admin/settings" element={<AdminSettingsPage />} />
                <Route path="/admin/audit-log" element={<AuditLogPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
