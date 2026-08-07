import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import styles from './CollectionDialog.module.css'

export type ManualCollectionType =
  | 'collection'
  | 'playlist'
  | 'album'
  | 'shelf'
  | 'folder'

/** Map a media category to the preferred manual collection type */
function inferCollectionType(mediaCategories: string[]): ManualCollectionType {
  const VIDEO_CATS = ['Movies', 'TV Shows', 'Clips', 'Home Videos']
  const MUSIC_CATS = ['Music', 'Audiobooks', 'Audio Clips', 'Podcasts']
  const PHOTO_CATS = ['Pictures', 'Images']
  const DOC_CATS = [
    'Documents',
    'Web Media',
    'Design Files',
    'Fonts',
    'Icons',
    '3D Models',
  ]

  if (mediaCategories.some((c) => VIDEO_CATS.includes(c))) return 'collection'
  if (mediaCategories.some((c) => MUSIC_CATS.includes(c))) return 'playlist'
  if (mediaCategories.some((c) => PHOTO_CATS.includes(c))) return 'album'
  if (mediaCategories.some((c) => DOC_CATS.includes(c))) return 'folder'
  return 'shelf'
}

const TYPE_LABELS: Record<ManualCollectionType, string> = {
  collection: 'Collection',
  playlist: 'Playlist',
  album: 'Album',
  folder: 'Folder',
  shelf: 'Shelf',
}

const ALL_TYPES: ManualCollectionType[] = [
  'collection',
  'playlist',
  'album',
  'folder',
  'shelf',
]

interface CollectionDialogProps {
  libraryId: string
  /** Hint for which collection type to suggest */
  mediaCategories?: string[]
  onCreated: (collection: { id: string; title: string; type: string }) => void
  onClose: () => void
}

export default function CollectionDialog({
  libraryId,
  mediaCategories = [],
  onCreated,
  onClose,
}: CollectionDialogProps) {
  const suggestedType = inferCollectionType(mediaCategories)
  const [collectionType, setCollectionType] =
    useState<ManualCollectionType>(suggestedType)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryId,
          type: collectionType,
          title: title.trim(),
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to create collection')
        return
      }
      const collection = (await res.json()) as {
        id: string
        title: string
        type: string
      }
      onCreated(collection)
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
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
        <h2 className={styles.heading ?? ''}>
          New {TYPE_LABELS[collectionType]}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.field ?? ''}>
            <label htmlFor="collection-type" className={styles.label ?? ''}>
              Type
            </label>
            <select
              id="collection-type"
              className={styles.select ?? ''}
              value={collectionType}
              onChange={(e) =>
                setCollectionType(e.target.value as ManualCollectionType)
              }
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field ?? ''}>
            <label htmlFor="collection-title" className={styles.label ?? ''}>
              Name
            </label>
            <input
              ref={inputRef}
              id="collection-title"
              type="text"
              className={styles.input ?? ''}
              placeholder={`${TYPE_LABELS[collectionType]} name`}
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
              {submitting
                ? 'Creating…'
                : `Create ${TYPE_LABELS[collectionType]}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
