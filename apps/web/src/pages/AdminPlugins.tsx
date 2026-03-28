import { useEffect, useState } from "react";
import PluginSlot from "../components/PluginSlot.js";
import styles from "./AdminPlugins.module.css";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  type: string;
  status: "active" | "inactive" | "loaded" | "error";
  error?: string;
}

export default function AdminPlugins() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/v1/admin/plugins")
      .then((r) => r.json() as Promise<PluginInfo[]>)
      .then(setPlugins)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setToggling((prev) => new Set([...prev, id]));
    fetch(`/api/v1/admin/plugins/${id}/toggle`, { method: "PUT" })
      .then((r) => r.json() as Promise<{ id: string; status: string }>)
      .then((updated) => {
        setPlugins((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: updated.status as PluginInfo["status"] } : p
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  const errorPlugins = plugins.filter((p) => p.status === "error" && p.error);

  return (
    <div className={styles.page ?? ""}>
      <h1 className={styles.heading ?? ""}>Plugin Management</h1>

      {loading ? (
        <p className={styles.loading ?? ""}>Loading…</p>
      ) : plugins.length === 0 ? (
        <p className={styles.empty ?? ""}>No plugins installed.</p>
      ) : (
        <table className={styles.table ?? ""}>
          <thead>
            <tr>
              <th className={styles.th ?? ""}>Name</th>
              <th className={styles.th ?? ""}>Version</th>
              <th className={styles.th ?? ""}>Type</th>
              <th className={styles.th ?? ""}>Status</th>
              <th className={styles.th ?? ""}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((plugin) => (
              <tr key={plugin.id} className={styles.row ?? ""}>
                <td className={styles.td ?? ""}>{plugin.name}</td>
                <td className={`${styles.td ?? ""} ${styles.version ?? ""}`}>{plugin.version}</td>
                <td className={styles.td ?? ""}>{plugin.type}</td>
                <td className={styles.td ?? ""}>
                  <span
                    className={`${styles.badge ?? ""} ${styles[`badge_${plugin.status}`] ?? ""}`}
                  >
                    {plugin.status}
                  </span>
                </td>
                <td className={styles.td ?? ""}>
                  {plugin.status !== "error" && (
                    <button
                      className={styles.toggleBtn ?? ""}
                      onClick={() => toggle(plugin.id)}
                      disabled={toggling.has(plugin.id)}
                      type="button"
                    >
                      {plugin.status === "active" ? "Disable" : "Enable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {errorPlugins.length > 0 && (
        <section className={styles.errorSection ?? ""}>
          <h2 className={styles.errorHeading ?? ""}>Load Errors</h2>
          {errorPlugins.map((p) => (
            <div key={p.id} className={styles.errorDetail ?? ""}>
              <strong>{p.name}</strong>
              <code className={styles.errorMessage ?? ""}>{p.error}</code>
            </div>
          ))}
        </section>
      )}

      <PluginSlot injectionPoint="admin-page" />
    </div>
  );
}
