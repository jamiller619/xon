import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../apiFetch.js';
import styles from './GroupDialog.module.css';

export type ManualGroupType =
  | 'collection'
  | 'playlist'
  | 'album'
  | 'shelf'
  | 'folder';

/** Map a media category to the preferred manual group type */
function inferGroupType(mediaCategories: string[]): ManualGroupType {
  const VIDEO_CATS = ['Movies', 'TV Shows', 'Clips', 'Home Videos'];
  const MUSIC_CATS = ['Music', 'Audiobooks', 'Audio Clips', 'Podcasts'];
  const PHOTO_CATS = ['Pictures', 'Images'];
  const DOC_CATS = [
    'Documents',
    'Web Media',
    'Design Files',
    'Fonts',
    'Icons',
    '3D Models',
  ];

  if (mediaCategories.some((c) => VIDEO_CATS.includes(c))) return 'collection';
  if (mediaCategories.some((c) => MUSIC_CATS.includes(c))) return 'playlist';
  if (mediaCategories.some((c) => PHOTO_CATS.includes(c))) return 'album';
  if (mediaCategories.some((c) => DOC_CATS.includes(c))) return 'folder';
  return 'shelf';
}

const TYPE_LABELS: Record<ManualGroupType, string> = {
  collection: 'Collection',
  playlist: 'Playlist',
  album: 'Album',
  folder: 'Folder',
  shelf: 'Shelf',
};

const ALL_TYPES: ManualGroupType[] = [
  'collection',
  'playlist',
  'album',
  'folder',
  'shelf',
];

interface GroupDialogProps {
  libraryId: string;
  /** Hint for which group type to suggest */
  mediaCategories?: string[];
  onCreated: (group: { id: string; title: string; type: string }) => void;
  onClose: () => void;
}

export default function GroupDialog({
  libraryId,
  mediaCategories = [],
  onCreated,
  onClose,
}: GroupDialogProps) {
  const suggestedType = inferGroupType(mediaCategories);
  const [groupType, setGroupType] = useState<ManualGroupType>(suggestedType);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryId,
          type: groupType,
          title: title.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to create group');
        return;
      }
      const group = (await res.json()) as {
        id: string;
        title: string;
        type: string;
      };
      onCreated(group);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.overlay ?? ''}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className={styles.dialog ?? ''}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 className={styles.heading ?? ''}>New {TYPE_LABELS[groupType]}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.field ?? ''}>
            <label htmlFor="group-type" className={styles.label ?? ''}>
              Type
            </label>
            <select
              id="group-type"
              className={styles.select ?? ''}
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as ManualGroupType)}
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field ?? ''}>
            <label htmlFor="group-title" className={styles.label ?? ''}>
              Name
            </label>
            <input
              ref={inputRef}
              id="group-title"
              type="text"
              className={styles.input ?? ''}
              placeholder={`${TYPE_LABELS[groupType]} name`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
          {error && <p className={styles.error ?? ''}>{error}</p>}
          <div className={styles.actions ?? ''}>
            <button
              type="button"
              className={styles.cancelBtn ?? ''}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.createBtn ?? ''}
              disabled={submitting || !title.trim()}
            >
              {submitting ? 'Creating…' : `Create ${TYPE_LABELS[groupType]}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
