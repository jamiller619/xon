import {
  MoreVertical24Regular as MoreVerticalIcon,
  Play24Filled as PlayIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import { type Library, LibraryType, type MediaItem } from '@xon/shared'
import { Button, Flex, Menu, Surface } from '@xon/ui'
import clsx from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BackgroundSlideshow } from '~/components/background-slideshow/BackgroundSlideshow'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { artworkUrl, thumbnailUrl } from '~/lib/apiFetch'
import basename from '~/lib/basename'
import icons from '~/lib/icons'
import { findScrollViewport } from '~/lib/scrollViewport'
import MetaTable from './components/MetaTable'
import VideoPlayer from './components/VideoPlayer'
import styles from './Media.module.css'
import Cast from './movies/Cast'
import MovieSubtitle from './movies/MovieSubtitle'
import Related from './movies/Related'

export default function Media() {
  const { id } = useParams<{ id: string }>()
  const pageRef = useRef<HTMLDivElement>(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const placeholderData = useLocation().state as MediaItem & {
    library?: Library
  }

  const { data, error } = useQuery<MediaItem & { library?: Library }>({
    ...useQueryAPIHelper('mediaByIdWithLibrary', { id }),
    placeholderData,
  })

  useLayoutEffect(() => {
    if (!id) return

    const page = pageRef.current
    if (page) findScrollViewport(page)?.scrollTo({ top: 0 })
  }, [id])

  if (error || !data) {
    return (
      <div ref={pageRef} className={styles.page}>
        <div className={styles.errorBox}>
          <p>{error ? error.message : 'Something went wrong.'}</p>
          <Link to="/" className={styles.backLink}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

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
    <div ref={pageRef} className={styles.page}>
      {showPlayer && (
        <VideoPlayer
          item={data}
          poster={posterSrc}
          onClose={() => setShowPlayer(false)}
        />
      )}
      {backdrops.length > 0 && (
        <BackgroundSlideshow
          images={backdrops}
          height="75%"
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
        <Flex gap="3" dir="col" className={styles.poster}>
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

          {/* PLAY BUTTON */}
          <Button
            className={styles.playButton}
            onClick={() => setShowPlayer(true)}
          >
            <PlayIcon />
          </Button>
        </Flex>
        <Flex dir="col" gap="4" className={styles.logo}>
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
        <Flex
          gap="4"
          justify="between"
          align="center"
          className={styles.subtitle}
        >
          {data.library?.type === LibraryType.Movies && (
            <MovieSubtitle data={data} />
          )}
          <Menu
            className={styles.optionsMenu}
            items={[
              { label: 'Edit', icon: icons.Edit },
              { label: 'Refresh metadata', icon: icons['Refresh metadata'] },
              { label: 'Edit images', icon: icons['Edit images'] },
              { label: 'Download', icon: icons.Download },
              // {
              //   label: 'Sort by',
              //   children: [{ label: 'Name' }],
              // },
              // 'separator',
              { label: 'Delete', icon: icons.Delete },
            ]}
          >
            <Button.Icon>
              <MoreVerticalIcon />
            </Button.Icon>
          </Menu>
        </Flex>
        <Flex gap="5">
          <Flex dir="col" gap="5" className={styles.contentStart}>
            <div className={styles.description}>
              <p>{description}</p>
            </div>
            <Cast data={data.cast} />
            <Related id={data.id} />
          </Flex>
          <MetaTable data={data} className={styles.metaTableContainer} />
        </Flex>
      </Surface>
    </div>
  )
}
