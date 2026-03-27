import { Link } from "react-router-dom";
import styles from "./MediaCard.module.css";

export interface MediaCardItem {
  id: string;
  title: string;
  mediaCategory: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: number | null;
  thumbnailUrls: { small: string; medium: string; large: string } | null;
}

interface MediaCardProps {
  item: MediaCardItem;
  listView?: boolean;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts: number | string | null): string {
  if (ts == null) return "—";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  return d.toLocaleDateString();
}

export default function MediaCard({ item, listView }: MediaCardProps) {
  if (listView) {
    return (
      <tr className={styles.listRow ?? ""}>
        <td className={styles.listThumbCell ?? ""}>
          <Link to={`/media/${item.id}`} className={styles.listThumbLink ?? ""}>
            {item.thumbnailUrls ? (
              <img src={item.thumbnailUrls.small} alt="" className={styles.listThumbImg ?? ""} />
            ) : (
              <div className={styles.listThumbPlaceholder ?? ""}>▶</div>
            )}
          </Link>
        </td>
        <td className={styles.listTitleCell ?? ""}>
          <Link to={`/media/${item.id}`} className={styles.listTitle ?? ""}>
            {item.title}
          </Link>
          {item.mimeType && (
            <span className={styles.listFileType ?? ""}>
              {item.mimeType.split("/")[1] ?? item.mimeType}
            </span>
          )}
        </td>
        <td className={styles.listCell ?? ""}>{item.mediaCategory ?? "—"}</td>
        <td className={styles.listCell ?? ""}>{formatBytes(item.fileSize)}</td>
        <td className={styles.listCell ?? ""}>{formatDate(item.createdAt)}</td>
      </tr>
    );
  }

  return (
    <Link to={`/media/${item.id}`} className={styles.card ?? ""}>
      <div className={styles.thumb ?? ""}>
        {item.thumbnailUrls ? (
          <img src={item.thumbnailUrls.medium} alt={item.title} className={styles.thumbImg ?? ""} />
        ) : (
          <div className={styles.thumbPlaceholder ?? ""}>
            <span>▶</span>
          </div>
        )}
      </div>
      <div className={styles.info ?? ""}>
        <p className={styles.title ?? ""}>{item.title}</p>
        <div className={styles.meta ?? ""}>
          {item.mediaCategory && <span className={styles.badge ?? ""}>{item.mediaCategory}</span>}
          {item.mimeType && (
            <span className={styles.fileType ?? ""}>
              {item.mimeType.split("/")[1] ?? item.mimeType}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
