import type { MediaItem } from '@xon/shared'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import ReactGridLayout, { useContainerWidth } from 'react-grid-layout'
import { Link } from 'react-router-dom'
import MediaCard, {} from '~/components/media-card/MediaCard'
import PluginSlot from '~/components/PluginSlot'
import useMedia from '~/hooks/useMedia'
import styles from './Dashboard.module.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import useLibraries from '~/hooks/useLibraries'
import System from './System'

export default function Dashboard() {
  const { width, containerRef, mounted } = useContainerWidth()
  const { libraries } = useLibraries()
  const { media: recentMedia, isLoading: isRecentMediaLoading } = useMedia({
    order: 'desc',
    limit: 20,
  })

  const isLoading = isRecentMediaLoading

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading...</p>
      </div>
    )
  }

  const layout = [
    { i: 'featured', x: 0, y: 0, w: 12, h: 1 },
    { i: 'my-media', x: 0, y: 1, w: 6, h: 1 },
    { i: 'continue-watching', x: 6, y: 1, w: 6, h: 1 },
    { i: 'recently-added', x: 0, y: 2, w: 8, h: 1 },
    { i: 'system', x: 8, y: 3, w: 4, h: 1 },
  ]

  return (
    <div ref={containerRef}>
      <PluginSlot injectionPoint="dashboard-widget" />
      {mounted && isLoading === false && (
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
            {libraries.map((library) => (
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
                  <small>{library.mediaCategories[0]}</small>
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
    <section className={clsx(styles.section, className)} {...props}>
      <h2>{title}</h2>
      <div className={styles.content}>{children}</div>
    </section>
  )
}

type MediaSectionProps = DashboardSectionProps & {
  media?: MediaItem[]
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
