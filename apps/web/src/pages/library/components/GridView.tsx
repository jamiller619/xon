import { Flex, Label, Select } from '@xon/ui'
import { css } from 'inline-css-modules'
import MediaCard from '~/components/media-card/MediaCard'
import libraryStyles from '../Library.module.css'
import { makeSortKey, SORT_OPTIONS } from './filters'
import SkeletonCard from './SkeletonCard'
import type { ActiveFilter, ViewProps } from './types'

const MEDIA_CATEGORIES = [
  'Movies',
  'TV Shows',
  'Clips',
  'Music',
  'Audiobooks',
  'Audio Clips',
  'Podcasts',
  'Pictures',
  'Images',
  'Textures',
  'Home Videos',
  'Games',
  'Interactive Media',
  'Documents',
  'Web Media',
  'Design Files',
  '3D Models',
  'Archives',
  'Fonts',
  'Icons',
] as const

const styles = css`
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-sm);
  }
`

type GridViewProps = ViewProps & {
  filterCategory: string
  currentSortKey: string
  activeFilters: ActiveFilter[]
  handleCategoryFilter: (category: string) => void
  handleSortOption: (sortKey: string) => void
}

export default function GridView({
  isLoading,
  items,
  pageSize,
  filterCategory,
  currentSortKey,
  activeFilters,
  handleCategoryFilter,
  handleSortOption,
}: GridViewProps) {
  return (
    <>
      <Flex gap="6">
        <div className={styles.filterGroup}>
          <Label size="small">
            Category
            <Select
              id="filter-category"
              size="small"
              className={styles.filterSelect}
              value={filterCategory}
              onChange={(e) => handleCategoryFilter(e.target.value)}
            >
              <option value="">All</option>
              {MEDIA_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>
          </Label>
        </div>

        <div className={styles.filterGroup}>
          <Label size="small">
            Sort
            <Select
              id="filter-sort"
              size="small"
              className={styles.filterSelect}
              value={currentSortKey}
              onChange={(e) => handleSortOption(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option
                  key={makeSortKey(opt.col, opt.dir)}
                  value={makeSortKey(opt.col, opt.dir)}
                >
                  {opt.label}
                </option>
              ))}
            </Select>
          </Label>
        </div>
      </Flex>

      {activeFilters.length > 0 && (
        <div className={styles.chips}>
          {activeFilters.map((f) => (
            <span key={f.key} className={styles.chip}>
              {f.label}
              <button
                type="button"
                className={styles.chipRemove}
                onClick={f.onRemove}
                aria-label={`Remove ${f.label} filter`}
              >
                ×
              </button>
            </span>
          ))}
          {activeFilters.length > 1 && (
            <button
              type="button"
              className={styles.clearAll}
              onClick={() => handleCategoryFilter('')}
            >
              Clear all
            </button>
          )}
        </div>
      )}
      <div className={styles.grid}>
        {isLoading ? (
          Array.from({ length: pageSize }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: temp
            <SkeletonCard key={i} />
          ))
        ) : items.length === 0 ? (
          <p className={libraryStyles.empty}>No media in this library yet.</p>
        ) : (
          items.map((item) => <MediaCard key={item.id} item={item} />)
        )}
      </div>
    </>
  )
}
