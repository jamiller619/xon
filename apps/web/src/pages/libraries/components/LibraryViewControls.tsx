import {
  CheckmarkSquare20Regular as SelectIcon,
  CheckmarkSquare20Filled as SelectIconFilled,
} from '@fluentui/react-icons'
import { Button, Label, Select, ToggleButton, ToggleButtonGroup } from '@xon/ui'
import FilterHeader from '~/components/FilterHeader'
import { useScanLibrary } from '~/hooks/useLibraries'
import Icons from '~/lib/icons'
import { useAppStore } from '~/store/appStore'
import { makeSortKey } from '../hooks/useLibrarySort'
import styles from '../Library.module.css'
import type {
  LibraryViewModeDefinition,
  SortDirection,
} from '../types/collectionView'

type LibraryViewControlsProps<Mode extends string, SortKey extends string> = {
  libraryId?: string
  modes: readonly LibraryViewModeDefinition<Mode, SortKey>[]
  viewMode: Mode
  sortKey: SortKey
  sortDirection: SortDirection
  primaryControls?: React.ReactNode
  filters?: React.ReactNode
  actions?: React.ReactNode
  selectionEnabled?: boolean
  onViewModeChange: (mode: Mode) => void
  onSortOptionChange: (value: string) => void
}

export default function LibraryViewControls<
  Mode extends string,
  SortKey extends string,
>({
  modes,
  libraryId,
  viewMode,
  sortKey,
  sortDirection,
  primaryControls,
  filters,
  actions,
  selectionEnabled = true,
  onViewModeChange,
  onSortOptionChange,
}: LibraryViewControlsProps<Mode, SortKey>) {
  const isSelectMode = useAppStore(({ isSelectMode }) => isSelectMode)
  const setSelectMode = useAppStore(({ setSelectMode }) => setSelectMode)
  const setSelectedItems = useAppStore(
    ({ setSelectedItems }) => setSelectedItems,
  )
  const activeMode = modes.find((mode) => mode.id === viewMode) ?? modes[0]
  const showToolbarSort = activeMode?.sortPresentation === 'toolbar'
  const scan = useScanLibrary(libraryId)

  const handleSelectModeToggle = (pressed: boolean) => {
    setSelectMode(pressed)
    setSelectedItems([])
  }

  return (
    <>
      <FilterHeader.ToolbarControls>
        {showToolbarSort && activeMode && (
          <Label size="small">
            Sort
            <Select
              className={styles.filterSelect}
              value={makeSortKey({ key: sortKey, direction: sortDirection })}
              onChange={(event) => onSortOptionChange(event.target.value)}
            >
              {activeMode.sortOptions.map((option) => (
                <option key={makeSortKey(option)} value={makeSortKey(option)}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Label>
        )}
        {primaryControls}
        {filters}
      </FilterHeader.ToolbarControls>
      <FilterHeader.ToolbarControls>
        {actions}
        {libraryId && (
          <Button
            loading={scan.isRunning}
            disabled={scan.isRunning}
            title={scan.error instanceof Error ? scan.error.message : undefined}
            onClick={() => scan.mutate()}
          >
            <Icons.Scan aria-hidden="true" />
            {scan.error
              ? 'Scan failed'
              : scan.isRunning
                ? 'Scanning library'
                : 'Scan library'}
          </Button>
        )}
        <ToggleButtonGroup value={[viewMode]}>
          {modes.map((mode) => (
            <ToggleButton
              key={mode.id}
              onClick={() => onViewModeChange(mode.id)}
              value={mode.id}
              aria-label={`${mode.label} view`}
              title={`${mode.label} view`}
            >
              {mode.icon}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {selectionEnabled && (
          <ToggleButton
            pressed={isSelectMode}
            variant="primary"
            onPressedChange={handleSelectModeToggle}
            aria-label="Select items"
          >
            {isSelectMode ? (
              <SelectIconFilled aria-hidden="true" />
            ) : (
              <SelectIcon aria-hidden="true" />
            )}
          </ToggleButton>
        )}
      </FilterHeader.ToolbarControls>
    </>
  )
}
