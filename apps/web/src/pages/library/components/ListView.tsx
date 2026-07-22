import MediaCard from '~/components/media-card/MediaCard'
import styles from '../Library.module.css'
import type { SortColumn, SortDir } from './libraryControls'
import type { ViewProps } from './types'

const COLUMN_COUNT = 7

type ListViewProps = ViewProps & {
  sortCol: SortColumn
  sortDir: SortDir
  onSort: (column: SortColumn) => void
}

export default function ListView({
  isLoading,
  items,
  sortCol,
  sortDir,
  onSort,
}: ListViewProps) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={`${styles.thThumb}`} />
            <SortableHeader column="title" {...{ sortCol, sortDir, onSort }}>
              Title
            </SortableHeader>
            <th>Duration</th>
            <SortableHeader column="fileSize" {...{ sortCol, sortDir, onSort }}>
              File Size
            </SortableHeader>
            <th>Release Date</th>
            <SortableHeader
              column="createdAt"
              {...{ sortCol, sortDir, onSort }}
            >
              Date Added
            </SortableHeader>
            <th className={styles.thActions}>Actions</th>
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
              <td colSpan={COLUMN_COUNT} className={styles.emptyCell}>
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
      <td colSpan={COLUMN_COUNT}>
        <div className={styles.skeletonLine ?? ''} />
      </td>
    </tr>
  )
}

type SortableHeaderProps = {
  column: SortColumn
  sortCol: SortColumn
  sortDir: SortDir
  onSort: (column: SortColumn) => void
  children: React.ReactNode
}

function SortableHeader({
  column,
  sortCol,
  sortDir,
  onSort,
  children,
}: SortableHeaderProps) {
  const isActive = column === sortCol

  return (
    <th
      aria-sort={
        isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort(column)}
      >
        {children}
        {isActive && (
          <span className={styles.sortArrow} aria-hidden="true">
            {sortDir === 'asc' ? ' ▲' : ' ▼'}
          </span>
        )}
      </button>
    </th>
  )
}
