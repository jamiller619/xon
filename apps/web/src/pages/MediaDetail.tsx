import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./MediaDetail.module.css";

interface MediaDetailItem {
  id: string;
  title: string | null;
  description: string | null;
  mediaCategory: string | null;
  mimeType: string | null;
  fileSize: number | null;
  filePath: string;
  fileName: string;
  metadata: string;
  drmProtected: boolean;
  createdAt: number | null;
  scannedAt: number | null;
  thumbnailUrls: { small: string; medium: string; large: string } | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts: number | null): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleString();
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className={styles.metaRow ?? ""}>
      <td className={styles.metaLabel ?? ""}>{label}</td>
      <td className={styles.metaValue ?? ""}>{value}</td>
    </tr>
  );
}

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<MediaDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/v1/media/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setItem(data as MediaDetailItem);
        setLoading(false);
      })
      .catch(() => {
        setError("Media item not found.");
        setLoading(false);
      });
  }, [id]);

  function startEditing() {
    if (!item) return;
    setEditTitle(item.title ?? "");
    setEditDescription(item.description ?? "");
    let tags: string[] = [];
    try {
      const meta = JSON.parse(item.metadata) as Record<string, unknown>;
      if (Array.isArray(meta.tags)) tags = meta.tags as string[];
    } catch {
      // ignore
    }
    setEditTags(tags.join(", "));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError(null);
  }

  async function saveEditing() {
    if (!item || !id) return;
    setSaving(true);
    setSaveError(null);
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const payload: Record<string, unknown> = {};
    if (editTitle.trim()) payload.title = editTitle.trim();
    if (editDescription !== item.description) payload.description = editDescription;
    payload.tags = tags;

    try {
      const res = await fetch(`/api/v1/media/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = (await res.json()) as MediaDetailItem;
      setItem(updated);
      setEditing(false);
    } catch {
      setSaveError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page ?? ""}>
        <div className={styles.skeleton ?? ""}>
          <div className={styles.skeletonPoster ?? ""} />
          <div className={styles.skeletonInfo ?? ""}>
            <div className={styles.skeletonTitle ?? ""} />
            <div className={styles.skeletonLine ?? ""} />
            <div className={styles.skeletonLine ?? ""} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.page ?? ""}>
        <div className={styles.errorBox ?? ""}>
          <p>{error ?? "Something went wrong."}</p>
          <Link to="/" className={styles.backLink ?? ""}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  let parsedMeta: Record<string, unknown> = {};
  try {
    parsedMeta = JSON.parse(item.metadata) as Record<string, unknown>;
  } catch {
    // ignore
  }

  const metaEntries = Object.entries(parsedMeta).filter(
    ([k, v]) => k !== "tags" && v !== null && v !== undefined && v !== "" && !Array.isArray(v)
  );
  const metaArrayEntries = Object.entries(parsedMeta).filter(
    ([k, v]) => k !== "tags" && Array.isArray(v)
  );
  const tags = Array.isArray(parsedMeta.tags) ? (parsedMeta.tags as string[]) : [];

  return (
    <div className={styles.page ?? ""}>
      <div className={styles.breadcrumb ?? ""}>
        <Link to="/" className={styles.breadcrumbLink ?? ""}>
          Dashboard
        </Link>
        <span className={styles.breadcrumbSep ?? ""}>/</span>
        <span className={styles.breadcrumbCurrent ?? ""}>{item.title ?? item.fileName}</span>
      </div>

      <div className={styles.hero ?? ""}>
        {/* Poster / thumbnail */}
        <div className={styles.poster ?? ""}>
          {item.drmProtected && (
            <div className={styles.drmOverlay ?? ""}>
              <span className={styles.lockIcon ?? ""}>🔒</span>
            </div>
          )}
          {item.thumbnailUrls ? (
            <img
              src={item.thumbnailUrls.large}
              alt={item.title ?? item.fileName}
              className={styles.posterImg ?? ""}
            />
          ) : (
            <div className={styles.posterPlaceholder ?? ""}>
              <span className={styles.posterIcon ?? ""}>▶</span>
            </div>
          )}
        </div>

        {/* Title + actions */}
        <div className={styles.heroInfo ?? ""}>
          {editing ? (
            <div className={styles.editForm ?? ""}>
              <div className={styles.editField ?? ""}>
                <label className={styles.editLabel ?? ""} htmlFor="edit-title">
                  Title
                </label>
                <input
                  id="edit-title"
                  className={styles.editInput ?? ""}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className={styles.editField ?? ""}>
                <label className={styles.editLabel ?? ""} htmlFor="edit-description">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  className={styles.editTextarea ?? ""}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className={styles.editField ?? ""}>
                <label className={styles.editLabel ?? ""} htmlFor="edit-tags">
                  Tags (comma-separated)
                </label>
                <input
                  id="edit-tags"
                  className={styles.editInput ?? ""}
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g. action, drama, sci-fi"
                />
              </div>
              {saveError && <p className={styles.saveError ?? ""}>{saveError}</p>}
              <div className={styles.editActions ?? ""}>
                <button
                  type="button"
                  className={styles.btnSave ?? ""}
                  onClick={saveEditing}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className={styles.btnCancel ?? ""}
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.titleRow ?? ""}>
                <h1 className={styles.title ?? ""}>{item.title ?? item.fileName}</h1>
                <button
                  type="button"
                  className={styles.btnEdit ?? ""}
                  onClick={startEditing}
                  title="Edit metadata"
                >
                  ✎ Edit
                </button>
              </div>

              {item.drmProtected && (
                <div className={styles.drmNotice ?? ""}>
                  <span className={styles.drmBadge ?? ""}>DRM Protected</span>
                  <p className={styles.drmText ?? ""}>
                    This item is protected by digital rights management and cannot be played in the
                    browser.
                  </p>
                </div>
              )}

              {item.mediaCategory && (
                <span className={styles.categoryBadge ?? ""}>{item.mediaCategory}</span>
              )}

              {item.description && <p className={styles.description ?? ""}>{item.description}</p>}

              {tags.length > 0 && (
                <div className={styles.tags ?? ""}>
                  {tags.map((tag) => (
                    <span key={tag} className={styles.tag ?? ""}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className={styles.actions ?? ""}>
                <button
                  type="button"
                  className={`${styles.btnPlay ?? ""} ${item.drmProtected ? (styles.btnDisabled ?? "") : ""}`}
                  disabled={item.drmProtected}
                  title={item.drmProtected ? "Playback unavailable — DRM protected" : "Play"}
                >
                  ▶ Play
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary ?? ""}
                  title="Add to favorites"
                >
                  ♡ Favorite
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary ?? ""}
                  title="Add to collection"
                >
                  + Collection
                </button>
              </div>
            </>
          )}

          {/* Core metadata table */}
          {!editing && (
            <table className={styles.metaTable ?? ""}>
              <tbody>
                {item.mediaCategory && <MetaRow label="Category" value={item.mediaCategory} />}
                {item.mimeType && <MetaRow label="Format" value={item.mimeType} />}
                <MetaRow label="File size" value={formatBytes(item.fileSize)} />
                <MetaRow label="File name" value={item.fileName} />
                <MetaRow label="Date added" value={formatDate(item.createdAt)} />
                {item.scannedAt && (
                  <MetaRow label="Last scanned" value={formatDate(item.scannedAt)} />
                )}
                {metaEntries.map(([key, val]) => (
                  <MetaRow key={key} label={key} value={String(val)} />
                ))}
                {metaArrayEntries.map(([key, val]) => (
                  <MetaRow key={key} label={key} value={(val as unknown[]).join(", ")} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Related items placeholder */}
      <section className={styles.related ?? ""}>
        <h2 className={styles.relatedTitle ?? ""}>Related Items</h2>
        <p className={styles.relatedPlaceholder ?? ""}>Related items will appear here.</p>
      </section>
    </div>
  );
}
