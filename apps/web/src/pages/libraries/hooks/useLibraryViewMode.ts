import { useState } from 'react'

const STORAGE_KEY_PREFIX = 'xon:libraryViewMode:'

type ModeDefinition<Mode extends string> = {
  id: Mode
}

function storedMode<Mode extends string>(
  libraryId: string,
  modes: readonly ModeDefinition<Mode>[],
  defaultMode: Mode,
): Mode {
  if (typeof localStorage === 'undefined') return defaultMode

  const value = localStorage.getItem(`${STORAGE_KEY_PREFIX}${libraryId}`)
  return modes.some((mode) => mode.id === value) ? (value as Mode) : defaultMode
}

export function useLibraryViewMode<Mode extends string>(
  libraryId: string,
  modes: readonly ModeDefinition<Mode>[],
  defaultMode: Mode,
) {
  const [selection, setSelection] = useState<{
    libraryId: string
    mode: Mode
  }>(() => ({
    libraryId,
    mode: storedMode(libraryId, modes, defaultMode),
  }))

  const viewMode =
    selection.libraryId === libraryId &&
    modes.some((mode) => mode.id === selection.mode)
      ? selection.mode
      : storedMode(libraryId, modes, defaultMode)

  function setViewMode(mode: Mode) {
    if (!modes.some((definition) => definition.id === mode)) return
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${libraryId}`, mode)
    }
    setSelection({ libraryId, mode })
  }

  return { viewMode, setViewMode }
}
