import { css } from 'inline-css-modules'
import MediaCard from '~/components/media-card/MediaCard'
import libraryStyles from '../Library.module.css'
import SkeletonCard from './SkeletonCard'
import type { ViewProps } from './types'

const styles = css`
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-sm);
  }
`

export default function GridView({ isLoading, items, pageSize }: ViewProps) {
  return (
    <div className={styles.grid}>
      {isLoading ? (
        Array.from({ length: pageSize }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
          <SkeletonCard key={i} />
        ))
      ) : items.length === 0 ? (
        <p className={libraryStyles.empty}>No media in this library yet.</p>
      ) : (
        items.map((item) => <MediaCard key={item.id} item={item} />)
      )}
    </div>
  )
}
