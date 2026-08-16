import {
  ErrorCircle16Regular as ErrorIcon,
  Search20Filled as SearchIcon,
  Checkmark20Regular as SuccessIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import { Surface, Textbox } from '@xon/ui'
import clsx from 'clsx'
import { type RefObject, useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useOnClickOutside } from 'usehooks-ts'
import Eyebrow from '~/components/Eyebrow'
import { mediaPath } from '~/lib/utils'
import styles from './SearchDialog.module.css'
import SearchResults, { resultAnnouncement } from './SearchResults'
import SearchSidebar from './SearchSidebar'
import { type SearchStatus, useSearchDialogData } from './useSearchDialogData'
import { useSearchHistory } from './useSearchHistory'

export type SearchDialogVisualState =
  | 'default'
  | 'hover'
  | 'focus'
  | 'active'
  | 'disabled'
  | SearchStatus

export interface SearchDialogProps {
  preview?: boolean
  visualState?: SearchDialogVisualState
  initialQuery?: string
  initialResults?: MediaItem[]
  initialGenres?: string[]
}

export default function SearchDialog({
  preview = false,
  visualState,
  initialQuery = '',
  initialResults = [],
  initialGenres = [],
}: SearchDialogProps = {}) {
  const navigate = useNavigate()
  const componentId = useId()
  const historyId = `${componentId}-history`
  const resultsId = `${componentId}-results`
  const portalRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(preview)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const normalizedQuery = query.trim()
  const { clearHistory, refreshHistory, saveQuery, visibleHistory } =
    useSearchHistory()

  const { genresStatus, popularGenres, status, suggestions } =
    useSearchDialogData({
      initialGenres,
      initialQuery,
      initialResults,
      open,
      preview,
      query,
    })

  const resolvedStatus: SearchStatus = isSearchStatus(visualState)
    ? visualState
    : status
  const componentState = visualState ?? resolvedStatus
  const navigableItems = normalizedQuery ? suggestions : visibleHistory
  const activeDescendant = getActiveDescendant({
    highlightIdx,
    historyId,
    normalizedQuery,
    resultsId,
    suggestions,
    visibleHistory,
  })

  const handleClickOutside = useCallback(() => {
    if (!preview) setOpen(false)
  }, [preview])

  useOnClickOutside(portalRef as RefObject<HTMLElement>, handleClickOutside)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
    setHighlightIdx(-1)
    setOpen(true)
  }

  function handleFocus() {
    refreshHistory()
    setOpen(true)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightIdx((index) => Math.min(index + 1, navigableItems.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightIdx((index) => Math.max(index - 1, -1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlightIdx >= 0 && normalizedQuery) {
        const result = suggestions[highlightIdx]
        if (result) openResult(result)
        return
      }
      if (highlightIdx >= 0) {
        const historicalQuery = visibleHistory[highlightIdx]
        if (historicalQuery) navigateToSearch(historicalQuery)
        return
      }
      navigateToSearch(query)
      return
    }
    if (event.key === 'Escape') setOpen(false)
  }

  function navigateToSearch(value: string) {
    const nextQuery = value.trim()
    if (!nextQuery) return
    saveQuery(nextQuery)
    setOpen(false)
    setQuery('')
    navigate(`/search?q=${encodeURIComponent(nextQuery)}`)
  }

  function handleClearHistory() {
    clearHistory()
    setHighlightIdx(-1)
  }

  function openResult(item: MediaItem) {
    saveQuery(normalizedQuery || item.title)
    setOpen(false)
    setQuery('')
    navigate(mediaPath(item))
  }

  function renderPanel(expanded: boolean, autoFocus = false) {
    return (
      <Surface
        className={clsx(
          styles.searchPanel,
          expanded ? styles.open : styles.closed,
          preview && styles.preview,
        )}
        data-state={componentState}
        aria-busy={resolvedStatus === 'loading'}
        role={expanded ? 'dialog' : undefined}
        aria-label={expanded ? 'Search' : undefined}
      >
        <Textbox
          className={styles.searchField}
          size={expanded ? undefined : 'small'}
          type="search"
          role="combobox"
          placeholder="Search..."
          aria-label="Search media"
          aria-expanded={expanded}
          aria-controls={normalizedQuery ? resultsId : historyId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-invalid={resolvedStatus === 'error'}
          value={query}
          autoFocus={autoFocus}
          disabled={visualState === 'disabled'}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          startIcon={<SearchIcon />}
          endIcon={
            <InputStatus status={normalizedQuery ? resolvedStatus : 'idle'} />
          }
          block
        />

        {expanded && (
          <div className={styles.panelBody}>
            <SearchSidebar
              historyId={historyId}
              visibleHistory={visibleHistory}
              highlightIdx={normalizedQuery ? -1 : highlightIdx}
              genres={popularGenres}
              genresStatus={genresStatus}
              onClearHistory={handleClearHistory}
              onSearch={navigateToSearch}
            />

            <section className={clsx(styles.section, styles.results)}>
              <Eyebrow>Top results</Eyebrow>
              <SearchResults
                id={resultsId}
                query={query}
                status={resolvedStatus}
                results={suggestions}
                highlightIdx={normalizedQuery ? highlightIdx : -1}
                onOpen={openResult}
              />
            </section>
          </div>
        )}

        <span className={styles.visuallyHidden} aria-live="polite">
          {resultAnnouncement(query, resolvedStatus, suggestions.length)}
        </span>
      </Surface>
    )
  }

  const portalRoot =
    typeof document === 'undefined' ? null : document.getElementById('root')

  return (
    <>
      {!open && !preview && renderPanel(false)}
      {preview && renderPanel(true)}

      {!preview &&
        open &&
        portalRoot &&
        createPortal(
          <>
            <div className={styles.searchBackdrop} aria-hidden="true" />
            <div ref={portalRef}>{renderPanel(true, true)}</div>
          </>,
          portalRoot,
        )}
    </>
  )
}

function InputStatus({ status }: { status: SearchStatus }) {
  if (status === 'idle') return null

  return (
    <span className={styles.inputStatus} data-state={status} aria-hidden="true">
      {status === 'loading' && <span className={styles.spinner} />}
      {status === 'error' && <ErrorIcon />}
      {status === 'success' && <SuccessIcon />}
    </span>
  )
}

interface ActiveDescendantInput {
  highlightIdx: number
  historyId: string
  normalizedQuery: string
  resultsId: string
  suggestions: MediaItem[]
  visibleHistory: string[]
}

function getActiveDescendant({
  highlightIdx,
  historyId,
  normalizedQuery,
  resultsId,
  suggestions,
  visibleHistory,
}: ActiveDescendantInput): string | undefined {
  if (highlightIdx < 0) return
  if (normalizedQuery) {
    const suggestion = suggestions[highlightIdx]
    return suggestion ? `${resultsId}-${suggestion.id}` : undefined
  }
  return visibleHistory[highlightIdx]
    ? `${historyId}-${highlightIdx}`
    : undefined
}

function isSearchStatus(
  state: SearchDialogVisualState | undefined,
): state is SearchStatus {
  return state === 'loading' || state === 'error' || state === 'success'
}
