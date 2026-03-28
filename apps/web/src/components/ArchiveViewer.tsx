import { useEffect, useRef, useState } from "react";
import styles from "./ArchiveViewer.module.css";

interface Props {
  mediaId: string;
  title: string;
  onClose: () => void;
}

interface ArchiveEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  size: number;
  children: TreeNode[];
}

function buildTree(entries: ArchiveEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", fullPath: "", isDirectory: true, size: 0, children: [] };

  for (const entry of entries) {
    const cleanPath = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    const parts = cleanPath.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) continue;

    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? "";
      if (!part) continue;
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath,
          isDirectory: isLast ? entry.isDirectory : true,
          size: isLast ? entry.size : 0,
          children: [],
        };
        node.children.push(child);
      } else if (isLast) {
        child.size = entry.size;
        child.isDirectory = entry.isDirectory;
      }
      node = child;
    }
  }

  // Sort: directories first, then files, alphabetically within each group
  function sortNodes(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(root.children);

  return root.children;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"]);
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".wmv", ".flv"]);
const AUDIO_EXTS = new Set([".mp3", ".flac", ".aac", ".ogg", ".wav", ".m4a", ".opus"]);
const DOC_EXTS = new Set([".pdf", ".epub", ".doc", ".docx", ".txt", ".md", ".csv", ".xlsx"]);
const CODE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".css",
  ".html",
  ".json",
  ".yaml",
  ".yml",
]);

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return "📁";
  const ext = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase() ?? ""}` : "";
  if (IMAGE_EXTS.has(ext)) return "🖼";
  if (VIDEO_EXTS.has(ext)) return "🎬";
  if (AUDIO_EXTS.has(ext)) return "🎵";
  if (DOC_EXTS.has(ext)) return "📄";
  if (CODE_EXTS.has(ext)) return "📝";
  return "📋";
}

function getMediaType(name: string): string | null {
  const ext = name.includes(".") ? `.${name.split(".").pop()?.toLowerCase() ?? ""}` : "";
  if (IMAGE_EXTS.has(ext)) return "Image";
  if (VIDEO_EXTS.has(ext)) return "Video";
  if (AUDIO_EXTS.has(ext)) return "Audio";
  if (DOC_EXTS.has(ext)) return "Document";
  return null;
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (node: TreeNode) => void;
  selected: string | null;
}

function TreeRow({ node, depth, expanded, onToggle, onSelect, selected }: TreeRowProps) {
  const isExpanded = expanded.has(node.fullPath);
  const isSelected = selected === node.fullPath;

  function handleClick() {
    if (node.isDirectory) {
      onToggle(node.fullPath);
    } else {
      onSelect(node);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.treeRow ?? ""} ${isSelected ? (styles.treeRowSelected ?? "") : ""}`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        aria-expanded={node.isDirectory ? expanded.has(node.fullPath) : undefined}
        onClick={handleClick}
      >
        <span className={styles.treeToggle ?? ""}>
          {node.isDirectory ? (isExpanded ? "▾" : "▸") : " "}
        </span>
        <span className={styles.treeIcon ?? ""}>{getFileIcon(node.name, node.isDirectory)}</span>
        <span className={styles.treeName ?? ""}>{node.name}</span>
        {!node.isDirectory && (
          <span className={styles.treeSize ?? ""}>{formatBytes(node.size)}</span>
        )}
        {!node.isDirectory && getMediaType(node.name) && (
          <span className={styles.treeBadge ?? ""}>{getMediaType(node.name)}</span>
        )}
      </button>
      {node.isDirectory && isExpanded && (
        <>
          {node.children.map((child) => (
            <TreeRow
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selected={selected}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className={styles.emptyDir ?? ""}
              style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }}
            >
              (empty)
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ArchiveViewer({ mediaId, title, onClose }: Props) {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/media/${mediaId}/archive-contents`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load archive contents");
        return r.json();
      })
      .then((data: unknown) => {
        const d = data as { entries: ArchiveEntry[] };
        setEntries(d.entries);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError((err as Error).message ?? "Failed to load");
        setLoading(false);
      });
  }, [mediaId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectNode(node: TreeNode) {
    setSelected(node.fullPath);
  }

  const tree = buildTree(entries);
  const fileCount = entries.filter((e) => !e.isDirectory).length;
  const totalSize = entries.reduce((sum, e) => sum + (e.isDirectory ? 0 : e.size), 0);

  const selectedEntry = selected
    ? entries.find((e) => e.path === selected || e.path === `${selected}/`)
    : null;

  return (
    <dialog open ref={dialogRef} className={styles.dialog ?? ""}>
      <div className={styles.toolbar ?? ""}>
        <button type="button" className={styles.closeBtn ?? ""} onClick={onClose} title="Close">
          ✕
        </button>
        <span className={styles.titleText ?? ""}>{title}</span>
        <span className={styles.statsText ?? ""}>
          {fileCount} file{fileCount !== 1 ? "s" : ""} · {formatBytes(totalSize)}
        </span>
      </div>

      <div className={styles.body ?? ""}>
        {/* File tree */}
        <div className={styles.treePane ?? ""} role="tree" aria-label="Archive contents">
          {loading && <div className={styles.stateBox ?? ""}>Loading…</div>}
          {error && (
            <div className={`${styles.stateBox ?? ""} ${styles.errorBox ?? ""}`}>{error}</div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className={styles.stateBox ?? ""}>Archive is empty</div>
          )}
          {!loading &&
            !error &&
            tree.map((node) => (
              <TreeRow
                key={node.fullPath}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggleDir}
                onSelect={selectNode}
                selected={selected}
              />
            ))}
        </div>

        {/* Detail panel */}
        <div className={styles.detailPane ?? ""}>
          {selected && selectedEntry ? (
            <div className={styles.detailContent ?? ""}>
              <div className={styles.detailIcon ?? ""}>
                {getFileIcon(
                  selectedEntry.path.replace(/\/$/, "").split("/").pop() ?? "",
                  selectedEntry.isDirectory
                )}
              </div>
              <h3 className={styles.detailName ?? ""}>
                {selectedEntry.path.replace(/\/$/, "").split("/").pop()}
              </h3>
              <dl className={styles.detailMeta ?? ""}>
                <dt>Path</dt>
                <dd>{selectedEntry.path}</dd>
                <dt>Type</dt>
                <dd>
                  {selectedEntry.isDirectory
                    ? "Directory"
                    : (getMediaType(selectedEntry.path) ?? "File")}
                </dd>
                {!selectedEntry.isDirectory && (
                  <>
                    <dt>Size</dt>
                    <dd>{formatBytes(selectedEntry.size)}</dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <div className={styles.detailEmpty ?? ""}>
              <p>Select a file to view details</p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
