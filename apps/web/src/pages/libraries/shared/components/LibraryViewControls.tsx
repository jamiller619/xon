import {
  FolderSearch16Regular as ScanIcon,
  CheckmarkCircleHint16Regular as SelectIcon,
} from '@fluentui/react-icons'
import { useMutation } from '@tanstack/react-query'
import { Button, Label, Select, ToggleButton, ToggleButtonGroup } from '@xon/ui'
import FilterHeader from '~/components/FilterHeader'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import { useAppStore } from '~/store/appStore'
import { useScanStore } from '~/store/scanStore'
import styles from '../../Library.module.css'
import { makeSortKey } from '../hooks/useLibrarySort'
import type {
  LibraryViewModeDefinition,
  SortDirection,
} from '../types/collectionView'

type LibraryViewControlsProps<Mode extends string, SortKey extends string> = {
  libraryId: string
  modes: readonly LibraryViewModeDefinition<Mode, SortKey>[]
  viewMode: Mode
  sortKey: SortKey
  sortDirection: SortDirection
  filters?: React.ReactNode
  actions?: React.ReactNode
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
  filters,
  actions,
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
  const scanRunning = useScanStore(
    (state) => state.scans[libraryId]?.status === 'running',
  )
  const applyScanStarted = useScanStore((state) => state.applyStarted)
  const removeScan = useScanStore((state) => state.remove)
  const scan = useMutation({
    onMutate: () => applyScanStarted(libraryId),
    mutationFn: async () => {
      const response = await apiFetch(`/api/libraries/${libraryId}/scan`, {
        method: 'POST',
      })
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as {
          status?: string
        } | null
        if (body?.status === 'already_running') return
      }
      if (!response.ok) {
        throw new Error(await getAPIError(response, 'Could not scan library'))
      }
    },
    onError: () => removeScan(libraryId),
  })
  const scanning = scan.isPending || scanRunning

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
        {filters}
      </FilterHeader.ToolbarControls>
      <FilterHeader.ToolbarControls>
        {actions}
        <Button
          loading={scanning}
          disabled={scanning}
          title={scan.error instanceof Error ? scan.error.message : undefined}
          onClick={() => scan.mutate()}
        >
          <ScanIcon aria-hidden="true" />
          {scan.error
            ? 'Scan failed'
            : scanning
              ? 'Scanning library'
              : 'Scan library'}
        </Button>
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
        <ToggleButton
          pressed={isSelectMode}
          variant="primary"
          onPressedChange={handleSelectModeToggle}
          aria-label="Select items"
        >
          <SelectIcon aria-hidden="true" />
        </ToggleButton>
      </FilterHeader.ToolbarControls>
    </>
  )
}
