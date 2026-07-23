import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import MediaCard from '~/components/media-card/MediaCard'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import System from './cards/System'
import styles from './Dashboard.module.css'
import FeaturedCarousel from './FeaturedCarousel'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import LibraryCard from '~/components/LibraryCard'
import useLibraries from '~/hooks/useLibraries'
import Page from '../Page'

export default function Dashboard() {
  const { data: recentMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('recentMedia'),
  )

  const { data: featuredMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('featuredMedia'),
  )

  const { data: libraries } = useLibraries()

  return (
    <Page>
      <PluginSlot injectionPoint="dashboard-widget" />
      <FeaturedCarousel key="featured" items={featuredMedia} />
      <Flex gap="4">
        <DashboardSection key="my-libraries" title="Libraries">
          {libraries?.map((library) => (
            <LibraryCard key={library.id} data={library} withLink />
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
    </Page>
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
        borderRadius="small"
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
