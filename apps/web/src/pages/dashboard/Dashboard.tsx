import {
  ArrowSyncRegular as RefreshIcon,
  FolderSearchRegular as ScanIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Card, ContextMenu, Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import MediaCard from '~/components/media-card/MediaCard'
import PluginSlot from '~/components/PluginSlot'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import { apiPost } from '~/lib/apiFetch'
import { librariesQuery } from '~/lib/librariesApi'
import { useScanStore } from '~/store/scanStore'
import System from './cards/System'
import styles from './Dashboard.module.css'
import FeaturedCarousel from './FeaturedCarousel'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export default function Dashboard() {
  const confirmRefresh = useRefreshMetadataConfirmation()
  const { data: recentMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('recentMedia'),
  )

  const { data: featuredMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('featuredMedia'),
  )

  const { data: libraries } = useQuery(librariesQuery)
  // Cache-busts library thumbnails once a scan (re)generates them
  const scanCompletedAt = useScanStore((s) => s.completedAt)

  return (
    <Flex dir="col" gap="4" className={styles.page}>
      <PluginSlot injectionPoint="dashboard-widget" />
      <FeaturedCarousel key="featured" items={featuredMedia} />
      <Flex gap="4">
        <DashboardSection key="my-libraries" title="Libraries">
          {libraries?.map((library) => (
            <ContextMenu
              items={[
                {
                  label: 'Scan library',
                  icon: <ScanIcon />,
                  onClick: () => apiPost(`/api/libraries/${library.id}/scan`),
                },
                {
                  label: 'Refresh metadata',
                  icon: <RefreshIcon />,
                  onClick: () =>
                    confirmRefresh(() =>
                      apiPost(`/api/libraries/${library.id}/scan/refresh`),
                    ),
                },
              ]}
              key={library.id}
            >
              <Card
                as={Link}
                key={library.id}
                to={`/libraries/${library.id}`}
                className={styles.library}
              >
                <Card.Thumb aspectRatio="4 / 3" className={styles.libraryThumb}>
                  <span className={styles.libraryThumbnailBackdrop}>
                    <img
                      src={`/api/libraries/${library.id}/thumbnail${
                        scanCompletedAt[library.id]
                          ? `?v=${scanCompletedAt[library.id]}`
                          : ''
                      }`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={styles.libraryThumbnailImg}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </span>
                </Card.Thumb>
                <Card.Info>
                  <Card.Title>{library.name}</Card.Title>
                  {/* <Card.Meta>{library.type}</Card.Meta> */}
                </Card.Info>
              </Card>
            </ContextMenu>
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
