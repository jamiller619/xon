import {
  Navigation20Regular as MenuIcon,
  Search20Filled as SearchIcon,
  SignOutRegular as SignOutIcon,
  PersonCircle16Regular as UserIcon,
} from '@fluentui/react-icons'
import { Button, Menu, Surface, Textbox } from '@xon/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiUrl } from '~/lib/apiFetch'
import authClient from '~/lib/authClient'
import styles from './TopBar.module.css'

const HISTORY_KEY = 'xon:searchHistory'
const MAX_HISTORY = 10
const DEBOUNCE_MS = 300

interface SuggestionItem {
  id: string
  title: string | null
  mediaCategory: string | null
  thumbnailUrls: { small: string; medium: string; large: string } | null
}

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveHistory(query: string) {
  const prev = loadHistory().filter((h) => h !== query)
  const next = [query, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

type TopBarProps = {
  onMenuClick?: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { data: authData } = authClient.useSession()

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

  function navigate2search(q: string) {
    if (!q.trim()) return
    saveHistory(q.trim())
    setHistory(loadHistory())
    setOpen(false)
    setQuery('')
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
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

  function removeHistoryItem(e: React.MouseEvent, item: string) {
    e.stopPropagation()
    const next = loadHistory().filter((h) => h !== item)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    setHistory(next)
  }

  const showHistory = open && !query.trim() && history.length > 0
  const showSuggestions = open && query.trim().length > 0

  return (
    <Surface as="header" borderRadius="none" className={styles.header}>
      <Button.Icon onClick={onMenuClick}>
        <MenuIcon />
      </Button.Icon>
      <div className={styles.searchWrapper} ref={wrapperRef}>
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
            {showSuggestions && suggestions.length > 0 && (
              <>
                <div className={styles.dropdownLabel}>Suggestions</div>
                {suggestions.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    // aria-selected={i === highlightIdx}
                    className={`${styles.dropdownItem} ${i === highlightIdx ? styles.dropdownItemActive : ''}`}
                    onClick={() => navigate2search(item.title ?? item.id)}
                  >
                    {item.thumbnailUrls ? (
                      <img
                        className={styles.suggestionThumb}
                        src={apiUrl(item.thumbnailUrls.small)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.suggestionThumbPlaceholder} />
                    )}
                    <span className={styles.dropdownItemText}>
                      <span className={styles.suggestionTitle}>
                        {item.title ?? item.id}
                      </span>
                      {item.mediaCategory && (
                        <span className={styles.suggestionCategory}>
                          {item.mediaCategory}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </>
            )}
            {showSuggestions && suggestions.length === 0 && (
              <div className={styles.dropdownEmpty}>No suggestions</div>
            )}
          </div>
        )}
      </div>
      <Menu
        items={[
          {
            label: 'Sign out',
            icon: <SignOutIcon />,
          },
          {
            label: 'View account',
            icon: <UserIcon />,
          },
        ]}
        align="end"
      >
        <Button aria-label="User menu">
          <span className={styles.avatar}>
            {authData?.user.name.charAt(0).toUpperCase()}
          </span>
          <span>{authData?.user.name}</span>
        </Button>
      </Menu>
    </Surface>
  )
}
