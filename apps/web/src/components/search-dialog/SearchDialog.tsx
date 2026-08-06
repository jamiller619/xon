import { Search20Filled as SearchIcon } from '@fluentui/react-icons'
import { Textbox } from '@xon/ui'
import { css } from 'inline-css-modules'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '~/lib/apiFetch'

const styles = css`
  .searchWrapper {
    flex: 1;
    max-width: 480px;
    position: relative;

    input {
      width: stretch;

      &:focus {
        background: var(--color-gray-3);
      }
    }

    /* input {
      border-radius: 112px;
      corner-shape: round;
      width: stretch;
    } */
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--color-gray-4);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    overflow: hidden;
    max-height: 360px;
    overflow-y: auto;
  }

  .dropdownLabel {
    padding: 8px 14px 4px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-gray-10);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .dropdownItem {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: none;
    color: var(--color-gray-12);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .dropdownItem:hover,
  .dropdownItemActive {
    background: var(--color-gray-5);
    color: #e0e0f0;
  }
`

interface SuggestionItem {
  id: string
  title: string | null
  mediaCategory: string | null
  thumbnailUrls: { small: string; medium: string; large: string } | null
}

const DEBOUNCE_MS = 300
const HISTORY_KEY = 'xon:searchHistory'
const MAX_HISTORY = 10

export default function SearchDialog() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [history, setHistory] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const fetchSuggestions = useCallback((q: string) => {
    if (!q.trim()) {
      setSuggestions([])
      return
    }
    apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        setSuggestions((data as { results: SuggestionItem[] }).results ?? [])
      })
      .catch(() => setSuggestions([]))
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setHighlightIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim()) {
      debounceRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS)
    } else {
      setSuggestions([])
    }
    setOpen(true)
  }

  function handleFocus() {
    setHistory(loadHistory())
    setOpen(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const items =
      suggestions.length > 0 ? suggestions.map((s) => s.title ?? s.id) : history
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && items[highlightIdx]) {
        navigate2search(items[highlightIdx])
      } else {
        navigate2search(query)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function navigate2search(q: string) {
    if (!q.trim()) return
    saveHistory(q.trim())
    setHistory(loadHistory())
    setOpen(false)
    setQuery('')
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  function removeHistoryItem(e: React.MouseEvent, item: string) {
    e.stopPropagation()
    const next = loadHistory().filter((h) => h !== item)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    setHistory(next)
  }

  const showHistory = open && !query.trim() && history.length > 0
  const showSuggestions = open && query.trim().length > 0

  return (
    <div className={styles.searchWrapper}>
      <Textbox
        size="small"
        type="search"
        placeholder="Search media..."
        aria-label="Search"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        startIcon={<SearchIcon />}
      />
      {(showHistory || showSuggestions) && (
        <div className={styles.dropdown}>
          {showHistory && (
            <>
              <div className={styles.dropdownLabel}>Recent searches</div>
              {history.map((item, i) => (
                <div
                  key={item}
                  // aria-selected={i === highlightIdx}
                  className={`${styles.dropdownItem} ${i === highlightIdx ? styles.dropdownItemActive : ''}`}
                  // onKeyDown={() => navigate2search(item)}
                >
                  <span className={styles.historyIcon}>↵</span>
                  <span className={styles.dropdownItemText}>{item}</span>
                  <button
                    type="button"
                    className={styles.removeHistory}
                    onClick={(e) => removeHistoryItem(e, item)}
                    aria-label={`Remove ${item} from history`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function saveHistory(query: string) {
  const prev = loadHistory().filter((h) => h !== query)
  const next = [query, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
