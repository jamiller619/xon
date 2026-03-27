import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MediaCard, { type MediaCardItem } from "../components/MediaCard";
import styles from "./LibraryBrowser.module.css";

interface Library {
  id: string;
  name: string;
}

const PAGE_SIZE = 40;

function SkeletonCard() {
  return <div className={styles.skeletonCard ?? ""} />;
}

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>();
  const [library, setLibrary] = useState<Library | null>(null);
  const [items, setItems] = useState<MediaCardItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    fetch(`/api/v1/libraries/${id}/media?order=desc&limit=${PAGE_SIZE}&page=${page}`)
      .then((r) => r.json())
      .then((data) => {
        const mediaList = data as MediaCardItem[];
        setItems(mediaList);
        // If a full page returned, there may be more; show next button when count === PAGE_SIZE
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
  }, [id, page]);

  if (error) {
    return <div className={styles.error ?? ""}>{error}</div>;
  }

  return (
    <div className={styles.browser ?? ""}>
      <header className={styles.header ?? ""}>
        <h1 className={styles.title ?? ""}>{library?.name ?? "Library"}</h1>
      </header>

      {loading ? (
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
