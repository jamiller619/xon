import { useEffect, useState } from 'react'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import styles from './CollectionDialog.module.css'

interface Collection {
  id: string
  type: string
  title: string
}

interface BulkEditDialogProps {
  selectedIds: string[]
  libraryId: string
  onDone: () => void
  onClose: () => void
}

const CONTENT_RATINGS = ['G', 'PG', 'PG-13', 'R', 'unrated'] as const

export default function BulkEditDialog({
  selectedIds,
  libraryId,
  onDone,
  onClose,
}: BulkEditDialogProps) {
  const [genre, setGenre] = useState('')
  const [tags, setTags] = useState('')
  const [contentRating, setContentRating] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [collections, setCollections] = useState<Collection[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`/api/collections?libraryId=${libraryId}`)
      .then((r) => r.json())
      .then((data) => setCollections(data as Collection[]))
      .catch(() => {
        /* ignore */
      })
  }, [libraryId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    const updates: Record<string, unknown> = {}
    if (genre.trim()) updates.genre = genre.trim()
    if (tags.trim())
      updates.tags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    if (contentRating) updates.contentRating = contentRating

    if (Object.keys(updates).length === 0) {
      setError('Enter at least one field to update')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/media/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', ids: selectedIds, updates }),
      })
      if (!res.ok) {
        setError(await getAPIError(res, 'Failed to update items'))
        return
      }
      onDone()
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMoveToCollection() {
    if (!collectionId) {
      setError('Select a collection')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/media/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move-to-collection',
          ids: selectedIds,
          collectionId,
        }),
      })
      if (!res.ok) {
        setError(await getAPIError(res, 'Failed to move items'))
        return
      }
      onDone()
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete ${selectedIds.length} item(s) from the library? This cannot be undone.`,
      )
    ) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/media/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: selectedIds }),
      })
      if (!res.ok) {
        setError(await getAPIError(res, 'Failed to delete items'))
        return
      }
      onDone()
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
        style={{ maxWidth: '520px' }}
      >
        <h2 className={styles.heading ?? ''}>
          Edit {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''}
        </h2>

        <form onSubmit={handleUpdate}>
          <div className={styles.field ?? ''}>
            <label htmlFor="bulk-genre" className={styles.label ?? ''}>
              Genre
            </label>
            <input
              id="bulk-genre"
              type="text"
              className={styles.input ?? ''}
              placeholder="e.g. Action"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.field ?? ''}>
            <label htmlFor="bulk-tags" className={styles.label ?? ''}>
              Tags (comma-separated)
            </label>
            <input
              id="bulk-tags"
              type="text"
              className={styles.input ?? ''}
              placeholder="e.g. favorite, watch-later"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className={styles.field ?? ''}>
            <label htmlFor="bulk-rating" className={styles.label ?? ''}>
              Content Rating
            </label>
            <select
              id="bulk-rating"
              className={styles.select ?? ''}
              value={contentRating}
              onChange={(e) => setContentRating(e.target.value)}
              disabled={submitting}
            >
              <option value="">— no change —</option>
              {CONTENT_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {error && <p className={styles.error ?? ''}>{error}</p>}

          <div className={styles.actions ?? ''}>
            <button
              type="button"
              className={styles.cancelBtn ?? ''}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.createBtn ?? ''}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Apply Changes'}
            </button>
          </div>
        </form>

        <hr
          style={{
            border: 'none',
            borderTop: '1px solid #2d2d44',
            margin: '16px 0',
          }}
        />

        <div className={styles.field ?? ''}>
          <label htmlFor="bulk-collection" className={styles.label ?? ''}>
            Move to Collection
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              id="bulk-collection"
              className={styles.select ?? ''}
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              disabled={submitting || collections.length === 0}
              style={{ flex: 1 }}
            >
              <option value="">
                {collections.length === 0
                  ? 'No collections available'
                  : 'Select a collection…'}
              </option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title} ({collection.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.createBtn ?? ''}
              onClick={handleMoveToCollection}
              disabled={submitting || !collectionId}
            >
              Move
            </button>
          </div>
        </div>

        <hr
          style={{
            border: 'none',
            borderTop: '1px solid #2d2d44',
            margin: '16px 0',
          }}
        />

        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting}
          style={{
            background: '#c62828',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '8px 16px',
          }}
        >
          {submitting
            ? 'Deleting…'
            : `Delete ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} from Library`}
        </button>
      </div>
    </div>
  )
}
