import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../apiFetch.js'
import styles from './GroupDetail.module.css'

interface GroupMemberItem {
  mediaItemId: string
  sortOrder: number
  title: string
  mediaCategory: string | null
  mimeType: string | null
  fileSize: number | null
  createdAt: number | null
  thumbnailUrls: { small: string; medium: string; large: string } | null
}

interface GroupDetail {
  id: string
  libraryId: string
  type: string
  title: string
  members: GroupMemberItem[]
}

interface LibraryMediaItem {
  id: string
  title: string
  mediaCategory: string | null
  thumbnailUrls: { small: string; medium: string; large: string } | null
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [members, setMembers] = useState<GroupMemberItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add items modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryMediaItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null)

  const loadGroup = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/v1/groups/${id}`)
      if (!res.ok) {
        setError('Group not found')
        return
      }
      const data = (await res.json()) as GroupDetail
      setGroup(data)
      setMembers(data.members)
    } catch {
      setError('Failed to load group')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  async function handleRemoveItem(mediaItemId: string) {
    if (!id) return
    await apiFetch(`/api/v1/groups/${id}/items/${mediaItemId}`, {
      method: 'DELETE',
    })
    setMembers((prev) => prev.filter((m) => m.mediaItemId !== mediaItemId))
  }

  // Drag-and-drop handlers
  function handleDragStart(index: number) {
    dragIndexRef.current = index
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    setMembers((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      if (!moved) return prev
      next.splice(index, 0, moved)
      dragIndexRef.current = index
      return next
    })
  }

  async function handleDrop() {
    if (!id) return
    dragIndexRef.current = null
    // Persist new sort order
    const payload = members.map((m, i) => ({
      mediaItemId: m.mediaItemId,
      sortOrder: i,
    }))
    try {
      await apiFetch(`/api/v1/groups/${id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      setMembers((prev) => prev.map((m, i) => ({ ...m, sortOrder: i })))
    } catch {
      // Non-critical: reorder failed silently
    }
  }

  async function handleDeleteGroup() {
    if (!id || !group) return
    if (
      !confirm(
        `Delete "${group.title}"? This will remove the group and all its items.`,
      )
    )
      return
    const res = await apiFetch(`/api/v1/groups/${id}`, { method: 'DELETE' })
    if (res.ok) {
      navigate(`/libraries/${group.libraryId}`)
    }
  }

  async function openAddModal() {
    if (!group) return
    setAddError(null)
    setSelectedIds(new Set())
    setShowAddModal(true)
    // Load library items
    try {
      setAddLoading(true)
      const res = await apiFetch(
        `/api/v1/libraries/${group.libraryId}/media?limit=100&page=1`,
      )
      if (res.ok) {
        const data = (await res.json()) as LibraryMediaItem[]
        // Filter out items already in the group
        const existingIds = new Set(members.map((m) => m.mediaItemId))
        setLibraryItems(data.filter((item) => !existingIds.has(item.id)))
      }
    } catch {
      setAddError('Failed to load library items')
    } finally {
      setAddLoading(false)
    }
  }

  function toggleSelectItem(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  async function handleAddSelected() {
    if (!id || selectedIds.size === 0) return
    setAddLoading(true)
    setAddError(null)
    try {
      for (const mediaItemId of selectedIds) {
        await apiFetch(`/api/v1/groups/${id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaItemId }),
        })
      }
      setShowAddModal(false)
      await loadGroup()
    } catch {
      setAddError('Failed to add items')
    } finally {
      setAddLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page ?? ''}>
        <div className={styles.loading ?? ''}>Loading…</div>
      </div>
    )
  }

  if (error || !group) {
    return (
      <div className={styles.page ?? ''}>
        <div className={styles.errorMsg ?? ''}>{error ?? 'Not found'}</div>
      </div>
    )
  }

  const typeLabel = group.type.charAt(0).toUpperCase() + group.type.slice(1)

  return (
    <div className={styles.page ?? ''}>
      <div className={styles.header ?? ''}>
        <Link
          to={`/libraries/${group.libraryId}`}
          className={styles.backLink ?? ''}
        >
          ← Library
        </Link>
        <div className={styles.titleRow ?? ''}>
          <div>
            <span className={styles.typeBadge ?? ''}>{typeLabel}</span>
            <h1 className={styles.title ?? ''}>{group.title}</h1>
          </div>
          <div className={styles.headerActions ?? ''}>
            <button
              type="button"
              className={styles.addBtn ?? ''}
              onClick={openAddModal}
            >
              + Add Items
            </button>
            <button
              type="button"
              className={styles.deleteBtn ?? ''}
              onClick={handleDeleteGroup}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {members.length === 0 ? (
        <div className={styles.empty ?? ''}>
          No items yet.{' '}
          <button
            type="button"
            className={styles.emptyAddBtn ?? ''}
            onClick={openAddModal}
          >
            Add items
          </button>
        </div>
      ) : (
        <div className={styles.memberList ?? ''}>
          <p className={styles.hint ?? ''}>Drag items to reorder.</p>
          {members.map((member, index) => (
            <div
              key={member.mediaItemId}
              className={styles.memberRow ?? ''}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
            >
              <span className={styles.dragHandle ?? ''} title="Drag to reorder">
                ⋮⋮
              </span>
              <div className={styles.memberThumb ?? ''}>
                {member.thumbnailUrls ? (
                  <img
                    src={member.thumbnailUrls.small}
                    alt=""
                    className={styles.thumbImg ?? ''}
                  />
                ) : (
                  <div className={styles.thumbPlaceholder ?? ''}>▶</div>
                )}
              </div>
              <div className={styles.memberInfo ?? ''}>
                <Link
                  to={`/media/${member.mediaItemId}`}
                  className={styles.memberTitle ?? ''}
                >
                  {member.title}
                </Link>
                {member.mediaCategory && (
                  <span className={styles.memberCategory ?? ''}>
                    {member.mediaCategory}
                  </span>
                )}
                <span className={styles.memberSize ?? ''}>
                  {formatBytes(member.fileSize)}
                </span>
              </div>
              <button
                type="button"
                className={styles.removeBtn ?? ''}
                onClick={() => handleRemoveItem(member.mediaItemId)}
                title="Remove from group"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div
          className={styles.modalOverlay ?? ''}
          onClick={() => setShowAddModal(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowAddModal(false)}
        >
          <div
            className={styles.modal ?? ''}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalHeading ?? ''}>Add Items</h2>
            {addLoading && (
              <p className={styles.modalLoading ?? ''}>Loading…</p>
            )}
            {addError && <p className={styles.modalError ?? ''}>{addError}</p>}
            {!addLoading && libraryItems.length === 0 && (
              <p className={styles.modalEmpty ?? ''}>
                No items available to add.
              </p>
            )}
            {!addLoading && libraryItems.length > 0 && (
              <div className={styles.pickList ?? ''}>
                {libraryItems.map((item) => (
                  <label key={item.id} className={styles.pickItem ?? ''}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                    />
                    <span className={styles.pickTitle ?? ''}>{item.title}</span>
                    {item.mediaCategory && (
                      <span className={styles.pickCategory ?? ''}>
                        {item.mediaCategory}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className={styles.modalActions ?? ''}>
              <button
                type="button"
                className={styles.cancelBtn ?? ''}
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.addSelectedBtn ?? ''}
                disabled={selectedIds.size === 0 || addLoading}
                onClick={handleAddSelected}
              >
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
