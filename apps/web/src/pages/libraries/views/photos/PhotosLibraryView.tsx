import {
  List16Regular as ListIcon,
  Grid16Regular as MasonryIcon,
} from '@fluentui/react-icons'
import { useQuery } from '@tanstack/react-query'
import type { LibraryStats, MediaItem } from '@xon/shared'
import prettyBytes from 'pretty-bytes'
import { useCallback, useMemo, useState } from 'react'
import MediaCard from '~/components/media-card/MediaCard'
import ImageViewer from '~/components/viewers/ImageViewer'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import type { LibraryTypeViewProps } from '../../LibraryTypeView'
import LibraryViewControls from '../../shared/components/LibraryViewControls'
import LibraryViewLayout from '../../shared/components/LibraryViewLayout'
import ListView from '../../shared/components/ListView'
import MasonryView from '../../shared/components/MasonryView'
import { useLibrarySort } from '../../shared/hooks/useLibrarySort'
import { useLibraryViewMode } from '../../shared/hooks/useLibraryViewMode'
import type { LibraryViewModeDefinition } from '../../shared/types/collectionView'
import { MOVIE_LIST_COLUMNS } from '../movies/MovieListColumns'
import {
  DEFAULT_MOVIE_SORT,
  MOVIE_SORT_OPTIONS,
  type MovieSortKey,
} from '../movies/movieControls'
import { useMovieLibraryMedia } from '../movies/useMovieLibraryMedia'

type PhotoViewMode = 'masonry' | 'list'

const PHOTO_VIEW_MODES = [
  {
    id: 'masonry',
    label: 'Masonry',
    icon: <MasonryIcon />,
    sortPresentation: 'toolbar',
    sortOptions: MOVIE_SORT_OPTIONS,
    defaultSort: DEFAULT_MOVIE_SORT,
  },
  {
    id: 'list',
    label: 'List',
    icon: <ListIcon />,
    sortPresentation: 'columns',
    sortOptions: MOVIE_SORT_OPTIONS,
    defaultSort: DEFAULT_MOVIE_SORT,
  },
] as const satisfies readonly LibraryViewModeDefinition<
  PhotoViewMode,
  MovieSortKey
>[]

function photoAspectRatio(item: MediaItem): number | undefined {
  const width = Number(item.fileMetadata.width)
  const height = Number(item.fileMetadata.height)
  if (!(width > 0) || !(height > 0)) return undefined
  return width / height
}

export default function PhotosLibraryView({ library }: LibraryTypeViewProps) {
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  const { viewMode, setViewMode } = useLibraryViewMode(
    library.id,
    PHOTO_VIEW_MODES,
    'masonry',
  )
  const activeMode =
    PHOTO_VIEW_MODES.find((mode) => mode.id === viewMode) ?? PHOTO_VIEW_MODES[0]
  const controls = useLibrarySort(
    activeMode.sortOptions,
    activeMode.defaultSort,
  )
  const { data: libraryStats } = useQuery<LibraryStats>({
    queryKey: ['library-stats', library.id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${library.id}/stats`, {
        signal,
      })
      if (!response.ok) throw new Error('Failed to load library stats')
      return response.json()
    },
  })
  const mediaQuery = useMovieLibraryMedia({
    libraryId: library.id,
    sortKey: controls.sortKey,
    sortDirection: controls.sortDirection,
    mediaType: '',
    unmatchedOnly: false,
  })
  const items = mediaQuery.data?.pages.flatMap((page) => page.items) ?? []
  const viewerPhotos = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnailSrc: thumbnailUrl(item, 'small') ?? undefined,
      })),
    [items],
  )
  const openPhoto = openPhotoId
    ? items.find((item) => item.id === openPhotoId)
    : undefined
  const handleViewerIndexChange = useCallback(
    (index: number) => {
      if (
        index >= items.length - 5 &&
        mediaQuery.hasNextPage &&
        !mediaQuery.isFetchingNextPage
      ) {
        void mediaQuery.fetchNextPage()
      }
    },
    [
      items.length,
      mediaQuery.fetchNextPage,
      mediaQuery.hasNextPage,
      mediaQuery.isFetchingNextPage,
    ],
  )
  const resetKey = `${controls.sortKey}:${controls.sortDirection}`
  const collectionProps = {
    isLoading: mediaQuery.isPending,
    items,
    hasNextPage: mediaQuery.hasNextPage,
    isFetchingNextPage: mediaQuery.isFetchingNextPage,
    onLoadMore: () => void mediaQuery.fetchNextPage(),
    resetKey,
    getItemKey: (item: (typeof items)[number]) => item.id,
    emptyContent: 'No photos in this library yet.',
  }
  const stats = [
    library.dataSources.length
      ? library.dataSources.map((source) => source.path).join(', ')
      : '',
    libraryStats
      ? `${libraryStats.totalItems.toLocaleString()} ${
          libraryStats.totalItems === 1 ? 'item' : 'items'
        }`
      : '',
    libraryStats ? prettyBytes(libraryStats.totalSize) : '',
  ].filter(Boolean)

  return (
    <LibraryViewLayout
      title={library.name}
      stats={stats}
      error={mediaQuery.error ? 'Failed to load photos' : undefined}
      controls={
        <LibraryViewControls
          libraryId={library.id}
          modes={PHOTO_VIEW_MODES}
          viewMode={viewMode}
          sortKey={controls.sortKey}
          sortDirection={controls.sortDirection}
          onViewModeChange={setViewMode}
          onSortOptionChange={controls.handleSortOption}
        />
      }
    >
      {viewMode === 'masonry' ? (
        <MasonryView
          {...collectionProps}
          getItemAspectRatio={photoAspectRatio}
          renderItem={(item) => {
            const aspectRatio = photoAspectRatio(item)
            return (
              <MediaCard
                item={item}
                library={library}
                imageOnly
                thumbAspectRatio={aspectRatio ? String(aspectRatio) : '4 / 3'}
                onOpen={(photo) => setOpenPhotoId(photo.id)}
              />
            )
          }}
        />
      ) : (
        <ListView
          {...collectionProps}
          columns={MOVIE_LIST_COLUMNS}
          sortKey={controls.sortKey}
          sortDirection={controls.sortDirection}
          onSort={controls.handleSort}
          renderRow={(item, rowProps) => (
            <MediaCard
              item={item}
              library={library}
              listView
              listRowProps={rowProps}
              onOpen={(photo) => setOpenPhotoId(photo.id)}
            />
          )}
        />
      )}
      {openPhoto && (
        <ImageViewer
          mediaId={openPhoto.id}
          title={openPhoto.title}
          siblings={viewerPhotos}
          onCurrentIndexChange={handleViewerIndexChange}
          onClose={() => setOpenPhotoId(null)}
        />
      )}
    </LibraryViewLayout>
  )
}
