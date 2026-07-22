import MediaCard from '~/components/media-card/MediaCard'
import styles from '../Library.module.css'
import { type SortColumn, useFilters } from './filters'
import type { ViewProps } from './types'

export default function ListView({ isLoading, items }: ViewProps) {
  const { handleSort, sortCol, sortDir } = useFilters()

  function sortIndicator(col: SortColumn) {
    if (col !== sortCol) return null
    return (
      <span className={styles.sortArrow ?? ''}>
        {sortDir === 'asc' ? ' ▲' : ' ▼'}
      </span>
    )
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={`${styles.thThumb}`} />
            <th
              className={`${styles.thSortable}`}
              onClick={() => handleSort('title')}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') && handleSort('title')
              }
            >
              Title{sortIndicator('title')}
            </th>
            <th>Duration{sortIndicator('duration')}</th>
            {/* <th
              className={`${styles.th} ${styles.thSortable}`}
              onClick={() => handleSort('mediaCategory')}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') &&
                handleSort('mediaCategory')
              }
            >
              Category{sortIndicator('mediaCategory')}
            </th> */}
            <th
              className={`${styles.thSortable}`}
              onClick={() => handleSort('fileSize')}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') && handleSort('fileSize')
              }
            >
              File Size{sortIndicator('fileSize')}
            </th>
            <th>Release Date{sortIndicator('releaseDate')}</th>
            <th
              className={`${styles.thSortable}`}
              onClick={() => handleSort('createdAt')}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') && handleSort('createdAt')
              }
            >
              Date Added{sortIndicator('createdAt')}
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <SkeletonRow key={i} />
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.emptyCell}>
                No media in this library yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <MediaCard key={item.id} item={item} listView />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className={styles.skeletonRow ?? ''}>
      <td colSpan={5}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}
