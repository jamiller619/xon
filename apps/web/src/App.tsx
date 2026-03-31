import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import ThemeLoader from "./components/ThemeLoader";
import AdminAiSettings from "./pages/AdminAiSettings";
import AdminBackup from "./pages/AdminBackup";
import AdminDuplicates from "./pages/AdminDuplicates";
import AdminLibraryAccess from "./pages/AdminLibraryAccess";
import AdminNetworkSettings from "./pages/AdminNetworkSettings";
import AdminPlugins from "./pages/AdminPlugins";
import AdminUsers from "./pages/AdminUsers";
import Dashboard from "./pages/Dashboard";
import GroupDetail from "./pages/GroupDetail";
import LibraryBrowser from "./pages/LibraryBrowser";
import Login from "./pages/Login";
import MediaDetail from "./pages/MediaDetail";
import Search from "./pages/Search";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <>
      <ThemeLoader />
      <Routes>
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
          <Route path="/admin/plugins" element={<AdminPlugins />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/library-access" element={<AdminLibraryAccess />} />
          <Route path="/admin/duplicates" element={<AdminDuplicates />} />
          <Route path="/admin/ai-settings" element={<AdminAiSettings />} />
          <Route path="/admin/backup" element={<AdminBackup />} />
          <Route path="/admin/network" element={<AdminNetworkSettings />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
