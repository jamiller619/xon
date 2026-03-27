import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/libraries/:id" element={<div>Library</div>} />
        <Route path="/media/:id" element={<div>Media Detail</div>} />
        <Route path="/search" element={<div>Search</div>} />
        <Route path="/admin" element={<div>Admin</div>} />
      </Route>
    </Routes>
  );
}
