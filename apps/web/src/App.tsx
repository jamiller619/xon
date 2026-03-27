import { Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div>Dashboard</div>} />
      <Route path="/libraries/:id" element={<div>Library</div>} />
      <Route path="/media/:id" element={<div>Media Detail</div>} />
      <Route path="/search" element={<div>Search</div>} />
      <Route path="/admin" element={<div>Admin</div>} />
    </Routes>
  );
}
