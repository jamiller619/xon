import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ArchiveViewer from "../components/ArchiveViewer.js";
import EpubViewer from "../components/EpubViewer.js";
import FontViewer from "../components/FontViewer.js";
import ImageViewer, { type ImageSibling } from "../components/ImageViewer.js";
import PdfViewer from "../components/PdfViewer.js";
import VideoPlayer from "../components/VideoPlayer.js";
import { useAudioStore } from "../store/index";
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
  libraryId: string | null;
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

  const [showPlayer, setShowPlayer] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [showEpubViewer, setShowEpubViewer] = useState(false);
  const [showFontViewer, setShowFontViewer] = useState(false);
  const [showArchiveViewer, setShowArchiveViewer] = useState(false);
  const [imageSiblings, setImageSiblings] = useState<ImageSibling[]>([]);

  const playTrack = useAudioStore((s) => s.playTrack);
  const addToQueue = useAudioStore((s) => s.addToQueue);

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

  // Fetch sibling images from same library for slideshow
  useEffect(() => {
    if (!item || !item.mimeType?.startsWith("image/") || !item.libraryId) return;
    fetch(
      `/api/v1/libraries/${item.libraryId}/media?mediaCategory=${encodeURIComponent(item.mediaCategory ?? "Pictures")}&limit=100`
    )
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const siblings: ImageSibling[] = (
            data as { id: string; title: string | null; fileName: string }[]
          ).map((m) => ({ id: m.id, title: m.title ?? m.fileName }));
          setImageSiblings(siblings);
        }
      })
      .catch(() => {
        // siblings unavailable — viewer will work for single image
      });
  }, [item]);

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

  const isImage = item.mimeType?.startsWith("image/");
  const isPdf = item.mimeType === "application/pdf";
  const isEpub =
    item.mimeType === "application/epub+zip" ||
    item.mimeType === "application/x-mobipocket-ebook" ||
    item.mimeType === "application/vnd.amazon.ebook";
  const isFont =
    item.mimeType?.startsWith("font/") || item.mimeType === "application/vnd.ms-fontobject";
  const isArchive =
    item.mimeType === "application/zip" ||
    item.mimeType === "application/x-7z-compressed" ||
    item.mimeType === "application/x-tar" ||
    item.mediaCategory === "Archives";

  return (
    <div className={styles.page ?? ""}>
      {showImageViewer && id && (
        <ImageViewer
          mediaId={id}
          title={item.title ?? item.fileName}
          onClose={() => setShowImageViewer(false)}
          {...(imageSiblings.length > 1 ? { siblings: imageSiblings } : {})}
        />
      )}
      {showPdfViewer && id && (
        <PdfViewer
          mediaId={id}
          title={item.title ?? item.fileName}
          onClose={() => setShowPdfViewer(false)}
        />
      )}
      {showEpubViewer && id && (
        <EpubViewer
          mediaId={id}
          title={item.title ?? item.fileName}
          onClose={() => setShowEpubViewer(false)}
        />
      )}
      {showFontViewer && id && (
        <FontViewer
          mediaId={id}
          title={item.title ?? item.fileName}
          onClose={() => setShowFontViewer(false)}
        />
      )}
      {showArchiveViewer && id && (
        <ArchiveViewer
          mediaId={id}
          title={item.title ?? item.fileName}
          onClose={() => setShowArchiveViewer(false)}
        />
      )}
      <div className={styles.breadcrumb ?? ""}>
        <Link to="/" className={styles.breadcrumbLink ?? ""}>
          Dashboard
        </Link>
        <span className={styles.breadcrumbSep ?? ""}>/</span>
        <span className={styles.breadcrumbCurrent ?? ""}>{item.title ?? item.fileName}</span>
      </div>

      <div className={styles.hero ?? ""}>
        {/* Video player, image viewer trigger, or poster */}
        <div className={styles.poster ?? ""}>
          {showPlayer && id ? (
            <VideoPlayer
              mediaId={id}
              mimeType={item.mimeType ?? undefined}
              onClose={() => setShowPlayer(false)}
            />
          ) : (
            <>
              {item.drmProtected && (
                <div className={styles.drmOverlay ?? ""}>
                  <span className={styles.lockIcon ?? ""}>🔒</span>
                </div>
              )}
              {item.thumbnailUrls ? (
                <img
                  src={item.thumbnailUrls.large}
                  alt={item.title ?? item.fileName}
                  className={`${styles.posterImg ?? ""} ${isImage && !item.drmProtected ? (styles.posterImgClickable ?? "") : ""}`}
                  onClick={
                    isImage && !item.drmProtected ? () => setShowImageViewer(true) : undefined
                  }
                  onKeyDown={
                    isImage && !item.drmProtected
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") setShowImageViewer(true);
                        }
                      : undefined
                  }
                  tabIndex={isImage && !item.drmProtected ? 0 : undefined}
                />
              ) : isImage && !item.drmProtected ? (
                <button
                  type="button"
                  className={styles.posterPlaceholder ?? ""}
                  onClick={() => setShowImageViewer(true)}
                  title="Open image viewer"
                >
                  <span className={styles.posterIcon ?? ""}>🖼</span>
                </button>
              ) : isPdf && !item.drmProtected ? (
                <button
                  type="button"
                  className={styles.posterPlaceholder ?? ""}
                  onClick={() => setShowPdfViewer(true)}
                  title="Open PDF viewer"
                >
                  <span className={styles.posterIcon ?? ""}>📄</span>
                </button>
              ) : isEpub && !item.drmProtected ? (
                <button
                  type="button"
                  className={styles.posterPlaceholder ?? ""}
                  onClick={() => setShowEpubViewer(true)}
                  title="Open EPUB reader"
                >
                  <span className={styles.posterIcon ?? ""}>📖</span>
                </button>
              ) : isFont && !item.drmProtected ? (
                <button
                  type="button"
                  className={styles.posterPlaceholder ?? ""}
                  onClick={() => setShowFontViewer(true)}
                  title="Open font viewer"
                >
                  <span className={styles.posterIcon ?? ""}>🔤</span>
                </button>
              ) : isArchive ? (
                <button
                  type="button"
                  className={styles.posterPlaceholder ?? ""}
                  onClick={() => setShowArchiveViewer(true)}
                  title="Browse archive"
                >
                  <span className={styles.posterIcon ?? ""}>📦</span>
                </button>
              ) : (
                <div className={styles.posterPlaceholder ?? ""}>
                  <span className={styles.posterIcon ?? ""}>▶</span>
                </div>
              )}
            </>
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
                {isImage ? (
                  <button
                    type="button"
                    className={`${styles.btnPlay ?? ""} ${item.drmProtected ? (styles.btnDisabled ?? "") : ""}`}
                    disabled={item.drmProtected}
                    title={item.drmProtected ? "Viewing unavailable — DRM protected" : "View image"}
                    onClick={() => setShowImageViewer(true)}
                  >
                    🖼 View
                  </button>
                ) : isPdf ? (
                  <button
                    type="button"
                    className={`${styles.btnPlay ?? ""} ${item.drmProtected ? (styles.btnDisabled ?? "") : ""}`}
                    disabled={item.drmProtected}
                    title={item.drmProtected ? "Viewing unavailable — DRM protected" : "Open PDF"}
                    onClick={() => setShowPdfViewer(true)}
                  >
                    📄 Open
                  </button>
                ) : isEpub ? (
                  <button
                    type="button"
                    className={`${styles.btnPlay ?? ""} ${item.drmProtected ? (styles.btnDisabled ?? "") : ""}`}
                    disabled={item.drmProtected}
                    title={item.drmProtected ? "Reading unavailable — DRM protected" : "Read ebook"}
                    onClick={() => setShowEpubViewer(true)}
                  >
                    📖 Read
                  </button>
                ) : isFont ? (
                  <button
                    type="button"
                    className={`${styles.btnPlay ?? ""} ${item.drmProtected ? (styles.btnDisabled ?? "") : ""}`}
                    disabled={item.drmProtected}
                    title={
                      item.drmProtected ? "Preview unavailable — DRM protected" : "Preview font"
                    }
                    onClick={() => setShowFontViewer(true)}
                  >
                    🔤 Preview
                  </button>
                ) : isArchive ? (
                  <button
                    type="button"
                    className={styles.btnPlay ?? ""}
                    title="Browse archive contents"
                    onClick={() => setShowArchiveViewer(true)}
                  >
                    📦 Browse
                  </button>
                ) : item.mimeType?.startsWith("audio/") ? (
                  <>
                    <button
                      type="button"
                      className={styles.btnPlay ?? ""}
                      disabled={item.drmProtected}
                      title={item.drmProtected ? "Playback unavailable — DRM protected" : "Play"}
                      onClick={() => {
                        if (!item.drmProtected && id) {
                          playTrack({
                            id,
                            title: item.title ?? item.fileName,
                            mimeType: item.mimeType ?? "audio/mpeg",
                          });
                        }
                      }}
                    >
                      ▶ Play
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary ?? ""}
                      disabled={item.drmProtected}
                      title="Add to queue"
                      onClick={() => {
                        if (!item.drmProtected && id) {
                          addToQueue({
                            id,
                            title: item.title ?? item.fileName,
                            mimeType: item.mimeType ?? "audio/mpeg",
                          });
                        }
                      }}
                    >
                      + Queue
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`${styles.btnPlay ?? ""} ${item.drmProtected || !item.mimeType?.startsWith("video/") ? (styles.btnDisabled ?? "") : ""}`}
                    disabled={item.drmProtected || !item.mimeType?.startsWith("video/")}
                    title={
                      item.drmProtected
                        ? "Playback unavailable — DRM protected"
                        : !item.mimeType?.startsWith("video/")
                          ? "Playback not supported for this media type"
                          : "Play"
                    }
                    onClick={() => setShowPlayer(true)}
                  >
                    ▶ Play
                  </button>
                )}
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
