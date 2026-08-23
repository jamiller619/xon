import {
  Album24Regular as AlbumIcon,
  Person24Regular as ArtistIcon,
  Grid16Regular as GridIcon,
  List16Regular as ListIcon,
} from '@fluentui/react-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LibraryStats } from '@xon/shared'
import {
  Card,
  Drawer,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
} from '@xon/ui'
import clsx from 'clsx'
import prettyBytes from 'pretty-bytes'
import { useEffect, useMemo, useState } from 'react'
import ArtworkImage from '~/components/ArtworkImage'
import MediaCard from '~/components/media-card/MediaCard'
import { apiFetch, thumbnailUrl } from '~/lib/apiFetch'
import { subscribeToEvents } from '~/lib/eventStream'
import { useAppStore } from '~/store/appStore'
import GridView from '../../components/GridView'
import LibraryViewControls from '../../components/LibraryViewControls'
import LibraryViewLayout from '../../components/LibraryViewLayout'
import ListView from '../../components/ListView'
import SelectWrapper from '../../components/SelectWrapper'
import ThumbnailSizeControl from '../../components/ThumbnailSizeControl'
import { useLibrarySort } from '../../hooks/useLibrarySort'
import { useLibraryThumbnailSize } from '../../hooks/useLibraryThumbnailSize'
import { useLibraryViewMode } from '../../hooks/useLibraryViewMode'
import type { LibraryTypeViewProps } from '../../LibraryTypeView'
import type {
  LibraryViewModeDefinition,
  ListColumn,
  ListRowProps,
  SortDirection,
  SortOption,
  SortValue,
} from '../../types/collectionView'
import { useMovieLibraryMedia } from '../movies/useMovieLibraryMedia'
import AlbumTrackList from './AlbumTrackList'
import styles from './MusicLibraryView.module.css'
import type { MusicGroup, MusicSummary } from './musicTypes'

type MusicCategory = 'album' | 'artist' | 'song'
type MusicViewMode = 'grid' | 'list'
type MusicSortKey = 'title' | 'createdAt'

const MUSIC_CATEGORIES = [
  { id: 'album', label: 'Album' },
  { id: 'artist', label: 'Artist' },
  { id: 'song', label: 'Song' },
] as const

const MUSIC_SORT_OPTIONS = [
  { label: 'Title A→Z', key: 'title', direction: 'asc' },
  { label: 'Title Z→A', key: 'title', direction: 'desc' },
  { label: 'Date Added (newest)', key: 'createdAt', direction: 'desc' },
  { label: 'Date Added (oldest)', key: 'createdAt', direction: 'asc' },
] as const satisfies readonly SortOption<MusicSortKey>[]

const DEFAULT_MUSIC_SORT = {
  key: 'title',
  direction: 'asc',
} as const satisfies SortValue<MusicSortKey>

const MUSIC_VIEW_MODES = [
  {
    id: 'grid',
    label: 'Grid',
    icon: <GridIcon />,
    sortPresentation: 'toolbar',
    sortOptions: MUSIC_SORT_OPTIONS,
    defaultSort: DEFAULT_MUSIC_SORT,
  },
  {
    id: 'list',
    label: 'List',
    icon: <ListIcon />,
    sortPresentation: 'columns',
    sortOptions: MUSIC_SORT_OPTIONS,
    defaultSort: DEFAULT_MUSIC_SORT,
  },
] as const satisfies readonly LibraryViewModeDefinition<
  MusicViewMode,
  MusicSortKey
>[]

const GROUP_LIST_COLUMNS = [
  { key: 'title', label: 'Title', sortKey: 'title' },
  { key: 'detail', label: 'Details' },
  { key: 'createdAt', label: 'Date Added', sortKey: 'createdAt' },
] as const satisfies readonly ListColumn<MusicSortKey>[]

const SONG_LIST_COLUMNS = [
  { key: 'thumbnail', width: '4.5rem' },
  { key: 'title', label: 'Title', sortKey: 'title' },
  { key: 'duration', label: 'Duration' },
  { key: 'fileSize', label: 'File Size' },
  { key: 'releaseDate', label: 'Release Date' },
  { key: 'createdAt', label: 'Date Added', sortKey: 'createdAt' },
  { key: 'actions', label: 'Actions', width: '6rem' },
] as const satisfies readonly ListColumn<MusicSortKey>[]

const loadNoMoreItems = () => {}

function compareGroups(
  left: MusicGroup,
  right: MusicGroup,
  sortKey: MusicSortKey,
  direction: SortDirection,
) {
  const result =
    sortKey === 'createdAt'
      ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      : left.title.localeCompare(right.title, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
  return direction === 'asc' ? result : -result
}

function groupDetail(item: MusicGroup, category: MusicCategory): string {
  if (category === 'album') {
    return `${item.artist ?? 'Unknown Artist'} · ${item.songCount} ${
      item.songCount === 1 ? 'song' : 'songs'
    }`
  }
  return `${item.albumCount ?? 0} ${
    item.albumCount === 1 ? 'album' : 'albums'
  } · ${item.songCount} ${item.songCount === 1 ? 'song' : 'songs'}`
}

export default function MusicLibraryView({ library }: LibraryTypeViewProps) {
  const queryClient = useQueryClient()
  const [selectedAlbum, setSelectedAlbum] = useState<MusicGroup | null>(null)
  const [albumDrawerOpen, setAlbumDrawerOpen] = useState(false)
  const setSelectMode = useAppStore(({ setSelectMode }) => setSelectMode)
  const setSelectedItems = useAppStore(
    ({ setSelectedItems }) => setSelectedItems,
  )
  const { viewMode: category, setViewMode: setCategory } = useLibraryViewMode(
    `${library.id}:music-category`,
    MUSIC_CATEGORIES,
    'album',
  )
  const { viewMode, setViewMode } = useLibraryViewMode(
    `${library.id}:music-${category}`,
    MUSIC_VIEW_MODES,
    'grid',
  )
  const { thumbnailSize, setThumbnailSize } = useLibraryThumbnailSize(
    `${library.id}:music-${category}`,
    160,
  )
  const controls = useLibrarySort(MUSIC_SORT_OPTIONS, DEFAULT_MUSIC_SORT)
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
  const musicQuery = useQuery<MusicSummary>({
    queryKey: ['music-library', library.id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${library.id}/music`, {
        signal,
      })
      if (!response.ok) throw new Error('Failed to load music library')
      return response.json()
    },
  })
  const songsQuery = useMovieLibraryMedia({
    libraryId: library.id,
    sortKey: controls.sortKey,
    sortDirection: controls.sortDirection,
    mediaType: 'audio',
    unmatchedOnly: false,
  })

  useEffect(() => {
    if (category === 'song') return
    setSelectMode(false)
    setSelectedItems([])
  }, [category, setSelectMode, setSelectedItems])

  useEffect(() => {
    if (category !== 'album') setAlbumDrawerOpen(false)
  }, [category])

  useEffect(
    () =>
      subscribeToEvents((event) => {
        if (
          event.type === 'scan:complete' &&
          event.payload.libraryId === library.id
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['music-library', library.id],
          })
        }
      }),
    [library.id, queryClient],
  )

  const groups = useMemo(() => {
    const items =
      category === 'artist'
        ? (musicQuery.data?.artists ?? [])
        : (musicQuery.data?.albums ?? [])
    return [...items].sort((left, right) =>
      compareGroups(left, right, controls.sortKey, controls.sortDirection),
    )
  }, [category, controls.sortDirection, controls.sortKey, musicQuery.data])
  const songs = songsQuery.data?.pages.flatMap((page) => page.items) ?? []
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
  const error =
    category === 'song'
      ? songsQuery.error && 'Failed to load songs'
      : musicQuery.error && `Failed to load ${category}s`
  const groupCollectionProps = {
    isLoading: musicQuery.isPending,
    items: groups,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: loadNoMoreItems,
    resetKey: `${category}:${controls.sortKey}:${controls.sortDirection}`,
    getItemKey: (item: MusicGroup) => item.id,
    emptyContent: `No ${category}s in this library yet.`,
  }
  const songCollectionProps = {
    isLoading: songsQuery.isPending,
    items: songs,
    hasNextPage: songsQuery.hasNextPage,
    isFetchingNextPage: songsQuery.isFetchingNextPage,
    onLoadMore: () => void songsQuery.fetchNextPage(),
    resetKey: `song:${controls.sortKey}:${controls.sortDirection}`,
    getItemKey: (item: (typeof songs)[number]) => item.id,
    emptyContent: 'No songs in this library yet.',
  }

  function openAlbum(album: MusicGroup) {
    setSelectedAlbum(album)
    setAlbumDrawerOpen(true)
  }

  return (
    <>
      <LibraryViewLayout
        title={library.name}
        stats={stats}
        {...(error ? { error } : {})}
        footer={
          viewMode === 'grid' ? (
            <ThumbnailSizeControl
              value={thumbnailSize}
              onChange={setThumbnailSize}
            />
          ) : undefined
        }
        controls={
          <LibraryViewControls
            libraryId={library.id}
            modes={MUSIC_VIEW_MODES}
            viewMode={viewMode}
            sortKey={controls.sortKey}
            sortDirection={controls.sortDirection}
            primaryControls={
              <ToggleButtonGroup value={[category]} aria-label="Music category">
                {MUSIC_CATEGORIES.map((item) => (
                  <ToggleButton
                    key={item.id}
                    value={item.id}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            }
            selectionEnabled={category === 'song'}
            onViewModeChange={setViewMode}
            onSortOptionChange={controls.handleSortOption}
          />
        }
      >
        {category === 'song' ? (
          viewMode === 'grid' ? (
            <GridView
              {...songCollectionProps}
              minCardWidth={thumbnailSize}
              renderItem={(item) => (
                <SelectWrapper id={item.id}>
                  {(onOpen) => (
                    <MediaCard
                      item={item}
                      library={library}
                      {...(onOpen ? { onOpen } : {})}
                    />
                  )}
                </SelectWrapper>
              )}
            />
          ) : (
            <ListView
              {...songCollectionProps}
              columns={SONG_LIST_COLUMNS}
              sortKey={controls.sortKey}
              sortDirection={controls.sortDirection}
              onSort={controls.handleSort}
              renderRow={(item, rowProps) => (
                <MediaCard
                  item={item}
                  library={library}
                  listView
                  listRowProps={rowProps}
                />
              )}
            />
          )
        ) : viewMode === 'grid' ? (
          <GridView
            {...groupCollectionProps}
            minCardWidth={thumbnailSize}
            cardHeightRatio={1}
            renderSkeleton={() => <Skeleton aspectRatio="1 / 1" />}
            renderItem={(item) => (
              <MusicGroupCard
                item={item}
                category={category}
                {...(category === 'album'
                  ? { onOpen: () => openAlbum(item) }
                  : {})}
              />
            )}
          />
        ) : (
          <ListView
            {...groupCollectionProps}
            columns={GROUP_LIST_COLUMNS}
            sortKey={controls.sortKey}
            sortDirection={controls.sortDirection}
            onSort={controls.handleSort}
            renderRow={(item, rowProps) => (
              <MusicGroupRow
                item={item}
                category={category}
                rowProps={rowProps}
                {...(category === 'album'
                  ? { onOpen: () => openAlbum(item) }
                  : {})}
              />
            )}
          />
        )}
      </LibraryViewLayout>
      <Drawer
        open={albumDrawerOpen}
        onOpenChange={setAlbumDrawerOpen}
        onOpenChangeComplete={(open: boolean) => {
          if (!open) setSelectedAlbum(null)
        }}
        // title={selectedAlbum?.title ?? 'Album'}
        // description={selectedAlbum?.artist ?? 'Track list'}
      >
        {selectedAlbum != null && (
          <AlbumTrackList libraryId={library.id} album={selectedAlbum} />
        )}
      </Drawer>
    </>
  )
}

type MusicGroupProps = {
  item: MusicGroup
  category: Exclude<MusicCategory, 'song'>
  onOpen?: (() => void) | undefined
}

function MusicGroupCard({ item, category, onOpen }: MusicGroupProps) {
  const content = (
    <>
      <Card.Thumb aspectRatio="1 / 1" className={styles.collectionArtwork}>
        <ArtworkImage
          src={item.artwork ? thumbnailUrl(item.artwork, 'medium') : undefined}
          alt=""
          loading="lazy"
          fallback={category === 'album' ? <AlbumIcon /> : <ArtistIcon />}
        />
      </Card.Thumb>
      <Card.Info>
        <Card.Title>{item.title}</Card.Title>
        <Card.Meta>{groupDetail(item, category)}</Card.Meta>
      </Card.Info>
    </>
  )

  return onOpen ? (
    <Card
      as="button"
      type="button"
      className={clsx(styles.collectionCard, styles.collectionButton)}
      onClick={onOpen}
    >
      {content}
    </Card>
  ) : (
    <Card className={styles.collectionCard}>{content}</Card>
  )
}

function MusicGroupRow({
  item,
  category,
  rowProps,
  onOpen,
}: MusicGroupProps & { rowProps: ListRowProps }) {
  const { className, ...restRowProps } = rowProps

  return (
    <tr
      {...restRowProps}
      className={clsx(className, onOpen && styles.collectionRow)}
      onClick={onOpen}
    >
      <td className={styles.collectionTitle} data-column="title">
        {onOpen ? (
          <button
            type="button"
            className={styles.collectionTitleButton}
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {item.title}
          </button>
        ) : (
          item.title
        )}
      </td>
      <td className={styles.muted}>{groupDetail(item, category)}</td>
      <td className={styles.muted}>
        {new Date(item.createdAt).toLocaleDateString()}
      </td>
    </tr>
  )
}
