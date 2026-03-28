import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ThemeLoader from "./components/ThemeLoader";
import AdminPlugins from "./pages/AdminPlugins";
import Dashboard from "./pages/Dashboard";
import LibraryBrowser from "./pages/LibraryBrowser";
import MediaDetail from "./pages/MediaDetail";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <>
      <ThemeLoader />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/libraries/:id" element={<LibraryBrowser />} />
          <Route path="/media/:id" element={<MediaDetail />} />
          <Route path="/search" element={<div>Search</div>} />
          <Route path="/admin/plugins" element={<AdminPlugins />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
