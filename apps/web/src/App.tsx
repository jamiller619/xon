import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/error-boundary/ErrorBoundary'
import Layout from './components/layout/Layout'
import RequireAuth from './components/RequireAuth'
import ThemeLoader from './components/ThemeLoader'

// Route-level code splitting — each page is a separate JS chunk
const AdminAiSettings = lazy(() => import('./pages/admin/ai-settings/AdminAiSettings'))
const AdminBackup = lazy(() => import('./pages/admin/backup/AdminBackup'))
const AdminDuplicates = lazy(() => import('./pages/admin/duplicates/AdminDuplicates'))
const AdminHealth = lazy(() => import('./pages/admin/health/AdminHealth'))
const AdminLibraries = lazy(() => import('./pages/admin/libraries/AdminLibraries'))
const AdminLibraryAccess = lazy(() => import('./pages/admin/users/AdminLibraryAccess'))
const AdminNetworkSettings = lazy(() => import('./pages/admin/network-settings/AdminNetworkSettings'))
const AdminPlugins = lazy(() => import('./pages/admin/plugins/AdminPlugins'))
const AdminSettings = lazy(() => import('./pages/admin/settings/AdminSettings'))
const AdminUsers = lazy(() => import('./pages/admin/users/AdminUsers'))
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const GroupDetail = lazy(() => import('./pages/group-detail/GroupDetail'))
const LibraryBrowser = lazy(() => import('./pages/library-browser/LibraryBrowser'))
const Login = lazy(() => import('./pages/login/Login'))
const MediaDetail = lazy(() => import('./pages/media-detail/MediaDetail'))
const NotFound = lazy(() => import('./pages/not-found/NotFound'))
const Search = lazy(() => import('./pages/search/Search'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const Setup = lazy(() => import('./pages/setup/Setup'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeLoader />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/libraries/:id" element={<LibraryBrowser />} />
            <Route path="/media/:id" element={<MediaDetail />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/admin/libraries" element={<AdminLibraries />} />
            <Route path="/admin/plugins" element={<AdminPlugins />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route
              path="/admin/library-access"
              element={<AdminLibraryAccess />}
            />
            <Route path="/admin/duplicates" element={<AdminDuplicates />} />
            <Route path="/admin/ai-settings" element={<AdminAiSettings />} />
            <Route path="/admin/backup" element={<AdminBackup />} />
            <Route path="/admin/network" element={<AdminNetworkSettings />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/health" element={<AdminHealth />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
