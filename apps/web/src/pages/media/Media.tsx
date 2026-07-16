import {
  Calendar16Regular as CalendarIcon,
  Clock16Regular as ClockIcon,
  Star16Filled as StarIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Badge, Button, Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import prettyBytes from 'pretty-bytes'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackgroundSlideshow } from '~/components/background-slideshow/BackgroundSlideshow'
import { GradientBackground } from '~/components/gradient-background/GradientBackground'
import PluginSlot from '~/components/PluginSlot'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import ActionButtons from './components/ActionButtons'
import Resolution from './components/Resolution'
import styles from './Media.module.css'

const ImageViewer = lazy(() => import('~/components/viewers/ImageViewer'))
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
  const data = useLocation().state as MediaItem | undefined
  const [item, setItem] = useState<MediaItem | undefined>(data)
  const [error, setError] = useState<string | null>(null)

  const [showPlayer, setShowPlayer] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [imageSiblings, setImageSiblings] = useState<ImageSibling[]>([])

  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTags, setEditTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (item?.cast) return

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

  const isImage = item?.mediaType?.startsWith('image/')

  function cancelEditing() {
    setEditing(false)
    setSaveError(null)
  }

  async function saveEditing() {
    if (!item?.id) return
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

  const parsedMeta = {
    ...item.metadata,
    ...item.fileMetadata,
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

      <Flex
        className={clsx(styles.container, styles.header)}
        align="end"
        gap="7"
      >
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
                  onClick={() => setShowImageViewer(true)}
                  title="Open image viewer"
                >
                  <span className={styles.posterIcon}>🖼</span>
                </Button>
              ) : (
                <div className={styles.posterPlaceholder}>
                  <span className={styles.posterIcon}>▶</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className={styles.logo}>
          {item.metadata.images?.logo && (
            <img
              src={apiUrl(item.metadata.images.logo)}
              alt={item.title ?? fileName}
              loading="lazy"
              className={styles.logo}
            />
          )}
        </div>
        <Flex dir="col" gap="7">
          <div>
            <h2 className={styles.title}>{item.title}</h2>
            <Flex gap="4" className={styles.subtitle}>
              <Flex gap="1" align="center">
                <CalendarIcon />
                <span>{parseYear(item)}</span>
              </Flex>
              <Flex gap="1" align="center">
                <ClockIcon />
                <span>{parseDuration(item.fileMetadata.duration * 1000)}</span>
              </Flex>
              {item.fileMetadata.resolution && (
                <Badge>
                  <Resolution
                    height={item.fileMetadata.resolution.height}
                    width={item.fileMetadata.resolution.width}
                    layout="$n $a"
                  />
                </Badge>
              )}
              <Flex gap="1" align="center">
                <StarIcon className={styles.ratingIcon as string} />
                <span>{item.metadata.voteAverage?.toFixed(1)}</span>
              </Flex>
            </Flex>
          </div>
          <div className={styles.actions}>
            <ActionButtons item={item} />
          </div>
        </Flex>
      </Flex>

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
                    k !== 'year' && v != null && v !== '' && !Array.isArray(v),
                )
                .map(([k, v]) => (
                  <div key={k} className={styles.matchField}>
                    <span className={styles.matchFieldLabel}>{k}</span>
                    <span className={styles.matchFieldValue}>{String(v)}</span>
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
          },
        }}
      />

      {/* Main Content Area */}
      <Surface
        className={clsx(styles.content, styles.container)}
        borderRadius="sm"
      >
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
              {item.drmProtected && (
                <div className={styles.drmNotice}>
                  <span className={styles.drmBadge}>DRM Protected</span>
                  <p className={styles.drmText}>
                    This item is protected by digital rights management and
                    cannot be played in the browser.
                  </p>
                </div>
              )}

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
                .filter(
                  ([key]) => !['images', 'overview', 'duration'].includes(key),
                )
                .map(([key, val]) => {
                  return (
                    <MetaRow key={key} label={key}>
                      {JSON.stringify(val)}
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

function parseVote(value?: number) {
  return value?.toFixed(1)
}

function parseDuration(value?: number) {
  if (!value) return null

  const totalSeconds = Math.round(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = hours > 0 ? 0 : totalSeconds % 60

  return new Intl.DurationFormat(undefined, { style: 'narrow' }).format({
    hours,
    minutes,
    seconds,
  })
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
