import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import ThemeLoader from "./components/ThemeLoader";
import AdminPlugins from "./pages/AdminPlugins";
import AdminUsers from "./pages/AdminUsers";
import Dashboard from "./pages/Dashboard";
import LibraryBrowser from "./pages/LibraryBrowser";
import Login from "./pages/Login";
import MediaDetail from "./pages/MediaDetail";
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
          <Route path="/search" element={<div>Search</div>} />
          <Route path="/admin/plugins" element={<AdminPlugins />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
