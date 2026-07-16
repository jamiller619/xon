import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import MediaCard, {} from '~/components/media-card/MediaCard'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { librariesQuery } from '~/lib/librariesApi'
import System from './cards/System'
import styles from './Dashboard.module.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export default function Dashboard() {
  const { data: recentMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('recentMedia'),
  )

  const { data: libraries } = useQuery(librariesQuery)

  return (
    <Flex dir="col" gap="4">
      <PluginSlot injectionPoint="dashboard-widget" />
      <MediaSection
        key="featured"
        className={styles.featured}
        title="Featured"
        media={recentMedia}
      />
      <Flex gap="4">
        <DashboardSection key="my-libraries" title="Libraries">
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
                <small>{library.type}</small>
              </span>
            </Link>
          ))}
        </DashboardSection>
        <DashboardSection key="continue-watching" title="Continue Watching" />
      </Flex>
      <MediaSection
        key="recently-added"
        title="Recently Added"
        media={recentMedia}
      />
      <System key="system" />
    </Flex>
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
      <Surface
        borderRadius="sm"
        className={clsx(styles.section, className)}
        {...props}
      >
        <Flex justify="between">
          <h6 className={styles.title}>{title}</h6>
          <Flex gap="2">
            <XScroller.ButtonPrev />
            <XScroller.ButtonNext />
          </Flex>
        </Flex>
        <XScroller.Viewport className={styles.content}>
          {children}
        </XScroller.Viewport>
      </Surface>
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
