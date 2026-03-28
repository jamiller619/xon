import { useEffect, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import styles from "./AdminUsers.module.css";

interface Library {
  id: string;
  name: string;
}

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface AccessEntry {
  userId: string;
  libraryId: string;
  username: string;
  displayName: string;
  role: string;
}

export default function AdminLibraryAccess() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");
  const [accessList, setAccessList] = useState<AccessEntry[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/libraries")
      .then((r) => r.json())
      .then((data: Library[]) => setLibraries(data))
      .catch(() => {});

    apiFetch("/api/v1/admin/users")
      .then((r) => r.json())
      .then((data: UserInfo[]) => setUsers(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedLibraryId) {
      setAccessList([]);
      return;
    }
    setLoadingAccess(true);
    apiFetch(`/api/v1/admin/libraries/${selectedLibraryId}/access`)
      .then((r) => r.json())
      .then((data: AccessEntry[]) => setAccessList(data))
      .catch(() => setAccessList([]))
      .finally(() => setLoadingAccess(false));
  }, [selectedLibraryId]);

  async function handleGrant() {
    if (!selectedLibraryId || !grantUserId) return;
    setGranting(true);
    setGrantError("");
    try {
      const res = await apiFetch(`/api/v1/admin/libraries/${selectedLibraryId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: grantUserId }),
      });
      if (!res.ok) {
        const body = await res.json();
        setGrantError((body as { error?: string }).error ?? "Failed to grant access");
        return;
      }
      setGrantUserId("");
      // Refresh access list
      const updated = await apiFetch(`/api/v1/admin/libraries/${selectedLibraryId}/access`).then(
        (r) => r.json()
      );
      setAccessList(updated as AccessEntry[]);
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(userId: string) {
    if (!selectedLibraryId) return;
    setRevoking(true);
    try {
      await apiFetch(`/api/v1/admin/libraries/${selectedLibraryId}/access/${userId}`, {
        method: "DELETE",
      });
      setAccessList((prev) => prev.filter((e) => e.userId !== userId));
      setConfirmRevokeId(null);
    } finally {
      setRevoking(false);
    }
  }

  const grantableUsers = users.filter((u) => !accessList.some((a) => a.userId === u.id));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Library Access Control</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formHeading}>Select Library</div>
        <select
          className={styles.input}
          value={selectedLibraryId}
          onChange={(e) => setSelectedLibraryId(e.target.value)}
        >
          <option value="">— choose a library —</option>
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.name}
            </option>
          ))}
        </select>
      </div>

      {selectedLibraryId && (
        <>
          <div className={styles.formCard}>
            <div className={styles.formHeading}>Grant Access</div>
            <div className={styles.formActions}>
              <select
                className={styles.input}
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
              >
                <option value="">— select user —</option>
                {grantableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.username})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleGrant}
                disabled={!grantUserId || granting}
              >
                {granting ? "Granting…" : "Grant"}
              </button>
            </div>
            {grantError && <div className={styles.error}>{grantError}</div>}
          </div>

          {loadingAccess ? (
            <div className={styles.loading}>Loading…</div>
          ) : accessList.length === 0 ? (
            <div className={styles.empty}>
              No users have been granted access to this library. Admin and manager roles can always
              access all libraries.
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>User</th>
                  <th className={styles.th}>Username</th>
                  <th className={styles.th}>Role</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accessList.map((entry) => (
                  <tr key={entry.userId} className={styles.row}>
                    <td className={styles.td}>{entry.displayName}</td>
                    <td className={`${styles.td} ${styles.mono}`}>{entry.username}</td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.badge} ${styles[`role_${entry.role}` as keyof typeof styles] ?? ""}`}
                      >
                        {entry.role}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {confirmRevokeId === entry.userId ? (
                        <span className={styles.rowActions}>
                          <span className={styles.confirmText}>Revoke?</span>
                          <button
                            type="button"
                            className={styles.deleteConfirmBtn}
                            onClick={() => handleRevoke(entry.userId)}
                            disabled={revoking}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => setConfirmRevokeId(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => setConfirmRevokeId(entry.userId)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
