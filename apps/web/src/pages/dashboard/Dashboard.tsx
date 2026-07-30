import { useQueries, useQuery } from '@tanstack/react-query'
import type { Library, MediaItem, PlayState } from '@xon/shared'
import { Flex, Surface, XScroller } from '@xon/ui'
import clsx from 'clsx'
import type { HTMLAttributes } from 'react'
import ReactGridLayout, {
  noCompactor,
  useContainerWidth,
} from 'react-grid-layout'
import LibraryCard from '~/components/LibraryCard'
import MediaCard from '~/components/media-card/MediaCard'
import useLibraries from '~/hooks/useLibraries'
import useQueryAPIHelper from '~/hooks/useQueryAPIHelper'
import Page from '../Page'
import FeaturedCarousel from './cards/FeaturedCarousel'
import System from './cards/System'
import styles from './Dashboard.module.css'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const baseLayout = [
  { i: 'featured', x: 0, y: 0, w: 8, h: 3, static: true },
  { i: 'libraries', x: 0, y: 3, w: 4, h: 2 },
  { i: 'continue-watching', x: 4, y: 3, w: 4, h: 2 },
  { i: 'system', x: 5, y: 5, w: 3, h: 3 },
]

export default function Dashboard() {
  const { width, containerRef, mounted } = useContainerWidth()

  const { data: featuredMedia } = useQuery<MediaItem[]>(
    useQueryAPIHelper('featuredMedia'),
  )

  const { data: continueWatching } = useQuery<PlayState[]>(
    useQueryAPIHelper('continueWatching'),
  )

  const { data: libraries } = useLibraries()

  const recentMediaQueries = useQueries({
    queries: (libraries ?? []).map((library) => ({
      queryKey: ['recentMedia', library.id],
      queryFn: async ({ signal }): Promise<MediaItem[]> => {
        const params = new URLSearchParams({
          sortBy: 'createdAt',
          order: 'desc',
          page: '1',
          limit: '10',
        })
        const response = await fetch(
          `/api/libraries/${encodeURIComponent(library.id)}/media?${params}`,
          { signal },
        )

        if (!response.ok) throw new Error(response.statusText)

        return response.json()
      },
    })),
  })

  const layout = [
    ...baseLayout,
    ...(libraries ?? []).map((library, index) => ({
      i: `recently-added-${library.id}`,
      x: 0,
      y: 5 + index * 2,
      w: 5,
      h: 2,
    })),
  ]

  return (
    <Page ref={containerRef}>
      {/* <PluginSlot injectionPoint="dashboard-widget" /> */}
      {mounted && (
        <ReactGridLayout
          layout={layout}
          width={width}
          compactor={noCompactor}
          gridConfig={{ cols: 8, rowHeight: 160 }}
        >
          <FeaturedCarousel items={featuredMedia} key="featured" />
          <DashboardSection title="Libraries" key="libraries">
            {libraries?.map((library) => (
              <LibraryCard key={library.id} data={library} withLink />
            ))}
          </DashboardSection>
          {libraries?.map((library, index) => (
            <MediaSection
              title={`Recently Added in ${library.name}`}
              media={recentMediaQueries[index]?.data}
              library={library}
              key={`recently-added-${library.id}`}
            />
          ))}
          <DashboardSection title="Continue Watching" key="continue-watching">
            {continueWatching?.map((playState) => (
              <MediaCard
                key={playState.mediaItem?.id}
                // biome-ignore lint/style/noNonNullAssertion: <works>
                item={playState.mediaItem!}
                library={libraries?.find(
                  (l) => l.id === playState.mediaItem?.libraryId,
                )}
              />
            ))}
          </DashboardSection>
          <System key="system" />
        </ReactGridLayout>
      )}
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
  library: Library
}

function MediaSection({ title, media, library, ...props }: MediaSectionProps) {
  return (
    <DashboardSection title={title} {...props}>
      {media && media.length > 0 ? (
        media.map((item) => (
          <MediaCard key={item.id} item={item} library={library} />
        ))
      ) : (
        <div className={styles.emptyHint}>
          <p>No media has been added to this library yet.</p>
        </div>
      )}
    </DashboardSection>
  )
}
