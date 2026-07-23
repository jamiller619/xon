import {
  Grid16Regular as GridIcon,
  List16Regular as ListIcon,
  ArrowSync16Regular as RefreshIcon,
} from '@fluentui/react-icons'
import { MediaType } from '@xon/shared'
import {
  Button,
  Label,
  Select,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
} from '@xon/ui'
import styles from '../Library.module.css'
import { makeSortKey, SORT_OPTIONS } from './libraryControls'

type ViewMode = 'grid' | 'list'

const MEDIA_TYPE_OPTIONS: ReadonlyArray<{
  label: string
  value: MediaType.MainType
}> = [
  { label: 'Video', value: MediaType.MainType.Video },
  { label: 'Audio', value: MediaType.MainType.Audio },
  { label: 'Images', value: MediaType.MainType.Image },
  { label: 'Applications', value: MediaType.MainType.Application },
  { label: 'Text', value: MediaType.MainType.Text },
  { label: 'Fonts', value: MediaType.MainType.Font },
  { label: '3D Models', value: MediaType.MainType.Model },
]

type LibraryToolbarProps = {
  viewMode: ViewMode
  currentSortKey: string
  mediaType: string
  unmatchedOnly: boolean
  isRefreshingMetadata: boolean
  onViewModeChange: (viewMode: ViewMode) => void
  onSortOptionChange: (sortKey: string) => void
  onMediaTypeChange: (mediaType: string) => void
  onUnmatchedOnlyChange: (unmatchedOnly: boolean) => void
  onRefreshMetadata: () => void
}

export default function LibraryToolbar({
  viewMode,
  currentSortKey,
  mediaType,
  unmatchedOnly,
  isRefreshingMetadata,
  onViewModeChange,
  onSortOptionChange,
  onMediaTypeChange,
  onUnmatchedOnlyChange,
  onRefreshMetadata,
}: LibraryToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        <Label size="small">
          Type
          <Select
            size="small"
            className={styles.filterSelect}
            value={mediaType}
            onChange={(event) => onMediaTypeChange(event.target.value)}
          >
            <option value="">All</option>
            {MEDIA_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Label>

        <Label size="small">
          Sort
          <Select
            size="small"
            className={styles.filterSelect}
            value={currentSortKey}
            onChange={(event) => onSortOptionChange(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option
                key={makeSortKey(option.col, option.dir)}
                value={makeSortKey(option.col, option.dir)}
              >
                {option.label}
              </option>
            ))}
          </Select>
        </Label>

        <Switch
          className={styles.unmatchedFilter}
          label="Unmatched titles"
          checked={unmatchedOnly}
          onChange={onUnmatchedOnlyChange}
        />

        {mediaType && (
          <span className={styles.filterChip}>
            Type: {mediaType}
            <button
              type="button"
              onClick={() => onMediaTypeChange('')}
              aria-label={`Remove ${mediaType} type filter`}
            >
              ×
            </button>
          </span>
        )}
      </div>

      <div className={styles.toolbarActions}>
        <Button
          loading={isRefreshingMetadata}
          disabled={isRefreshingMetadata}
          onClick={onRefreshMetadata}
        >
          <RefreshIcon />
          {isRefreshingMetadata ? 'Refreshing metadata' : 'Refresh metadata'}
        </Button>
        <ToggleButtonGroup value={[viewMode]}>
          <ToggleButton
            onClick={() => onViewModeChange('grid')}
            value="grid"
            aria-label="Grid view"
            title="Grid view"
          >
            <GridIcon />
          </ToggleButton>
          <ToggleButton
            onClick={() => onViewModeChange('list')}
            value="list"
            aria-label="List view"
            title="List view"
          >
            <ListIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
    </div>
  )
}
