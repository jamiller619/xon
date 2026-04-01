import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import ThemeLoader from './components/ThemeLoader'

// Route-level code splitting — each page is a separate JS chunk
const AdminAiSettings = lazy(() => import('./pages/AdminAiSettings'))
const AdminBackup = lazy(() => import('./pages/AdminBackup'))
const AdminDuplicates = lazy(() => import('./pages/AdminDuplicates'))
const AdminHealth = lazy(() => import('./pages/AdminHealth'))
const AdminLibraries = lazy(() => import('./pages/AdminLibraries'))
const AdminLibraryAccess = lazy(() => import('./pages/AdminLibraryAccess'))
const AdminNetworkSettings = lazy(() => import('./pages/AdminNetworkSettings'))
const AdminPlugins = lazy(() => import('./pages/AdminPlugins'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const GroupDetail = lazy(() => import('./pages/GroupDetail'))
const LibraryBrowser = lazy(() => import('./pages/LibraryBrowser'))
const Login = lazy(() => import('./pages/Login'))
const MediaDetail = lazy(() => import('./pages/MediaDetail'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Search = lazy(() => import('./pages/Search'))
const Settings = lazy(() => import('./pages/Settings'))
const Setup = lazy(() => import('./pages/Setup'))

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
