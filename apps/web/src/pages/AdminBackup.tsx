import { useEffect, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import styles from "./AdminBackup.module.css";

interface BackupTarget {
  id: string;
  name: string;
  type: "local" | "network";
  config: string;
  enabled: boolean;
  removeDeleted: boolean;
  schedule: string | null;
  retentionKeepCount: number | null;
  retentionKeepDays: number | null;
  nextScheduledAt: string | null;
  createdAt: string;
}

interface ScheduleForm {
  schedule: string;
  retentionKeepCount: string;
  retentionKeepDays: string;
}

export default function AdminBackup() {
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    schedule: "",
    retentionKeepCount: "",
    retentionKeepDays: "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadTargets();
  }, []);

  async function loadTargets() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/admin/backup/targets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BackupTarget[];
      setTargets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function openScheduleEditor(target: BackupTarget) {
    setEditingSchedule(target.id);
    setSaveError(null);
    setScheduleForm({
      schedule: target.schedule ?? "",
      retentionKeepCount:
        target.retentionKeepCount !== null ? String(target.retentionKeepCount) : "",
      retentionKeepDays: target.retentionKeepDays !== null ? String(target.retentionKeepDays) : "",
    });
  }

  async function saveSchedule(targetId: string) {
    setSaveError(null);
    const body: Record<string, unknown> = {
      schedule: scheduleForm.schedule || null,
      retentionKeepCount:
        scheduleForm.retentionKeepCount !== ""
          ? Number.parseInt(scheduleForm.retentionKeepCount, 10)
          : null,
      retentionKeepDays:
        scheduleForm.retentionKeepDays !== ""
          ? Number.parseInt(scheduleForm.retentionKeepDays, 10)
          : null,
    };

    try {
      const res = await apiFetch(`/api/v1/admin/backup/targets/${targetId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setEditingSchedule(null);
      await loadTargets();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  function formatNextRun(nextScheduledAt: string | null): string {
    if (!nextScheduledAt) return "—";
    const d = new Date(nextScheduledAt);
    return d.toLocaleString();
  }

  if (loading) return <div className={styles.page}>Loading...</div>;
  if (error) return <div className={styles.page}>Error: {error}</div>;

  return (
    <div className={styles.page}>
      <h1>Backup Targets</h1>

      {targets.length === 0 ? (
        <p className={styles.empty}>No backup targets configured.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Enabled</th>
              <th>Schedule</th>
              <th>Next Run</th>
              <th>Retention</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => (
              <tr key={target.id}>
                <td>{target.name}</td>
                <td>{target.type}</td>
                <td>{target.enabled ? "Yes" : "No"}</td>
                <td>
                  <code>{target.schedule ?? "—"}</code>
                </td>
                <td>{formatNextRun(target.nextScheduledAt)}</td>
                <td>
                  {target.retentionKeepCount !== null
                    ? `Keep ${target.retentionKeepCount} jobs`
                    : target.retentionKeepDays !== null
                      ? `Keep ${target.retentionKeepDays} days`
                      : "—"}
                </td>
                <td>
                  <button type="button" onClick={() => openScheduleEditor(target)}>
                    Edit Schedule
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingSchedule !== null && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Edit Schedule</h2>

            <label>
              Cron Expression
              <input
                type="text"
                placeholder="e.g. 0 2 * * * (daily at 2am)"
                value={scheduleForm.schedule}
                onChange={(e) => setScheduleForm((f) => ({ ...f, schedule: e.target.value }))}
              />
            </label>

            <label>
              Retention: keep N most recent jobs
              <input
                type="number"
                min={0}
                placeholder="e.g. 10"
                value={scheduleForm.retentionKeepCount}
                onChange={(e) =>
                  setScheduleForm((f) => ({ ...f, retentionKeepCount: e.target.value }))
                }
              />
            </label>

            <label>
              Retention: keep jobs for N days
              <input
                type="number"
                min={0}
                placeholder="e.g. 30"
                value={scheduleForm.retentionKeepDays}
                onChange={(e) =>
                  setScheduleForm((f) => ({ ...f, retentionKeepDays: e.target.value }))
                }
              />
            </label>

            {saveError && <p className={styles.error}>{saveError}</p>}

            <div className={styles.modalActions}>
              <button type="button" onClick={() => saveSchedule(editingSchedule)}>
                Save
              </button>
              <button type="button" onClick={() => setEditingSchedule(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
