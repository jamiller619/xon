import { useState } from 'react'

const HISTORY_KEY = 'xon:searchHistory'
const MAX_HISTORY = 10
const DISPLAY_HISTORY = 6

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([])

  function refreshHistory() {
    setHistory(loadHistory())
  }

  function saveQuery(query: string) {
    if (!query) return
    const previous = loadHistory().filter((item) => item !== query)
    const next = [query, ...previous].slice(0, MAX_HISTORY)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    setHistory(next)
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
  }

  return {
    clearHistory,
    refreshHistory,
    saveQuery,
    visibleHistory: history.slice(0, DISPLAY_HISTORY),
  }
}

function loadHistory(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}
