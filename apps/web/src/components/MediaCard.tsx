import { Link } from "react-router-dom";
import styles from "./MediaCard.module.css";

export interface MediaCardItem {
  id: string;
  title: string;
  mediaCategory: string | null;
  mimeType: string | null;
  thumbnailUrls: { small: string; medium: string; large: string } | null;
}

interface MediaCardProps {
  item: MediaCardItem;
}

export default function MediaCard({ item }: MediaCardProps) {
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
