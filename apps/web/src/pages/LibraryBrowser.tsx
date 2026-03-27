import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MediaCard, { type MediaCardItem } from "../components/MediaCard";
import { useAppStore } from "../store/index";
import styles from "./LibraryBrowser.module.css";

interface Library {
  id: string;
  name: string;
}

type SortColumn = "title" | "mediaCategory" | "fileSize" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 40;

function SkeletonCard() {
  return <div className={styles.skeletonCard ?? ""} />;
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow ?? ""}>
      <td colSpan={5}>
        <div className={styles.skeletonLine ?? ""} />
      </td>
    </tr>
  );
}

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>();
  const { viewMode, setViewMode } = useAppStore();
  const [library, setLibrary] = useState<Library | null>(null);
  const [items, setItems] = useState<MediaCardItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortColumn>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/libraries/${id}`)
      .then((r) => r.json())
      .then((lib) => setLibrary(lib as Library))
      .catch(() => setError("Failed to load library"));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // Map sortCol to API sortBy param (mediaCategory not supported → default createdAt)
    const apiSortBy = sortCol === "mediaCategory" ? "createdAt" : sortCol;
    fetch(
      `/api/v1/libraries/${id}/media?order=${sortDir}&sortBy=${apiSortBy}&limit=${PAGE_SIZE}&page=${page}`
    )
      .then((r) => r.json())
      .then((data) => {
        const mediaList = data as MediaCardItem[];
        setItems(mediaList);
        if (mediaList.length === PAGE_SIZE) {
          setTotalPages((prev) => Math.max(prev, page + 1));
        } else {
          setTotalPages(page);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load media");
        setLoading(false);
      });
  }, [id, page, sortCol, sortDir]);

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortIndicator(col: SortColumn) {
    if (col !== sortCol) return null;
    return <span className={styles.sortArrow ?? ""}>{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  }

  if (error) {
    return <div className={styles.error ?? ""}>{error}</div>;
  }

  return (
    <div className={styles.browser ?? ""}>
      <header className={styles.header ?? ""}>
        <h1 className={styles.title ?? ""}>{library?.name ?? "Library"}</h1>
        <div className={styles.viewToggle ?? ""}>
          <button
            type="button"
            className={`${styles.toggleBtn ?? ""} ${viewMode === "grid" ? (styles.toggleActive ?? "") : ""}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn ?? ""} ${viewMode === "list" ? (styles.toggleActive ?? "") : ""}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            ☰
          </button>
        </div>
      </header>

      {viewMode === "grid" ? (
        loading ? (
          <div className={styles.grid ?? ""}>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className={styles.empty ?? ""}>No media in this library yet.</p>
        ) : (
          <div className={styles.grid ?? ""}>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : (
        <div className={styles.tableWrapper ?? ""}>
          <table className={styles.table ?? ""}>
            <thead>
              <tr>
                <th className={`${styles.th ?? ""} ${styles.thThumb ?? ""}`} />
                <th
                  className={`${styles.th ?? ""} ${styles.thSortable ?? ""}`}
                  onClick={() => handleSort("title")}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("title")}
                >
                  Title{sortIndicator("title")}
                </th>
                <th
                  className={`${styles.th ?? ""} ${styles.thSortable ?? ""}`}
                  onClick={() => handleSort("mediaCategory")}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") && handleSort("mediaCategory")
                  }
                >
                  Category{sortIndicator("mediaCategory")}
                </th>
                <th
                  className={`${styles.th ?? ""} ${styles.thSortable ?? ""}`}
                  onClick={() => handleSort("fileSize")}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("fileSize")}
                >
                  Size{sortIndicator("fileSize")}
                </th>
                <th
                  className={`${styles.th ?? ""} ${styles.thSortable ?? ""}`}
                  onClick={() => handleSort("createdAt")}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("createdAt")}
                >
                  Date Added{sortIndicator("createdAt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  <SkeletonRow key={i} />
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell ?? ""}>
                    No media in this library yet.
                  </td>
                </tr>
              ) : (
                items.map((item) => <MediaCard key={item.id} item={item} listView />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination ?? ""}>
          <button
            type="button"
            className={styles.pageBtn ?? ""}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo ?? ""}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn ?? ""}
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
