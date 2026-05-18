import {
  AddCircle16Filled as AddIcon,
  Edit16Filled as EditIcon,
  Heart20Filled as HeartIcon,
  Heart20Regular as HeartStrokeIcon,
  Play16Filled as PlayIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Button } from '@xon/ui'
import humanizeDuration from 'humanize-duration'
import {
  Fragment,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import PluginSlot from '~/components/PluginSlot'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import { useAudioStore } from '~/store/audioStore'
import styles from './MediaDetail.module.css'

// Player/viewer components loaded on demand — separate JS chunks
const ArchiveViewer = lazy(() => import('~/components/viewers/ArchiveViewer'))
const EpubViewer = lazy(() => import('~/components/viewers/EpubViewer'))
const FontViewer = lazy(() => import('~/components/viewers/FontViewer'))
const ImageViewer = lazy(() => import('~/components/viewers/ImageViewer'))
const PdfViewer = lazy(() => import('~/components/viewers/PdfViewer'))
const VideoPlayer = lazy(() => import('~/components/viewers/VideoPlayer'))

interface ImageSibling {
  id: string
  title: string
}

interface PendingMatch {
  id: string
  mediaItemId: string
  suggestedTitle: string
  suggestedMetadata: Record<string, unknown>
  confidence: number
  status: string
  matchSource: string | null
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(ts: number | null): string {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleString()
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className={styles.metaRow}>
      <td className={styles.metaLabel}>{label}</td>
      <td className={styles.metaValue}>{children}</td>
    </tr>
  )
}

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const data = location.state
  const [item, setItem] = useState<MediaItem>(data)
  const [error, setError] = useState<string | null>(null)

  const [showPlayer, setShowPlayer] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const [showEpubViewer, setShowEpubViewer] = useState(false)
  const [showFontViewer, setShowFontViewer] = useState(false)
  const [showArchiveViewer, setShowArchiveViewer] = useState(false)
  const [imageSiblings, setImageSiblings] = useState<ImageSibling[]>([])

  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null)
  const [matchActionLoading, setMatchActionLoading] = useState(false)

  const [isFavorited, setIsFavorited] = useState(false)
  const [isWatchlisted, setIsWatchlisted] = useState(false)

  const playTrack = useAudioStore((s) => s.playTrack)
  const addToQueue = useAudioStore((s) => s.addToQueue)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTags, setEditTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (item.metadata.images?.backdrop) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      document.body.classList.add(styles.bodyBackground!)
      document.body.style.backgroundImage = `url(${item.metadata.images.backdrop})`
    }

    return () => {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      document.body.classList.remove(styles.bodyBackground!)
      document.body.style.backgroundImage = ''
    }
  }, [item.metadata.images?.backdrop])

  useEffect(() => {
    if (item) return

    apiFetch(`/api/v1/media/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then((data) => {
        setItem(data as MediaItem)
      })
      .catch(() => {
        setError('Media item not found.')
      })
  })

  // useEffect(() => {
  //   if (!title) return
  //   setLoading(true)
  //   apiFetch(`/api/v1/media/${id}`)
  //     .then((r) => {
  //       if (!r.ok) throw new Error('Not found')
  //       return r.json()
  //     })
  //     .then((data) => {
  //       setItem(data as MediaDetailItem)
  //       setLoading(false)
  //     })
  //     .catch(() => {
  //       setError('Media item not found.')
  //       setLoading(false)
  //     })
  // }, [id])

  // Load pending match
  // useEffect(() => {
  //   if (!id) return
  //   apiFetch(`/api/v1/media/${id}/match`)
  //     .then((r) => (r.ok ? r.json() : null))
  //     .then((data: unknown) => {
  //       setPendingMatch(data as PendingMatch | null)
  //     })
  //     .catch(() => {})
  // }, [id])

  // async function confirmMatch() {
  //   if (!pendingMatch) return
  //   setMatchActionLoading(true)
  //   const res = await apiFetch(`/api/v1/matching/${pendingMatch.id}/confirm`, {
  //     method: 'PUT',
  //   }).catch(() => null)
  //   if (res?.ok) {
  //     setPendingMatch(null)
  //     // Refresh media item to pick up updated title/metadata
  //     if (id) {
  //       apiFetch(`/api/v1/media/${id}`)
  //         .then((r) => (r.ok ? r.json() : null))
  //         .then((data: unknown) => {
  //           if (data) setItem(data as MediaDetailItem)
  //         })
  //         .catch(() => {})
  //     }
  //   }
  //   setMatchActionLoading(false)
  // }

  // async function rejectMatch() {
  //   if (!pendingMatch) return
  //   setMatchActionLoading(true)
  //   const res = await apiFetch(`/api/v1/matching/${pendingMatch.id}/reject`, {
  //     method: 'PUT',
  //   }).catch(() => null)
  //   if (res?.ok) setPendingMatch(null)
  //   setMatchActionLoading(false)
  // }

  // Load favorite/watchlist state
  useEffect(() => {
    if (!item?.id) return
    apiFetch('/api/v1/users/me/favorites')
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setIsFavorited(
            (data as { id: string }[]).some((m) => m.id === item.id),
          )
        }
      })
      .catch(() => {})
    apiFetch('/api/v1/users/me/watchlist')
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setIsWatchlisted(
            (data as { id: string }[]).some((m) => m.id === item.id),
          )
        }
      })
      .catch(() => {})
  }, [item?.id])

  async function toggleFavorite() {
    if (!item.id) return
    const method = isFavorited ? 'DELETE' : 'POST'
    const res = await apiFetch(`/api/v1/media/${item.id}/favorite`, { method })
    if (res.ok) setIsFavorited(!isFavorited)
  }

  async function toggleWatchlist() {
    if (!item.id) return
    const method = isWatchlisted ? 'DELETE' : 'POST'
    const res = await apiFetch(`/api/v1/media/${item.id}/watchlist`, { method })
    if (res.ok) setIsWatchlisted(!isWatchlisted)
  }

  // Fetch sibling images from same library for slideshow
  useEffect(() => {
    if (!item || !item.mimeType?.startsWith('image/') || !item.libraryId) return
    apiFetch(
      `/api/v1/libraries/${item.libraryId}/media?mediaCategory=${encodeURIComponent(item.mimeType ?? 'Pictures')}&limit=100`,
    )
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const siblings: ImageSibling[] = (
            data as { id: string; title: string | null; fileName: string }[]
          ).map((m) => ({ id: m.id, title: m.title ?? m.fileName }))
          setImageSiblings(siblings)
        }
      })
      .catch(() => {
        // siblings unavailable — viewer will work for single image
      })
  }, [item])

  function startEditing() {
    if (!item) return
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    let tags: string[] = []
    try {
      const meta = item.metadata
      if (Array.isArray(meta.tags)) tags = meta.tags as string[]
    } catch {
      // ignore
    }
    setEditTags(tags.join(', '))
    setSaveError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setSaveError(null)
  }

  async function handleAiTag(action: 'accept' | 'reject', tagText: string) {
    if (!item?.id) return
    const body =
      action === 'accept' ? { accept: [tagText] } : { reject: [tagText] }
    const res = await apiFetch(`/api/v1/media/${item.id}/ai-tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    if (res?.ok) {
      const updated = (await res.json()) as MediaItem
      setItem(updated)
    }
  }

  async function saveEditing() {
    if (!item || !item.id) return
    setSaving(true)
    setSaveError(null)
    const tags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const payload: Record<string, unknown> = {}
    if (editTitle.trim()) payload.title = editTitle.trim()
    if (editDescription !== item.description)
      payload.description = editDescription
    payload.tags = tags

    try {
      const res = await apiFetch(`/api/v1/media/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')
      const updated = (await res.json()) as MediaItem
      setItem(updated)
      setEditing(false)
    } catch {
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // if (loading) {
  //   return (
  //     <div className={styles.page ?? ''}>
  //       <div className={styles.skeleton ?? ''}>
  //         <div className={styles.skeletonPoster ?? ''} />
  //         <div className={styles.skeletonInfo ?? ''}>
  //           <div className={styles.skeletonTitle ?? ''} />
  //           <div className={styles.skeletonLine ?? ''} />
  //           <div className={styles.skeletonLine ?? ''} />
  //         </div>
  //       </div>
  //     </div>
  //   )
  // }

  if (error || !item) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>
          <p>{error ?? 'Something went wrong.'}</p>
          <Link to="/" className={styles.backLink}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const parsedMeta = item.metadata

  interface AiTagEntry {
    text: string
    confidence: number
    source: string
  }

  const metaEntries = Object.entries(parsedMeta).filter(
    ([k, v]) =>
      k !== 'tags' &&
      k !== 'aiTags' &&
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !Array.isArray(v),
  )
  const metaArrayEntries = Object.entries(parsedMeta).filter(
    ([k, v]) => k !== 'tags' && k !== 'aiTags' && Array.isArray(v),
  )
  const tags = Array.isArray(parsedMeta.tags)
    ? (parsedMeta.tags as string[])
    : []
  const aiTags = Array.isArray(parsedMeta.aiTags)
    ? (parsedMeta.aiTags as AiTagEntry[])
    : []

  const isImage = item.mimeType?.startsWith('image/')
  // const isPdf = item.mimeType === 'application/pdf'
  // const isEpub =
  //   item.mimeType === 'application/epub+zip' ||
  //   item.mimeType === 'application/x-mobipocket-ebook' ||
  //   item.mimeType === 'application/vnd.amazon.ebook'
  // const isFont =
  //   item.mimeType?.startsWith('font/') ||
  //   item.mimeType === 'application/vnd.ms-fontobject'
  // const isArchive =
  //   item.mimeType === 'application/zip' ||
  //   item.mimeType === 'application/x-7z-compressed' ||
  //   item.mimeType === 'application/x-tar' ||
  //   item.mediaCategory === 'Archives'
  const fileName = basename(item.filePath)
  const description = item.description ?? item.metadata.overview
  const year = String(item.metadata.year) ?? ''

  return (
    <>
      <div className={styles.page}>
        {showImageViewer && item.id && (
          <Suspense fallback={null}>
            <ImageViewer
              mediaId={item.id}
              title={item.title ?? fileName}
              onClose={() => setShowImageViewer(false)}
              {...(imageSiblings.length > 1 ? { siblings: imageSiblings } : {})}
            />
          </Suspense>
        )}
        <div className={styles.breadcrumb}>
          <Link to="/" className={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>
            {item.title ?? fileName}
          </span>
        </div>

        <div className={styles.hero}>
          {/* Video player, image viewer trigger, or poster */}
          <div className={styles.poster}>
            {showPlayer && item.id ? (
              <Suspense fallback={null}>
                <VideoPlayer
                  mediaId={item.id}
                  {...(item.mimeType ? { mimeType: item.mimeType } : {})}
                  onClose={() => setShowPlayer(false)}
                />
              </Suspense>
            ) : (
              <>
                {item.drmProtected && (
                  <div className={styles.drmOverlay}>
                    <span className={styles.lockIcon}>🔒</span>
                  </div>
                )}
                {item.metadata.images?.thumbnail ? (
                  <img
                    src={apiUrl(item.metadata.images?.thumbnail)}
                    alt={item.title ?? fileName}
                    loading="lazy"
                    className={`${styles.posterImg} ${isImage && !item.drmProtected ? styles.posterImgClickable : ''}`}
                    onClick={
                      isImage && !item.drmProtected
                        ? () => setShowImageViewer(true)
                        : undefined
                    }
                    onKeyDown={
                      isImage && !item.drmProtected
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                              setShowImageViewer(true)
                          }
                        : undefined
                    }
                    tabIndex={isImage && !item.drmProtected ? 0 : undefined}
                  />
                ) : isImage && !item.drmProtected ? (
                  <Button
                    // className={styles.posterPlaceholder}
                    onClick={() => setShowImageViewer(true)}
                    title="Open image viewer"
                  >
                    <span className={styles.posterIcon}>🖼</span>
                  </Button>
                  // ) : isPdf && !item.drmProtected ? (
                  //   <button
                  //     type="button"
                  //     className={styles.posterPlaceholder}
                  //     onClick={() => setShowPdfViewer(true)}
                  //     title="Open PDF viewer"
                  //   >
                  //     <span className={styles.posterIcon}>📄</span>
                  //   </button>
                  // ) : isEpub && !item.drmProtected ? (
                  //   <button
                  //     type="button"
                  //     className={styles.posterPlaceholder}
                  //     onClick={() => setShowEpubViewer(true)}
                  //     title="Open EPUB reader"
                  //   >
                  //     <span className={styles.posterIcon}>📖</span>
                  //   </button>
                  // ) : isFont && !item.drmProtected ? (
                  //   <button
                  //     type="button"
                  //     className={styles.posterPlaceholder}
                  //     onClick={() => setShowFontViewer(true)}
                  //     title="Open font viewer"
                  //   >
                  //     <span className={styles.posterIcon}>🔤</span>
                  //   </button>
                  // ) : isArchive ? (
                  //   <button
                  //     type="button"
                  //     className={styles.posterPlaceholder}
                  //     onClick={() => setShowArchiveViewer(true)}
                  //     title="Browse archive"
                  //   >
                  //     <span className={styles.posterIcon}>📦</span>
                  //   </button>
                ) : (
                  <div className={styles.posterPlaceholder}>
                    <span className={styles.posterIcon}>▶</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Title + actions */}
          <div className={styles.heroInfo}>
            {editing ? (
              <div className={styles.editForm}>
                <div className={styles.editField}>
                  <label className={styles.editLabel} htmlFor="edit-title">
                    Title
                  </label>
                  <input
                    id="edit-title"
                    className={styles.editInput}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className={styles.editField}>
                  <label
                    className={styles.editLabel}
                    htmlFor="edit-description"
                  >
                    Description
                  </label>
                  <textarea
                    id="edit-description"
                    className={styles.editTextarea}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel} htmlFor="edit-tags">
                    Tags (comma-separated)
                  </label>
                  <input
                    id="edit-tags"
                    className={styles.editInput}
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="e.g. action, drama, sci-fi"
                  />
                </div>
                {saveError && <p className={styles.saveError}>{saveError}</p>}
                <div className={styles.editActions}>
                  <button
                    type="button"
                    className={styles.btnSave}
                    onClick={saveEditing}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={cancelEditing}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.titleRow}>
                  <h1 className={styles.title}>{item.title ?? fileName}</h1>
                </div>

                {item.drmProtected && (
                  <div className={styles.drmNotice}>
                    <span className={styles.drmBadge}>DRM Protected</span>
                    <p className={styles.drmText}>
                      This item is protected by digital rights management and
                      cannot be played in the browser.
                    </p>
                  </div>
                )}

                <span>{year ? `(${year})` : ''}</span>

                {item.mimeType && (
                  <span className={styles.categoryBadge}>{item.mimeType}</span>
                )}

                {description && <p>{description}</p>}

                {tags.length > 0 && (
                  <div className={styles.tags}>
                    {tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* {aiTags.length > 0 && (
                  <div className={styles.aiTagsSection}>
                    <p className={styles.aiTagsLabel}>AI Suggested Tags</p>
                    <div className={styles.aiTags}>
                      {aiTags.map((tag) => (
                        <span key={tag.text} className={styles.aiTag}>
                          <span className={styles.aiTagText}>{tag.text}</span>
                          <span className={styles.aiTagConfidence}>
                            {tag.confidence}%
                          </span>
                          <button
                            type="button"
                            className={styles.aiTagAccept}
                            title="Accept tag"
                            onClick={() => handleAiTag('accept', tag.text)}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className={styles.aiTagReject}
                            title="Reject tag"
                            onClick={() => handleAiTag('reject', tag.text)}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )} */}
              </>
            )}
            {/* Action buttons */}
            <div className={styles.actions}>
              {isImage ? (
                <button
                  type="button"
                  className={`${styles.btnPlay} ${item.drmProtected ? styles.btnDisabled : ''}`}
                  disabled={item.drmProtected}
                  title={
                    item.drmProtected
                      ? 'Viewing unavailable — DRM protected'
                      : 'View image'
                  }
                  onClick={() => setShowImageViewer(true)}
                >
                  🖼 View
                </button>
                // ) : isPdf ? (
                //   <button
                //     type="button"
                //     className={`${styles.btnPlay} ${item.drmProtected ? (styles.btnDisabled) : ''}`}
                //     disabled={item.drmProtected}
                //     title={
                //       item.drmProtected
                //         ? 'Viewing unavailable — DRM protected'
                //         : 'Open PDF'
                //     }
                //     onClick={() => setShowPdfViewer(true)}
                //   >
                //     📄 Open
                //   </button>
                // ) : isEpub ? (
                //   <button
                //     type="button"
                //     className={`${styles.btnPlay} ${item.drmProtected ? (styles.btnDisabled) : ''}`}
                //     disabled={item.drmProtected}
                //     title={
                //       item.drmProtected
                //         ? 'Reading unavailable — DRM protected'
                //         : 'Read ebook'
                //     }
                //     onClick={() => setShowEpubViewer(true)}
                //   >
                //     📖 Read
                //   </button>
                // ) : isFont ? (
                //   <button
                //     type="button"
                //     className={`${styles.btnPlay} ${item.drmProtected ? (styles.btnDisabled) : ''}`}
                //     disabled={item.drmProtected}
                //     title={
                //       item.drmProtected
                //         ? 'Preview unavailable — DRM protected'
                //         : 'Preview font'
                //     }
                //     onClick={() => setShowFontViewer(true)}
                //   >
                //     🔤 Preview
                //   </button>
                // ) : isArchive ? (
                //   <button
                //     type="button"
                //     className={styles.btnPlay}
                //     title="Browse archive contents"
                //     onClick={() => setShowArchiveViewer(true)}
                //   >
                //     📦 Browse
                //   </button>
              ) : item.mimeType?.startsWith('audio/') ? (
                <>
                  <Button
                    // className={styles.btnPlay}
                    variant="primary"
                    disabled={item.drmProtected}
                    title={
                      item.drmProtected
                        ? 'Playback unavailable — DRM protected'
                        : 'Play'
                    }
                    onClick={() => {
                      if (!item.drmProtected && item.id) {
                        playTrack({
                          id: item.id,
                          title: item.title ?? fileName,
                          mimeType: item.mimeType ?? 'audio/mpeg',
                        })
                      }
                    }}
                  >
                    ▶ Play
                  </Button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={item.drmProtected}
                    title="Add to queue"
                    onClick={() => {
                      if (!item.drmProtected && item.id) {
                        addToQueue({
                          id: item.id,
                          title: item.title ?? fileName,
                          mimeType: item.mimeType ?? 'audio/mpeg',
                        })
                      }
                    }}
                  >
                    + Queue
                  </button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={
                    item.drmProtected || !item.mimeType?.startsWith('video/')
                  }
                  title={
                    item.drmProtected
                      ? 'Playback unavailable — DRM protected'
                      : !item.mimeType?.startsWith('video/')
                        ? 'Playback not supported for this media type'
                        : 'Play'
                  }
                  onClick={() => setShowPlayer(true)}
                >
                  <PlayIcon /> <span>Play</span>
                </Button>
              )}
              {item.mimeType.startsWith('video/') && (
                <Button onClick={startEditing} title="Edit metadata">
                  <EditIcon />
                </Button>
              )}
              <Button
                title={
                  isFavorited ? 'Remove from favorites' : 'Add to favorites'
                }
                onClick={toggleFavorite}
              >
                {isFavorited ? <HeartIcon /> : <HeartStrokeIcon />}
              </Button>
              <Button
                title={
                  isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'
                }
                onClick={toggleWatchlist}
              >
                {isWatchlisted ? (
                  <>
                    <EditIcon />
                    <span>Watchlisted</span>
                  </>
                ) : (
                  <>
                    <AddIcon />
                    <span>Watchlist</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Suggested match banner */}
        {pendingMatch && (
          <section className={styles.matchBanner}>
            <div className={styles.matchHeader}>
              <span className={styles.matchBadge}>Suggested Match</span>
              {pendingMatch.matchSource && (
                <span className={styles.matchSource}>
                  {pendingMatch.matchSource}
                </span>
              )}
              <span className={styles.matchConfidence}>
                {pendingMatch.confidence}% confidence
              </span>
            </div>
            <div className={styles.matchBody}>
              <div className={styles.matchFields}>
                <div className={styles.matchField}>
                  <span className={styles.matchFieldLabel}>Title</span>
                  <span className={styles.matchFieldValue}>
                    {pendingMatch.suggestedTitle}
                  </span>
                </div>
                {pendingMatch.suggestedMetadata.year != null && (
                  <div className={styles.matchField}>
                    <span className={styles.matchFieldLabel}>Year</span>
                    <span className={styles.matchFieldValue}>
                      {String(pendingMatch.suggestedMetadata.year)}
                    </span>
                  </div>
                )}
                {Object.entries(pendingMatch.suggestedMetadata)
                  .filter(
                    ([k, v]) =>
                      k !== 'year' &&
                      v != null &&
                      v !== '' &&
                      !Array.isArray(v),
                  )
                  .map(([k, v]) => (
                    <div key={k} className={styles.matchField}>
                      <span className={styles.matchFieldLabel}>{k}</span>
                      <span className={styles.matchFieldValue}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
                {Object.entries(pendingMatch.suggestedMetadata)
                  .filter(
                    ([, v]) => Array.isArray(v) && (v as unknown[]).length > 0,
                  )
                  .map(([k, v]) => (
                    <div key={k} className={styles.matchField}>
                      <span className={styles.matchFieldLabel}>{k}</span>
                      <span className={styles.matchFieldValue}>
                        {(v as unknown[]).join(', ')}
                      </span>
                    </div>
                  ))}
              </div>
              {/* <div className={styles.matchActions}>
              <button
                type="button"
                className={styles.btnConfirm}
                disabled={matchActionLoading}
                onClick={confirmMatch}
              >
                Confirm
              </button>
              <button
                type="button"
                className={styles.btnReject}
                disabled={matchActionLoading}
                onClick={rejectMatch}
              >
                Reject
              </button>
            </div> */}
            </div>
          </section>
        )}

        {/* Plugin-injected detail panels */}
        <PluginSlot
          injectionPoint="detail-panel"
          props={{
            mediaItem: {
              id: item.id,
              title: item.title,
              // mediaCategory: item.mediaCategory,
              libraryId: item.libraryId,
            },
            ...(item.libraryId ? { libraryId: item.libraryId } : {}),
          }}
        />
      </div>
      <div className={styles.content}>
        {/* Core metadata table */}
        {!editing && (
          <table className={styles.metaTable}>
            <tbody>
              {item.mimeType && (
                <MetaRow label="Format">{item.mimeType}</MetaRow>
              )}
              <MetaRow label="File size">{formatBytes(item.fileSize)}</MetaRow>
              <MetaRow label="File name">{fileName}</MetaRow>
              <MetaRow label="Date added">
                {new Date(item.createdAt).toLocaleString()}
              </MetaRow>
              {item.scannedAt && (
                <MetaRow label="Last scanned">
                  {new Date(item.scannedAt).toLocaleString()}
                </MetaRow>
              )}
              {metaEntries
                .filter(([key]) => !['images', 'overview'].includes(key))
                .map(([key, val]) => {
                  const value =
                    key === 'duration'
                      ? humanizeDuration(val * 1000, {
                          units: ['h', 'm'],
                          round: true,
                        })
                      : val

                  return (
                    <MetaRow key={key} label={key}>
                      {JSON.stringify(value)}
                    </MetaRow>
                  )
                })}
              {metaArrayEntries.map(([key, val]) => (
                <MetaRow key={key} label={key}>
                  {parseArray(key, val)}
                </MetaRow>
              ))}
            </tbody>
          </table>
        )}

        {/* Related items placeholder */}
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>Related Items</h2>
          <p className={styles.relatedPlaceholder}>
            Related items will appear here.
          </p>
        </section>
      </div>
    </>
  )
}

type CastMember = {
  id: number
  name: string
  character: string
  order: number
}

function parseArray(key: string, arr: unknown[]): ReactNode {
  const isStringOrNumberArray =
    typeof arr[0] === 'string' || typeof arr[0] === 'number'

  if (isStringOrNumberArray) return arr.join(', ')

  if (key === 'cast') {
    return (arr as CastMember[])
      .sort((a, b) => a.order - b.order)
      .map((v) => (
        <div key={v.id}>
          <div>{v.name}</div>
          <div>as {v.character}</div>
        </div>
      ))
  }

  return arr.map((v) => JSON.stringify(v)).join(', ')
}
