import type { Library, MediaItem } from '@xon/shared'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import { Link } from 'react-router-dom'
import MediaCard, {} from '~/components/media-card/MediaCard'
import PluginSlot from '~/components/PluginSlot'
import styles from './Dashboard.module.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useQuery } from '@tanstack/react-query'
import { Flex, XScroller } from '@xon/ui'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import System from './cards/System'

const layout = [
  { i: 'featured', x: 0, y: 0, w: 12, h: 1 },
  { i: 'my-media', x: 0, y: 1, w: 6, h: 1 },
  { i: 'continue-watching', x: 6, y: 1, w: 6, h: 1 },
  { i: 'recently-added', x: 0, y: 2, w: 8, h: 1 },
  { i: 'system', x: 8, y: 3, w: 4, h: 1 },
]

export default function Dashboard() {
  const { width, containerRef, mounted } = useContainerWidth()
  const {
    isPending,
    error,
    data: recentMedia,
  } = useQuery<MediaItem[]>(useQueryAPIHelper('recentMedia'))

  const { data: libraries } = useQuery<Library[]>(
    useQueryAPIHelper('libraries'),
  )

  if (isPending) {
    return (
      <div className={styles.loading}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <PluginSlot injectionPoint="dashboard-widget" />
      {mounted && isPending === false && (
        <ReactGridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 360 }}
        >
          <MediaSection
            key="featured"
            className={styles.featured}
            title="Featured"
            media={recentMedia}
          />
          <DashboardSection key="my-media" title="My Media">
            {libraries?.map((library) => (
              <Link
                key={library.id}
                to={`/library/${library.id}`}
                className={styles.library}
              >
                <span
                  className={styles.libraryThumbnailBackdrop}
                  style={{
                    backgroundImage: `url(/api/libraries/${library.id}/thumbnail)`,
                  }}
                />
                <span className={styles.libraryThumbnailTitle}>
                  <h1>{library.name}</h1>
                  <small>{library.types[0]}</small>
                </span>
              </Link>
            ))}
          </DashboardSection>
          <DashboardSection key="continue-watching" title="Continue Watching" />
          <MediaSection
            key="recently-added"
            title="Recently Added"
            media={recentMedia}
          />
          <System key="system" />
        </ReactGridLayout>
      )}
    </div>
  )
}

type DashboardSectionProps = HTMLAttributes<HTMLElement> & {
  title: string
}

function DashboardSection({
  className,
  title,
  children,
  ...props
}: DashboardSectionProps) {
  return (
    <XScroller>
      <section className={clsx(styles.section, className)} {...props}>
        <Flex justify="between">
          <h2>{title}</h2>
          <Flex gap="2">
            <XScroller.ButtonPrev />
            <XScroller.ButtonNext />
          </Flex>
        </Flex>
        <XScroller.Viewport className={styles.content}>
          {children}
        </XScroller.Viewport>
      </section>
    </XScroller>
  )
}

type MediaSectionProps = DashboardSectionProps & {
  media?: MediaItem[] | undefined
}

function MediaSection({ title, media, ...props }: MediaSectionProps) {
  return (
    <DashboardSection title={title} {...props}>
      {media && media.length > 0 ? (
        media.map((item) => <MediaCard key={item.id} item={item} />)
      ) : (
        <div className={styles.emptyHint}>
          <p>
            No media yet. <Link to="/admin/libraries">Add a library</Link> to
            get started.
          </p>
        </div>
      )}
    </DashboardSection>
  )
}
