import clsx from 'clsx'
import { css } from 'inline-css-modules'
import Page from '~/pages/Page'

const styles = css`
  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
    background: var(--color-gray-1);
    padding-block-end: var(--space-md);
    margin-bottom: calc(-1 * var(--space-md));
  }

  .titleContainer {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    min-width: 0;
  }

  .stats {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    min-width: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);

    span {
      flex: none;
      white-space: nowrap;
      overflow: hidden;
      /* flex: 1 1 auto; */
      text-overflow: ellipsis;

      & + span::before {
        margin-right: var(--space-sm);
        color: var(--color-gray-8);
        content: "·";
      }
    }
  }

  .toolbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-md);
  }
`

type FilterHeaderProps = {
  title: string
  stats?: string[]
  children?: React.ReactNode
}

export default function FilterHeader({
  title,
  stats,
  children,
}: FilterHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleContainer}>
        <Page.Title>{title}</Page.Title>
        <div className={styles.stats}>
          {stats?.length &&
            stats.map((stat) => (
              <span key={stat} title={stat}>
                {stat}
              </span>
            ))}
        </div>
      </div>
      <div className={styles.toolbar}>{children}</div>
      {/* <LibraryToolbar
        viewMode={viewMode}
        currentSortKey={controls.currentSortKey}
        mediaType={controls.mediaType}
        unmatchedOnly={controls.unmatchedOnly}
        isRefreshingMetadata={metadataRefresh.isRefreshing}
        onViewModeChange={setViewMode}
        onSortOptionChange={controls.handleSortOption}
        onMediaTypeChange={controls.setMediaType}
        onUnmatchedOnlyChange={controls.setUnmatchedOnly}
        onRefreshMetadata={metadataRefresh.refresh}
      /> */}
    </header>
  )
}

type ToolbarControlProps = {
  dir?: 'start' | 'end'
  children: React.ReactNode
}

FilterHeader.ToolbarControl = ({
  children,
  dir = 'start',
}: ToolbarControlProps) => {
  return (
    <div className={clsx(styles.toolbar, { [styles[dir] as string]: dir })}>
      {children}
    </div>
  )
}
