import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from '~/components/app/Layout'
import RequireAuth from '~/components/RequireAuth'
import RequireSetup from '../RequireSetup'

// Route-level code splitting — each page is a separate JS chunk
const AdminLibraries = lazy(
  () => import('~/pages/admin/libraries/AdminLibraries'),
)
const LogViewer = lazy(() => import('~/pages/admin/logs/LogViewer'))
const AdminPlugins = lazy(() => import('~/pages/admin/plugins/AdminPlugins'))
const AdminUsers = lazy(() => import('~/pages/admin/users/AdminUsers'))
const Sessions = lazy(() => import('~/pages/account/sessions/Sessions'))
const Dashboard = lazy(() => import('~/pages/dashboard/Dashboard'))
const CollectionBrowser = lazy(() => import('~/pages/collections/Collection'))
const LibraryBrowser = lazy(() => import('~/pages/libraries/Library'))
const Media = lazy(() => import('~/pages/media/Media'))
const NotFound = lazy(() => import('~/pages/not-found/NotFound'))
const Search = lazy(() => import('~/pages/search/Search'))
const Settings = lazy(() => import('~/pages/settings/Settings'))
const Setup = lazy(() => import('~/pages/setup/Setup'))

export default function Router() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route
        element={
          <RequireSetup>
            <RequireAuth>
              <Layout />
            </RequireAuth>
          </RequireSetup>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/libraries/:id" element={<LibraryBrowser />} />
        <Route path="/media/:title/:id" element={<Media />} />
        <Route path="/collections/:id" element={<CollectionBrowser />} />
        <Route path="/search" element={<Search />} />
        <Route path="/account/sessions" element={<Sessions />} />
        <Route path="/admin/libraries" element={<AdminLibraries />} />
        <Route path="/admin/plugins" element={<AdminPlugins />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/logs" element={<LogViewer />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route
        path="*"
        element={
          <RequireSetup>
            <NotFound />
          </RequireSetup>
        }
      />
    </Routes>
  )
}
