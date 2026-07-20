import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Badge, Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import prettyBytes from 'pretty-bytes'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackgroundSlideshow } from '~/components/background-slideshow/BackgroundSlideshow'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { apiUrl, thumbnailUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import ActionButtons from './components/ActionButtons'
import styles from './Media.module.css'
import MovieSubtitle from './movies/MovieSubtitle'

const VideoPlayer = lazy(() => import('~/components/viewers/VideoPlayer'))

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
  const initialData = useLocation().state as MediaItem

  const { data, error } = useQuery<MediaItem>({
    ...useQueryAPIHelper('mediaById', { id }),
    initialData,
  })

  const [showPlayer, setShowPlayer] = useState(false)

  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>
          <p>{error ? error.message : 'Something went wrong.'}</p>
          <Link to="/" className={styles.backLink}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const parsedMeta = {
    ...data.metadata,
    ...data.fileMetadata,
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
  const fileName = basename(data.filePath)
  const description = data.description ?? data.metadata.overview
  const posterSrc = thumbnailUrl(data, 'large')

  return (
    <div className={styles.page}>
      {Array.isArray(data.metadata.images?.backdrop) && (
        <BackgroundSlideshow
          images={data.metadata.images.backdrop}
          kenBurns={{
            zoom: 1.03,
            pan: 0,
            easing: 'ease-out',
          }}
        />
      )}

      <Flex
        className={clsx(styles.container, styles.header)}
        align="end"
        gap="7"
      >
        <div className={styles.poster}>
          {showPlayer && data.id ? (
            <Suspense fallback={null}>
              <VideoPlayer
                mediaId={data.id}
                {...(data.mediaType ? { mimeType: data.mediaType } : {})}
                onClose={() => setShowPlayer(false)}
              />
            </Suspense>
          ) : (
            <>
              {data.drmProtected && (
                <div className={styles.drmOverlay}>
                  <span className={styles.lockIcon}>🔒</span>
                </div>
              )}
              {posterSrc ? (
                <img
                  src={posterSrc}
                  alt={data.title ?? fileName}
                  loading="lazy"
                  className={styles.posterImg}
                />
              ) : (
                <div className={styles.posterPlaceholder}></div>
              )}
            </>
          )}
        </div>
        <Flex dir="col" gap="7" align="start">
          <div>
            <div className={styles.logo}>
              {data.metadata.images?.logo ? (
                <img
                  src={apiUrl(data.metadata.images.logo)}
                  alt={data.title ?? fileName}
                  loading="lazy"
                  className={styles.logo}
                />
              ) : (
                <h2>{data.title}</h2>
              )}
            </div>
          </div>
          <MovieSubtitle data={data} />
          <ActionButtons item={data} />
        </Flex>
      </Flex>

      {/* Plugin-injected detail panels */}
      <PluginSlot
        injectionPoint="detail-panel"
        props={{
          mediaItem: {
            id: data.id,
            title: data.title,
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
          {data.drmProtected && (
            <div className={styles.drmNotice}>
              <span className={styles.drmBadge}>DRM Protected</span>
              <p className={styles.drmText}>
                This item is protected by digital rights management and cannot
                be played in the browser.
              </p>
            </div>
          )}

          {description && <p className={styles.description}>{description}</p>}

          {tags.length > 0 && (
            <div className={styles.tags}>
              {tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </Flex>

        <table className={styles.metaTable}>
          <tbody>
            {data.mediaType && (
              <MetaRow label="Format">{data.mediaType}</MetaRow>
            )}
            <MetaRow label="File size">{prettyBytes(data.fileSize)}</MetaRow>
            <MetaRow label="File name">{fileName}</MetaRow>
            <MetaRow label="Date added">
              {new Date(data.createdAt).toLocaleString()}
            </MetaRow>
            {data.scannedAt && (
              <MetaRow label="Last scanned">
                {new Date(data.scannedAt).toLocaleString()}
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

        {/* Cast */}
        {data?.cast && data.cast.length > 0 && (
          <XScroller>
            <section>
              <Flex justify="between" align="center">
                <h2 className={styles.heading}>Cast</h2>
                <XScroller.ButtonPrev />
                <XScroller.ButtonNext />
              </Flex>
              <XScroller.Viewport className={styles.castList}>
                {data.cast.map((c) => (
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
    </div>
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
