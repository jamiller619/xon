import { Search20Filled as SearchIcon } from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Card, Skeleton } from '@xon/ui'
import ArtworkImage from '~/components/ArtworkImage'
import useMetadata from '~/hooks/useMetadata'
import { thumbnailUrl } from '~/lib/apiFetch'
import styles from './SearchDialog.module.css'
import { SEARCH_RESULT_LIMIT, type SearchStatus } from './useSearchDialogData'

interface SearchResultsProps {
  id: string
  query: string
  status: SearchStatus
  results: MediaItem[]
  highlightIdx: number
  onOpen: (item: MediaItem) => void
}

export default function SearchResults({
  id,
  query,
  status,
  results,
  highlightIdx,
  onOpen,
}: SearchResultsProps) {
  if (status === 'loading') {
    return (
      <div
        id={id}
        className={styles.resultGrid}
        role="status"
        aria-label="Loading results"
      >
        {Array.from({ length: SEARCH_RESULT_LIMIT }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed visual placeholders
          <div key={index} className={styles.skeleton} aria-hidden="true">
            <Skeleton className={styles.skeletonPoster} />
            <Skeleton className={styles.skeletonLine} />
          </div>
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p id={id} className={styles.resultMessage} data-state="error">
        Search couldn't load. Keep typing to try again.
      </p>
    )
  }

  if (!query.trim() && results.length === 0) {
    return (
      <p id={id} className={styles.resultMessage}>
        Start typing to search your media.
      </p>
    )
  }

  if (results.length === 0) {
    return (
      <p id={id} className={styles.resultMessage}>
        No media matches “{query.trim()}”. Try a title, person, genre, tag, or
        filename.
      </p>
    )
  }

  return (
    <div id={id} className={styles.resultGrid} role="listbox">
      {results.map((item, index) => (
        <SearchResult
          key={item.id}
          id={`${id}-${item.id}`}
          item={item}
          selected={highlightIdx === index}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

interface SearchResultProps {
  id: string
  item: MediaItem
  selected: boolean
  onOpen: (item: MediaItem) => void
}

function SearchResult({ id, item, selected, onOpen }: SearchResultProps) {
  const poster = thumbnailUrl(item, 'medium')
  const metadata = useMetadata(item, 'year', 'type')

  return (
    <Card
      id={id}
      as="button"
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.resultCard}
      onClick={() => onOpen(item)}
    >
      <Card.Thumb className={styles.resultThumb} aspectRatio="2 / 3">
        <ArtworkImage
          src={poster}
          alt=""
          loading="lazy"
          fallback={
            <div className={styles.posterPlaceholder}>
              <SearchIcon aria-hidden="true" />
            </div>
          }
        />
      </Card.Thumb>
      <Card.Info className={styles.resultInfo}>
        <Card.Title className={styles.resultTitle}>{item.title}</Card.Title>
        {metadata && (
          <Card.Meta className={styles.resultMeta}>{metadata}</Card.Meta>
        )}
      </Card.Info>
    </Card>
  )
}

export function resultAnnouncement(
  query: string,
  status: SearchStatus,
  count: number,
): string {
  if (!query.trim() || status === 'idle' || status === 'loading') return ''
  if (status === 'error') return 'Search failed.'
  return `${count} ${count === 1 ? 'result' : 'results'} found.`
}
