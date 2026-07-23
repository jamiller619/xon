import { move as moveSortable } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import {
  Delete20Regular as DeleteIcon,
  ImageAdd20Regular as ImageAddIcon,
  ReOrderDotsVertical20Regular as ReorderIcon,
} from '@fluentui/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import type { MediaItem, PosterImage } from '@xon/shared'
import { ScrollArea } from '@xon/ui'
import { css } from 'inline-css-modules'
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { apiFetch, artworkUrl, getAPIError } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'

type ArtworkKind = 'poster' | 'backdrop' | 'logo'
type PosterEntry = string | PosterImage

type ImagesMetadata = {
  backdrop?: string | string[]
  logo?: string | string[]
  poster?: PosterEntry | PosterEntry[]
}

type ArtworkImages = {
  poster: PosterEntry[]
  backdrop: string[]
  logo: string[]
}

type ArtworkItem = {
  key: string
  sourceIndex: number
  value: PosterEntry
}

type ArtworkState = Record<ArtworkKind, ArtworkItem[]>

const ARTWORK_SECTIONS: ReadonlyArray<{
  kind: ArtworkKind
  title: string
  singular: string
}> = [
  { kind: 'poster', title: 'Posters', singular: 'Poster' },
  { kind: 'backdrop', title: 'Backdrops', singular: 'Backdrop' },
  { kind: 'logo', title: 'Logos', singular: 'Logo' },
]

let nextArtworkKey = 0

const styles = css`
  /* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
  /* Hallmark · component: ordered artwork editor · genre: modern-minimal · theme: Xon
   * states: default · hover · focus · active · disabled · loading · error · success
   * contrast: pass · motion: functional reorder only
   */

  .scrollArea {
    width: min(56rem, calc(100dvw - var(--space-3xl)));
    height: min(44rem, calc(100dvh - var(--space-5xl)));
    margin-inline-end: calc(-1 * var(--space-lg));
  }

  .editor {
    --artwork-duration: 120ms;
    --artwork-easing: cubic-bezier(0.65, 0, 0.35, 1);

    display: grid;
    gap: var(--space-lg);
    min-width: 0;
    padding-inline-end: var(--space-md);
  }

  .section {
    --artwork-width: calc(var(--space-4xl) + var(--space-2xl));
    --artwork-ratio: 2 / 3;

    display: grid;
    gap: var(--space-sm);
    min-width: 0;

    &[data-kind="backdrop"] {
      --artwork-width: calc(var(--space-6xl) + var(--space-2xl));
      --artwork-ratio: 16 / 9;
    }

    &[data-kind="logo"] {
      --artwork-width: calc(var(--space-6xl) + var(--space-4xl));
      --artwork-ratio: 3 / 1;
    }
  }

  .sectionTitle {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.2;
  }

  .rail {
    min-width: 0;
    padding: var(--space-2xs) var(--space-2xs) var(--space-sm);
  }

  .upload {
    box-sizing: border-box;
    width: 100%;
    aspect-ratio: var(--artwork-ratio);
  }

  .uploadButton {
    display: grid;
    place-content: center;
    place-items: center;
    gap: var(--space-2xs);
    width: 100%;
    height: 100%;
    border: 1px dashed var(--color-gray-9);
    border-radius: var(--border-radius-2);
    background: var(--color-gray-a2);
    color: var(--color-text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color var(--artwork-duration) var(--artwork-easing),
      color var(--artwork-duration) var(--artwork-easing),
      opacity var(--artwork-duration) var(--artwork-easing);

    svg {
      width: var(--space-lg);
      height: var(--space-lg);
    }

    &:focus-visible {
      outline: 2px solid var(--color-gray-12);
      outline-offset: 2px;
      box-shadow: none;
    }

    &:active:not(:disabled) {
      opacity: 0.76;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .fileInput {
    display: none;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--artwork-width));
    grid-auto-flow: dense;
    justify-content: start;
    gap: var(--space-sm);
    width: 100%;
    min-width: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    aspect-ratio: var(--artwork-ratio);
    overflow: hidden;
    border: 1px solid var(--color-gray-3);
    border-radius: var(--border-radius-2);
    background: var(--color-gray-4);
    box-shadow: var(--shadow-1);

    &:focus-within {
      border-color: var(--color-gray-12);
    }

    &[data-dragging="true"] {
      z-index: 2;
      border-color: var(--color-gray-11);
      box-shadow: var(--shadow-4);
    }
  }

  .image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    -webkit-user-drag: none;
  }

  .section[data-kind="logo"] .image {
    object-fit: contain;
    padding: var(--space-sm);
  }

  .position {
    position: absolute;
    bottom: var(--space-xs);
    left: var(--space-xs);
    display: grid;
    place-items: center;
    min-width: var(--space-lg);
    height: var(--space-lg);
    border-radius: var(--border-radius-5);
    background: var(--color-gray-3);
    color: var(--color-text);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .iconButton {
    position: absolute;
    display: grid;
    place-items: center;
    width: var(--space-xl);
    height: var(--space-xl);
    border: 0;
    border-radius: var(--border-radius-5);
    background: var(--color-gray-3);
    color: var(--color-text);
    cursor: pointer;

    &::before {
      position: absolute;
      inset: calc(-1 * var(--space-xs));
      content: "";
    }

    &:focus-visible {
      outline: 2px solid var(--color-gray-12);
      outline-offset: 2px;
      box-shadow: none;
    }

    &:active:not(:disabled) {
      opacity: 0.76;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .deleteButton {
    top: var(--space-xs);
    left: var(--space-xs);
  }

  .dragHandle {
    top: var(--space-xs);
    right: var(--space-xs);
    cursor: grab;
    touch-action: none;

    &:active:not(:disabled) {
      cursor: grabbing;
    }
  }

  .error {
    margin: 0;
    border-inline-start: 2px solid var(--color-accent-10);
    color: var(--color-text);
    font-size: var(--text-sm);
    padding-inline-start: var(--space-xs);
  }

  @media (hover: hover) {
    .uploadButton:hover:not(:disabled) {
      background: var(--color-gray-5);
      color: var(--color-text);
    }

    .iconButton:hover:not(:disabled) {
      background: var(--color-gray-5);
    }
  }

  @media (max-width: 40rem) {
    .scrollArea {
      height: calc(100dvh - var(--space-4xl));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .editor {
      --artwork-duration: 0ms;
    }
  }
`

export default function EditImages({ item }: { item: MediaItem }) {
  const queryClient = useQueryClient()
  const [artwork, setArtwork] = useState<ArtworkState>(() =>
    makeArtworkState(item.metadata.images as ImagesMetadata | undefined),
  )
  const artworkRef = useRef(artwork)
  const [busyKind, setBusyKind] = useState<
    ArtworkKind | 'saving' | `generating-${'poster' | 'backdrop'}`
  >()
  const [error, setError] = useState<string>()

  const commit = useCallback((next: ArtworkState) => {
    artworkRef.current = next
    setArtwork(next)
  }, [])

  const invalidateArtworkQueries = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['library-media', item.libraryId],
      }),
      queryClient.invalidateQueries({ queryKey: ['mediaById'] }),
      queryClient.invalidateQueries({ queryKey: ['recentMedia'] }),
      queryClient.invalidateQueries({ queryKey: ['featuredMedia'] }),
      queryClient.invalidateQueries({ queryKey: ['libraries'] }),
    ])
  }, [item.libraryId, queryClient])

  const reloadArtwork = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/media/${item.id}`)
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not reload the images'),
        )
      }
      const latest = (await response.json()) as MediaItem
      commit(
        makeArtworkState(latest.metadata.images as ImagesMetadata | undefined),
      )
      invalidateArtworkQueries()
    } catch (reloadError) {
      setError(
        reloadError instanceof Error
          ? reloadError.message
          : 'Could not reload the images',
      )
    }
  }, [commit, invalidateArtworkQueries, item.id])

  useEffect(() => {
    const images = item.metadata.images as ImagesMetadata | undefined
    // Saving invalidates the parent query, which gives us a new `images`
    // object even when it contains the optimistic order we already committed.
    // Rebuilding in that case replaces every item key and remounts every image.
    if (artworkMatchesImages(artworkRef.current, images)) return
    commit(makeArtworkState(images))
  }, [commit, item.metadata.images])

  useEffect(
    () =>
      subscribeToEvents((event) => {
        if (
          (event.type === 'scan:complete' || event.type === 'scan:error') &&
          event.payload.libraryId === item.libraryId
        ) {
          void reloadArtwork()
        }
      }),
    [item.libraryId, reloadArtwork],
  )

  async function persist(next: ArtworkState, rollback: ArtworkState) {
    setBusyKind('saving')
    setError(undefined)
    try {
      const response = await apiFetch(`/api/media/${item.id}/images`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toArtworkImages(next)),
      })
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not save the image order'),
        )
      }
      // Keep the current item keys and image URLs. Rebuilding the state here
      // remounts every <img>, causing a visible reload after each reorder.
      commit(next)
      invalidateArtworkQueries()
    } catch (saveError) {
      commit(rollback)
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save the image order',
      )
    } finally {
      setBusyKind(undefined)
    }
  }

  async function upload(kind: ArtworkKind, file: File) {
    setBusyKind(kind)
    setError(undefined)
    const form = new FormData()
    form.set('file', file)

    try {
      const response = await apiFetch(`/api/media/${item.id}/images/${kind}`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, `Could not upload the ${kind} image`),
        )
      }
      const data = (await response.json()) as { images: ArtworkImages }
      commit(makeArtworkState(data.images))
      invalidateArtworkQueries()
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : `Could not upload the ${kind} image`,
      )
    } finally {
      setBusyKind(undefined)
    }
  }

  async function createImages(kind: 'poster' | 'backdrop') {
    setBusyKind(`generating-${kind}`)
    setError(undefined)

    try {
      const response = await apiFetch(
        `/api/media/${item.id}/images/${kind}s/generate`,
        { method: 'POST' },
      )
      if (!response.ok) {
        throw new Error(await getAPIError(response, 'Could not create images'))
      }
      const data = (await response.json()) as { images: ArtworkImages }
      commit(makeArtworkState(data.images))
      invalidateArtworkQueries()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create images',
      )
    } finally {
      setBusyKind(undefined)
    }
  }

  function reorder(kind: ArtworkKind, items: ArtworkItem[]) {
    if (busyKind) return
    const rollback = artworkRef.current
    const next = { ...rollback, [kind]: items }
    commit(next)
    void persist(next, rollback)
  }

  function remove(kind: ArtworkKind, key: string) {
    if (busyKind) return
    const rollback = artworkRef.current
    const next = {
      ...rollback,
      [kind]: rollback[kind].filter((image) => image.key !== key),
    }
    commit(next)
    void persist(next, rollback)
  }

  return (
    <ScrollArea className={styles.scrollArea}>
      <div className={styles.editor}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {ARTWORK_SECTIONS.map(({ kind, title, singular }) => (
          <ImageSection
            key={kind}
            mediaId={item.id}
            kind={kind}
            title={title}
            singular={singular}
            items={artwork[kind]}
            busy={busyKind != null}
            uploading={busyKind === kind}
            creating={busyKind === `generating-${kind}`}
            {...((kind === 'poster' || kind === 'backdrop') &&
            item.mediaType?.startsWith('video/')
              ? { onCreate: () => void createImages(kind) }
              : {})}
            onUpload={(file) => void upload(kind, file)}
            onReorder={(items) => reorder(kind, items)}
            onDelete={(key) => remove(kind, key)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

function ImageSection({
  mediaId,
  kind,
  title,
  singular,
  items,
  busy,
  uploading,
  creating,
  onCreate,
  onUpload,
  onReorder,
  onDelete,
}: {
  mediaId: string
  kind: ArtworkKind
  title: string
  singular: string
  items: ArtworkItem[]
  busy: boolean
  uploading: boolean
  creating: boolean
  onCreate?: () => void
  onUpload: (file: File) => void
  onReorder: (items: ArtworkItem[]) => void
  onDelete: (key: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) onUpload(file)
  }

  return (
    <section className={styles.section} data-kind={kind}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.rail}>
        <DragDropProvider
          onDragEnd={(event) => {
            const keys = items.map((image) => image.key)
            const nextKeys = moveSortable(keys, event)
            if (nextKeys.every((key, index) => key === keys[index])) return

            const byKey = new Map(items.map((image) => [image.key, image]))
            const nextItems = nextKeys.flatMap((key) => {
              const image = byKey.get(key)
              return image ? [image] : []
            })
            onReorder(nextItems)
          }}
        >
          <ul className={styles.list} aria-label={title}>
            {items.map((image, index) => (
              <ArtworkCard
                key={image.key}
                mediaId={mediaId}
                kind={kind}
                title={singular}
                image={image}
                index={index}
                disabled={busy}
                onDelete={() => onDelete(image.key)}
              />
            ))}
            <li className={styles.upload}>
              <button
                type="button"
                className={styles.uploadButton}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <ImageAddIcon aria-hidden="true" />
                <span>
                  {uploading ? 'Uploading…' : `Add ${singular.toLowerCase()}`}
                </span>
              </button>
              <input
                ref={inputRef}
                className={styles.fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                disabled={busy}
                onChange={handleFile}
              />
            </li>
            {onCreate && (
              <li className={styles.upload}>
                <button
                  type="button"
                  className={styles.uploadButton}
                  disabled={busy}
                  onClick={onCreate}
                >
                  <ImageAddIcon aria-hidden="true" />
                  <span>{creating ? 'Creating…' : 'Create images'}</span>
                </button>
              </li>
            )}
          </ul>
        </DragDropProvider>
      </div>
    </section>
  )
}

function ArtworkCard({
  mediaId,
  kind,
  title,
  image,
  index,
  disabled,
  onDelete,
}: {
  mediaId: string
  kind: ArtworkKind
  title: string
  image: ArtworkItem
  index: number
  disabled: boolean
  onDelete: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: image.key,
    index,
    disabled,
  })
  const artworkSource = artworkUrl(mediaId, kind, image.sourceIndex)
  const src = `${artworkSource}${artworkSource.includes('?') ? '&' : '?'}v=${encodeURIComponent(image.key)}`

  return (
    <li ref={ref} className={styles.item} data-dragging={isDragging}>
      <img
        className={styles.image}
        src={src}
        alt={`${title} ${index + 1}`}
        draggable={false}
      />
      <span className={styles.position} aria-hidden="true">
        {index + 1}
      </span>
      <button
        type="button"
        className={`${styles.iconButton} ${styles.deleteButton}`}
        disabled={disabled}
        onClick={onDelete}
        aria-label={`Delete ${title.toLowerCase()} ${index + 1}`}
      >
        <DeleteIcon aria-hidden="true" />
      </button>
      <button
        ref={handleRef}
        type="button"
        className={`${styles.iconButton} ${styles.dragHandle}`}
        disabled={disabled}
        aria-label={`Reorder ${title.toLowerCase()} ${index + 1}`}
      >
        <ReorderIcon aria-hidden="true" />
      </button>
    </li>
  )
}

function sourceOf(entry: PosterEntry): string {
  return typeof entry === 'string' ? entry : entry.src
}

function toList<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function makeItems(kind: ArtworkKind, entries: PosterEntry[]): ArtworkItem[] {
  return entries
    .filter((entry) => sourceOf(entry).length > 0)
    .map((value, sourceIndex) => ({
      key: `${kind}-${nextArtworkKey++}`,
      sourceIndex,
      value,
    }))
}

function makeArtworkState(images?: ImagesMetadata): ArtworkState {
  return {
    poster: makeItems('poster', toList(images?.poster)),
    backdrop: makeItems('backdrop', toList(images?.backdrop)),
    logo: makeItems('logo', toList(images?.logo)),
  }
}

function artworkMatchesImages(
  state: ArtworkState,
  images?: ImagesMetadata,
): boolean {
  return ARTWORK_SECTIONS.every(({ kind }) => {
    const entries = toList(images?.[kind]).filter(
      (entry) => sourceOf(entry).length > 0,
    )
    const items = state[kind]

    return (
      entries.length === items.length &&
      entries.every((entry, index) => entriesEqual(entry, items[index]?.value))
    )
  })
}

function entriesEqual(
  left: PosterEntry,
  right: PosterEntry | undefined,
): boolean {
  if (right == null || typeof left !== typeof right) return false
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right
  }

  return (
    left.src === right.src &&
    left.thumbnails?.small === right.thumbnails?.small &&
    left.thumbnails?.medium === right.thumbnails?.medium &&
    left.thumbnails?.large === right.thumbnails?.large
  )
}

function toArtworkImages(state: ArtworkState): ArtworkImages {
  return {
    poster: state.poster.map((image) => image.value),
    backdrop: state.backdrop.map((image) => sourceOf(image.value)),
    logo: state.logo.map((image) => sourceOf(image.value)),
  }
}
