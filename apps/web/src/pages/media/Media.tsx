import { Play16Regular as PlayIcon } from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
// import prettyBytes from 'pretty-bytes'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackgroundSlideshow } from '~/components/background-slideshow/BackgroundSlideshow'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { artworkUrl, thumbnailUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import { formatBytes, truncateMiddle } from '~/lib/utils'
import styles from './Media.module.css'
import Cast from './movies/Cast'
import MovieSubtitle from './movies/MovieSubtitle'

const META_KEYS_TO_HIDE = [
  'images',
  'overview',
  'duration',
  'tmdbId',
  'imdbId',
  'title',
  'originalTitle',
  'voteAverage',
  'rated',
  'imdbRating',
  'imdbVotes',
  'metascore',
  'rottenTomatoesRating',
  'genres',
  'crew',
  'actors',
]

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className={styles.metaRow}>
      <td className={styles.metaLabel}>{label}</td>
      <td className={styles.metaValue}>{children}</td>
    </tr>
  )
}

function MiddleTruncatedPath({ filePath }: { filePath: string }) {
  const pathRef = useRef<HTMLSpanElement>(null)
  const [displayPath, setDisplayPath] = useState(filePath)

  useEffect(() => {
    const pathElement = pathRef.current
    if (!pathElement) return

    const context = document.createElement('canvas').getContext('2d')
    if (!context) return

    const updateDisplayPath = () => {
      const styles = window.getComputedStyle(pathElement)
      const characters = Array.from(filePath)
      const letterSpacing = Number.parseFloat(styles.letterSpacing) || 0
      const availableWidth = pathElement.clientWidth

      context.font =
        styles.font ||
        `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`

      const measure = (text: string) =>
        context.measureText(text).width +
        Math.max(0, Array.from(text).length - 1) * letterSpacing

      if (measure(filePath) <= availableWidth) {
        setDisplayPath(filePath)
        return
      }

      let shortestFit = '...'
      let low = 4
      let high = characters.length - 1

      while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        const candidate = truncateMiddle(filePath, middle)

        if (measure(candidate) <= availableWidth) {
          shortestFit = candidate
          low = middle + 1
        } else {
          high = middle - 1
        }
      }

      setDisplayPath(shortestFit)
    }

    updateDisplayPath()
    const resizeObserver = new ResizeObserver(updateDisplayPath)
    resizeObserver.observe(pathElement)

    return () => resizeObserver.disconnect()
  }, [filePath])

  return (
    <span
      ref={pathRef}
      className={styles.filePath}
      title={filePath}
      aria-label={filePath}
    >
      {displayPath}
    </span>
  )
}

export default function Media() {
  const { id } = useParams<{ id: string }>()
  const placeholderData = useLocation().state as MediaItem

  const { data, error } = useQuery<MediaItem>({
    ...useQueryAPIHelper('mediaById', { id }),
    placeholderData,
  })

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
      !META_KEYS_TO_HIDE.includes(k) &&
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !Array.isArray(v),
  )
  const metaArrayEntries = Object.entries(parsedMeta).filter(
    ([k, v]) => !META_KEYS_TO_HIDE.includes(k) && Array.isArray(v),
  )
  const fileName = basename(data.filePath)
  const description = data.description ?? data.metadata.overview
  const posterSrc = thumbnailUrl(data, 'large')
  const backdrops = Array.isArray(data.metadata.images?.backdrop)
    ? data.metadata.images.backdrop.map((_backdrop: unknown, index: number) =>
        artworkUrl(data.id, 'backdrop', index),
      )
    : data.metadata.images?.backdrop
      ? [artworkUrl(data.id, 'backdrop', 0)]
      : []
  const logos = Array.isArray(data.metadata.images?.logo)
    ? data.metadata.images.logo
    : data.metadata.images?.logo
      ? [data.metadata.images.logo]
      : []

  return (
    <div className={styles.page}>
      {backdrops.length > 0 && (
        <BackgroundSlideshow
          images={backdrops}
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
        </div>
        <Flex dir="col" gap="5" align="start">
          <div>
            <div className={styles.logo}>
              {logos.length > 0 ? (
                <img
                  src={artworkUrl(data.id, 'logo', 0)}
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
          {/* <ActionButtons item={data} /> */}
          <Flex dir="row" gap="3">
            <Button variant="primary">
              <PlayIcon />
              Play
            </Button>
          </Flex>
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
        borderRadius="medium"
      >
        <Flex gap="5">
          <Flex dir="col" gap="5" className={styles.contentStart}>
            <div className={styles.description}>
              <p>{description}</p>
            </div>
            <Cast data={data.cast} />
          </Flex>
          <div className={styles.metaTableContainer}>
            <table className={styles.metaTable}>
              <tbody>
                {data.mediaType && (
                  <MetaRow label="Format">{data.mediaType}</MetaRow>
                )}
                <MetaRow label="File size">{formatBytes(data)}</MetaRow>
                <MetaRow label="File path">
                  <MiddleTruncatedPath filePath={data.filePath} />
                </MetaRow>
                <MetaRow label="Date added">
                  {new Date(data.createdAt).toLocaleString()}
                </MetaRow>
                {data.scannedAt && (
                  <MetaRow label="Last scanned">
                    {new Date(data.scannedAt).toLocaleString()}
                  </MetaRow>
                )}
                {metaEntries.map(([key, val]) => {
                  return (
                    <MetaRow key={key} label={key}>
                      {parseValue(val)}
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
          </div>
        </Flex>

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

function parseValue(value?: unknown): ReactNode {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()

  return JSON.stringify(value)
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
