import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../apiFetch.js';
import styles from './AdminDuplicates.module.css';

interface MediaItemInfo {
  id: string;
  title: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  mediaCategory: string;
  libraryId: string;
  thumbnailSmall?: string;
  thumbnailMedium?: string;
}

interface DuplicateCandidate {
  id: string;
  libraryId: string;
  mediaItemId1: string;
  mediaItemId2: string;
  similarity: number;
  status: 'pending' | 'kept_both' | 'kept_first' | 'kept_second';
  mediaItem1: MediaItemInfo | null;
  mediaItem2: MediaItemInfo | null;
}

interface Library {
  id: string;
  name: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminDuplicates() {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [minSimilarity, setMinSimilarity] = useState(70);
  const [selectedLibraryId, setSelectedLibraryId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanThreshold, setScanThreshold] = useState(10);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        minSimilarity: String(minSimilarity),
        limit: '50',
      });
      if (selectedLibraryId) params.set('libraryId', selectedLibraryId);
      const res = await apiFetch(`/api/v1/ai/duplicates?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { items: DuplicateCandidate[] };
        setCandidates(data.items);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [minSimilarity, selectedLibraryId]);

  useEffect(() => {
    apiFetch('/api/v1/libraries')
      .then((r) => r.json() as Promise<Library[]>)
      .then(setLibraries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  async function handleScan() {
    if (!selectedLibraryId) return;
    setScanning(true);
    try {
      await apiFetch('/api/v1/ai/duplicates/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryId: selectedLibraryId,
          threshold: scanThreshold,
        }),
      });
      await fetchCandidates();
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  }

  async function handleResolve(
    candidateId: string,
    action: 'keep_both' | 'keep_first' | 'keep_second',
  ) {
    setResolvingId(candidateId);
    try {
      const res = await apiFetch(
        `/api/v1/ai/duplicates/${candidateId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      }
    } catch {
      // ignore
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Duplicate Detection</h1>
        <div className={styles.controls}>
          <select
            className={styles.librarySelect}
            value={selectedLibraryId}
            onChange={(e) => setSelectedLibraryId(e.target.value)}
          >
            <option value="">All libraries</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>
          <label className={styles.thresholdLabel}>
            Min similarity:
            <input
              type="number"
              className={styles.thresholdInput}
              min={0}
              max={100}
              value={minSimilarity}
              onChange={(e) => setMinSimilarity(Number(e.target.value))}
            />
            %
          </label>
          <label className={styles.thresholdLabel}>
            Sensitivity:
            <input
              type="number"
              className={styles.thresholdInput}
              min={0}
              max={64}
              value={scanThreshold}
              onChange={(e) => setScanThreshold(Number(e.target.value))}
            />
          </label>
          <button
            className={styles.scanBtn}
            onClick={handleScan}
            disabled={!selectedLibraryId || scanning}
            type="button"
          >
            {scanning ? 'Scanning…' : 'Scan Library'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : candidates.length === 0 ? (
        <p className={styles.empty}>
          No duplicate candidates found. Select a library and scan to detect
          duplicates.
        </p>
      ) : (
        candidates.map((candidate) => (
          <div key={candidate.id} className={styles.candidateCard}>
            <div className={styles.candidateHeader}>
              <span className={styles.similarityBadge}>
                {candidate.similarity}% similar
              </span>
            </div>
            <div className={styles.comparison}>
              <MediaCard item={candidate.mediaItem1} label="Item 1" />
              <MediaCard item={candidate.mediaItem2} label="Item 2" />
            </div>
            <div className={styles.actions}>
              <button
                className={styles.keepFirstBtn}
                onClick={() => handleResolve(candidate.id, 'keep_first')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleResolve(candidate.id, 'keep_first');
                }}
                disabled={resolvingId === candidate.id}
                type="button"
              >
                Keep Item 1
              </button>
              <button
                className={styles.keepSecondBtn}
                onClick={() => handleResolve(candidate.id, 'keep_second')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleResolve(candidate.id, 'keep_second');
                }}
                disabled={resolvingId === candidate.id}
                type="button"
              >
                Keep Item 2
              </button>
              <button
                className={styles.keepBothBtn}
                onClick={() => handleResolve(candidate.id, 'keep_both')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    handleResolve(candidate.id, 'keep_both');
                }}
                disabled={resolvingId === candidate.id}
                type="button"
              >
                Keep Both
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MediaCard({
  item,
  label,
}: { item: MediaItemInfo | null; label: string }) {
  if (!item) {
    return (
      <div className={styles.mediaCard}>
        <div className={styles.thumbPlaceholder}>?</div>
        <div className={styles.mediaInfo}>
          <div className={styles.mediaTitle}>{label} (removed)</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mediaCard}>
      {item.thumbnailSmall ? (
        <img
          src={item.thumbnailSmall}
          alt={item.title}
          className={styles.thumb}
        />
      ) : (
        <div className={styles.thumbPlaceholder}>🖼</div>
      )}
      <div className={styles.mediaInfo}>
        <div className={styles.mediaTitle}>{item.title || item.fileName}</div>
        <div className={styles.mediaFile}>{item.fileName}</div>
        <div className={styles.mediaSize}>{formatBytes(item.fileSize)}</div>
      </div>
    </div>
  );
}
