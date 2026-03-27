import { Outlet } from "react-router-dom";
import { useAppStore } from "../store/index";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import styles from "./Layout.module.css";

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <div className={styles.shell ?? ""}>
      <Sidebar open={sidebarOpen} />
      <div
        className={`${styles.overlay ?? ""}${sidebarOpen ? ` ${styles.visible ?? ""}` : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div className={styles.main ?? ""}>
        <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className={styles.content ?? ""}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
