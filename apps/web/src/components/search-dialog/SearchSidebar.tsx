import { History20Regular as HistoryIcon } from '@fluentui/react-icons'
import { Button, Flex } from '@xon/ui'
import Eyebrow from '~/components/Eyebrow'
import styles from './SearchDialog.module.css'
import type { SearchStatus } from './useSearchDialogData'

interface SearchSidebarProps {
  historyId: string
  visibleHistory: string[]
  highlightIdx: number
  genres: string[]
  genresStatus: SearchStatus
  onClearHistory: () => void
  onSearch: (query: string) => void
}

export default function SearchSidebar({
  historyId,
  visibleHistory,
  highlightIdx,
  genres,
  genresStatus,
  onClearHistory,
  onSearch,
}: SearchSidebarProps) {
  return (
    <aside className={styles.sidebarContent}>
      <section className={styles.section}>
        <Eyebrow>Recent searches</Eyebrow>
        {visibleHistory.length > 0 ? (
          <>
            <Flex id={historyId} gap="1" wrap role="listbox">
              {visibleHistory.map((item, index) => (
                <Button
                  key={item}
                  id={`${historyId}-${index}`}
                  size="xsmall"
                  role="option"
                  aria-selected={highlightIdx === index}
                  className={styles.historyButton}
                  variant="ghost"
                  onClick={() => onSearch(item)}
                >
                  <HistoryIcon aria-hidden="true" />
                  <span>{item}</span>
                </Button>
              ))}
            </Flex>
            <Button
              variant="link"
              size="xsmall"
              className={styles.clearButton}
              onClick={onClearHistory}
            >
              Clear history
            </Button>
          </>
        ) : (
          <p id={historyId} className={styles.resultMessage}>
            No recent searches.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <Eyebrow>Explore genres</Eyebrow>
        {genresStatus === 'loading' ? (
          <p className={styles.sidebarMessage}>Loading genres...</p>
        ) : genres.length > 0 ? (
          <Flex gap="1" wrap role="listbox">
            {genres.map((genre) => (
              <Button
                key={genre}
                variant="chip"
                onClick={() => onSearch(genre)}
                size="xsmall"
              >
                {genre}
              </Button>
            ))}
          </Flex>
        ) : (
          <p className={styles.sidebarMessage}>
            {genresStatus === 'error'
              ? "Genres couldn't load."
              : 'No genres yet.'}
          </p>
        )}
      </section>
    </aside>
  )
}
