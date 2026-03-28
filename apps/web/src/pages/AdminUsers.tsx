import { useEffect, useState } from "react";
import { apiFetch } from "../apiFetch.js";
import styles from "./AdminUsers.module.css";

interface UserInfo {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "admin" | "manager" | "user" | "guest";
  createdAt: number;
}

type UserRole = "admin" | "manager" | "user" | "guest";
const ROLES: UserRole[] = ["admin", "manager", "user", "guest"];

interface CreateForm {
  username: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

interface EditForm {
  displayName: string;
  email: string;
  role: UserRole;
  password: string;
}

const EMPTY_CREATE: CreateForm = {
  username: "",
  email: "",
  displayName: "",
  password: "",
  role: "user",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    displayName: "",
    email: "",
    role: "user",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/admin/users")
      .then((r) => r.json() as Promise<UserInfo[]>)
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(user: UserInfo) {
    setEditingId(user.id);
    setEditForm({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      password: "",
    });
    setSaveError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setSaveError("");
    const body: Record<string, string> = {
      displayName: editForm.displayName,
      email: editForm.email,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;
    try {
      const res = await apiFetch(`/api/v1/admin/users/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaveError("Failed to save changes");
        return;
      }
      const updated = (await res.json()) as UserInfo;
      setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)));
      setEditingId(null);
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function submitCreate() {
    setCreating(true);
    setCreateError("");
    try {
      const res = await apiFetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        setCreateError("Failed to create user");
        return;
      }
      const newUser = (await res.json()) as UserInfo;
      setUsers((prev) => [...prev, newUser]);
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.page ?? ""}>
      <div className={styles.header ?? ""}>
        <h1 className={styles.heading ?? ""}>User Management</h1>
        <button
          type="button"
          className={styles.createBtn ?? ""}
          onClick={() => {
            setShowCreate(true);
            setCreateError("");
            setCreateForm(EMPTY_CREATE);
          }}
        >
          + Create User
        </button>
      </div>

      {showCreate && (
        <div className={styles.formCard ?? ""}>
          <h2 className={styles.formHeading ?? ""}>Create User</h2>
          {createError && <p className={styles.error ?? ""}>{createError}</p>}
          <div className={styles.formGrid ?? ""}>
            <label className={styles.label ?? ""}>
              Username
              <input
                className={styles.input ?? ""}
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              />
            </label>
            <label className={styles.label ?? ""}>
              Email
              <input
                className={styles.input ?? ""}
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className={styles.label ?? ""}>
              Display Name
              <input
                className={styles.input ?? ""}
                value={createForm.displayName}
                onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </label>
            <label className={styles.label ?? ""}>
              Password
              <input
                className={styles.input ?? ""}
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label className={styles.label ?? ""}>
              Role
              <select
                className={styles.input ?? ""}
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.formActions ?? ""}>
            <button
              type="button"
              className={styles.saveBtn ?? ""}
              onClick={submitCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              className={styles.cancelBtn ?? ""}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className={styles.loading ?? ""}>Loading…</p>
      ) : users.length === 0 ? (
        <p className={styles.empty ?? ""}>No users found.</p>
      ) : (
        <table className={styles.table ?? ""}>
          <thead>
            <tr>
              <th className={styles.th ?? ""}>Username</th>
              <th className={styles.th ?? ""}>Display Name</th>
              <th className={styles.th ?? ""}>Email</th>
              <th className={styles.th ?? ""}>Role</th>
              <th className={styles.th ?? ""}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) =>
              editingId === user.id ? (
                <tr key={user.id} className={styles.row ?? ""}>
                  <td className={styles.td ?? ""}>{user.username}</td>
                  <td className={styles.td ?? ""}>
                    <input
                      className={styles.inlineInput ?? ""}
                      value={editForm.displayName}
                      onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                    />
                  </td>
                  <td className={styles.td ?? ""}>
                    <input
                      className={styles.inlineInput ?? ""}
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </td>
                  <td className={styles.td ?? ""}>
                    <select
                      className={styles.inlineInput ?? ""}
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={styles.td ?? ""}>
                    <div className={styles.inlineActions ?? ""}>
                      <input
                        className={styles.inlineInput ?? ""}
                        type="password"
                        placeholder="New password (optional)"
                        value={editForm.password}
                        onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                      />
                      {saveError && <span className={styles.inlineError ?? ""}>{saveError}</span>}
                      <button
                        type="button"
                        className={styles.saveBtn ?? ""}
                        onClick={saveEdit}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className={styles.cancelBtn ?? ""} onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={user.id} className={styles.row ?? ""}>
                  <td className={`${styles.td ?? ""} ${styles.mono ?? ""}`}>{user.username}</td>
                  <td className={styles.td ?? ""}>{user.displayName}</td>
                  <td className={styles.td ?? ""}>{user.email}</td>
                  <td className={styles.td ?? ""}>
                    <span className={`${styles.badge ?? ""} ${styles[`role_${user.role}`] ?? ""}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className={styles.td ?? ""}>
                    <div className={styles.rowActions ?? ""}>
                      <button
                        type="button"
                        className={styles.editBtn ?? ""}
                        onClick={() => startEdit(user)}
                      >
                        Edit
                      </button>
                      {confirmDeleteId === user.id ? (
                        <>
                          <span className={styles.confirmText ?? ""}>Delete?</span>
                          <button
                            type="button"
                            className={styles.deleteConfirmBtn ?? ""}
                            onClick={() => confirmDelete(user.id)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id ? "Deleting…" : "Yes"}
                          </button>
                          <button
                            type="button"
                            className={styles.cancelBtn ?? ""}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.deleteBtn ?? ""}
                          onClick={() => setConfirmDeleteId(user.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
