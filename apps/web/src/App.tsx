import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import LibraryBrowser from "./pages/LibraryBrowser";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/libraries/:id" element={<LibraryBrowser />} />
        <Route path="/media/:id" element={<div>Media Detail</div>} />
        <Route path="/search" element={<div>Search</div>} />
        <Route path="/admin" element={<div>Admin</div>} />
      </Route>
    </Routes>
  );
}
