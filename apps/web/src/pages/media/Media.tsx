import type { MediaItem } from '@xon/shared'
import { Badge, Button, Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import humanizeDuration from 'humanize-duration'
import prettyBytes from 'pretty-bytes'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackgroundSlideshow } from '~/components/background-slideshow/BackgroundSlideshow'
import Breadcrumbs from '~/components/breadcrumbs/Breadcrumbs'
import { GradientBackground } from '~/components/gradient-background/GradientBackground'
import PluginSlot from '~/components/PluginSlot'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import { useAudioStore } from '~/store/audioStore'
import ActionButtons from './components/ActionButtons'
import Resolution from './components/Resolution'
import styles from './Media.module.css'

// Player/viewer components loaded on demand — separate JS chunks
// const ArchiveViewer = lazy(() => import('~/components/viewers/ArchiveViewer'))
// const EpubViewer = lazy(() => import('~/components/viewers/EpubViewer'))
// const FontViewer = lazy(() => import('~/components/viewers/FontViewer'))
const ImageViewer = lazy(() => import('~/components/viewers/ImageViewer'))
// const PdfViewer = lazy(() => import('~/components/viewers/PdfViewer'))
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

// function formatBytes(bytes: number | null): string {
//   if (bytes == null) return '—'
//   if (bytes < 1024) return `${bytes} B`
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
//   if (bytes < 1024 * 1024 * 1024)
//     return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
//   return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
// }

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

export default function Media() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const data = location.state
  const [item, setItem] = useState<MediaItem>(data)
  const [error, setError] = useState<string | null>(null)

  const [showPlayer, setShowPlayer] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  // const [showPdfViewer, setShowPdfViewer] = useState(false)
  // const [showEpubViewer, setShowEpubViewer] = useState(false)
  // const [showFontViewer, setShowFontViewer] = useState(false)
  // const [showArchiveViewer, setShowArchiveViewer] = useState(false)
  const [imageSiblings, setImageSiblings] = useState<ImageSibling[]>([])

  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null)
  // const [matchActionLoading, setMatchActionLoading] = useState(false)

  // const playTrack = useAudioStore((s) => s.playTrack)
  // const addToQueue = useAudioStore((s) => s.addToQueue)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTags, setEditTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (item.cast) return

    apiFetch(`/api/media/${id}`)
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
  }, [item, id])

  // Load pending match
  // useEffect(() => {
  //   if (!id) return
  //   apiFetch(`/api/media/${id}/match`)
  //     .then((r) => (r.ok ? r.json() : null))
  //     .then((data: unknown) => {
  //       setPendingMatch(data as PendingMatch | null)
  //     })
  //     .catch(() => {})
  // }, [id])

  // async function confirmMatch() {
  //   if (!pendingMatch) return
  //   setMatchActionLoading(true)
  //   const res = await apiFetch(`/api/matching/${pendingMatch.id}/confirm`, {
  //     method: 'PUT',
  //   }).catch(() => null)
  //   if (res?.ok) {
  //     setPendingMatch(null)
  //     // Refresh media item to pick up updated title/metadata
  //     if (id) {
  //       apiFetch(`/api/media/${id}`)
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
  //   const res = await apiFetch(`/api/matching/${pendingMatch.id}/reject`, {
  //     method: 'PUT',
  //   }).catch(() => null)
  //   if (res?.ok) setPendingMatch(null)
  //   setMatchActionLoading(false)
  // }

  const isImage = item.mediaType?.startsWith('image/')
  const isAudio = item.mediaType?.startsWith('audio/')
  const isVideo = item.mediaType?.startsWith('video/')

  // Fetch sibling images from same library for slideshow
  // useEffect(() => {
  //   if (!item || !isImage) return
  //   apiFetch(
  //     `/api/libraries/${item.libraryId}/media?mediaCategory=${encodeURIComponent(item.mimeType ?? 'Pictures')}&limit=100`,
  //   )
  //     .then((r) => r.json())
  //     .then((data: unknown) => {
  //       if (Array.isArray(data)) {
  //         const siblings: ImageSibling[] = (
  //           data as { id: string; title: string | null; fileName: string }[]
  //         ).map((m) => ({ id: m.id, title: m.title ?? m.fileName }))
  //         setImageSiblings(siblings)
  //       }
  //     })
  //     .catch(() => {
  //       // siblings unavailable — viewer will work for single image
  //     })
  // }, [item, isImage])

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
    const res = await apiFetch(`/api/media/${item.id}/ai-tags`, {
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
      const res = await apiFetch(`/api/media/${item.id}`, {
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

  return (
    <>
      {Array.isArray(item.metadata.images?.backdrop) && (
        <>
          <BackgroundSlideshow
            images={item.metadata.images.backdrop}
            kenBurns={{
              zoom: 1.03,
              pan: 0,
              easing: 'ease-out',
            }}
          />
          <GradientBackground />
        </>
      )}
      <div className={clsx(styles.hero, styles.container)}>
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
        <Breadcrumbs label={item.title ?? fileName} />

        <div className={styles.posterContainer}>
          <div className={styles.poster}>
            {showPlayer && item.id ? (
              <Suspense fallback={null}>
                <VideoPlayer
                  mediaId={item.id}
                  {...(item.mediaType ? { mimeType: item.mediaType } : {})}
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
                {item.metadata.images?.poster ? (
                  <img
                    src={apiUrl(item.metadata.images.poster)}
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

          <div className={styles.posterMeta}>
            {/* Logo */}
            {item.metadata.images?.logo && (
              <img
                src={apiUrl(item.metadata.images.logo)}
                alt={item.title ?? fileName}
                loading="lazy"
                className={styles.logo}
              />
            )}
            {/* Action buttons */}
            <div className={styles.actions}>
              <ActionButtons item={item} />
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
              // libraryId: item.libraryId,
            },
            // ...(item.libraryId ? { libraryId: item.libraryId } : {}),
          }}
        />
      </div>

      {/* Main Content Area */}
      <Surface className={clsx(styles.content, styles.container)} br="sm">
        {/* Title + actions */}
        <Flex gap="3" dir="col">
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
                <label className={styles.editLabel} htmlFor="edit-description">
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
              <Flex justify="between" className={styles.titleRow}>
                <h1 className={styles.title}>{item.title}</h1>
                {item.metadata.resolution && (
                  <div>
                    <Badge>
                      <Resolution
                        height={item.metadata.resolution.height}
                        width={item.metadata.resolution.width}
                        layout="$n $a"
                      />
                    </Badge>
                  </div>
                )}
              </Flex>

              {item.drmProtected && (
                <div className={styles.drmNotice}>
                  <span className={styles.drmBadge}>DRM Protected</span>
                  <p className={styles.drmText}>
                    This item is protected by digital rights management and
                    cannot be played in the browser.
                  </p>
                </div>
              )}

              <span>{parseYear(item)}</span>

              {description && (
                <p className={styles.description}>{description}</p>
              )}

              {tags.length > 0 && (
                <div className={styles.tags}>
                  {tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
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
        </Flex>

        {/* Core metadata table */}
        {!editing && (
          <table className={styles.metaTable}>
            <tbody>
              {item.mediaType && (
                <MetaRow label="Format">{item.mediaType}</MetaRow>
              )}
              <MetaRow label="File size">{prettyBytes(item.fileSize)}</MetaRow>
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

        {/* Cast */}
        {item?.cast && item.cast.length > 0 && (
          <XScroller>
            <section>
              <Flex justify="between" align="center">
                <h2 className={styles.heading}>Cast</h2>
                <XScroller.ButtonPrev />
                <XScroller.ButtonNext />
              </Flex>
              <XScroller.Viewport className={styles.castList}>
                {item.cast.map((c) => (
                  <div key={c.id}>
                    <div className={styles.castImage}>
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt={c.name} />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/10.x/dylan/svg?seed=${c.name}-${c.role}`}
                          alt="avatar"
                        />
                      )}
                    </div>
                    <div className={styles.castName}>{c.name}</div>
                    <span className={styles.castRole}>as {c.role}</span>
                  </div>
                ))}
              </XScroller.Viewport>
            </section>
          </XScroller>
        )}

        {/* Related items placeholder */}
        <section>
          <h2 className={styles.heading}>Related Items</h2>
          <p className={styles.relatedPlaceholder}>
            Related items will appear here.
          </p>
        </section>
      </Surface>
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

function parseResolution(data: MediaItem) {
  // if ('width' in data.metadata && 'height' in data.metadata) {
  //   return <Resolution width={data.metadata.width} height={data.metadata.height} />
  // }
  // return null
}

function parseYear(data: MediaItem) {
  if ('releaseDate' in data.metadata) {
    if (data.metadata.releaseDate.length > 4) {
      return new Date(data.metadata.releaseDate).getFullYear()
    }

    return data.metadata.releaseDate
  }
}
