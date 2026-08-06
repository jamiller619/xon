import { DocumentEdit16Regular as EditIcon } from '@fluentui/react-icons'
import { Button, Flex } from '@xon/ui'
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
    /* display: flex; */
    /* align-items: baseline; */
    /* gap: var(--space-md); */
    /* min-width: 0; */
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

      &:not(:first-child)::before {
        margin-right: var(--space-sm);
        color: var(--color-gray-8);
        content: '·';
      }
    }
  }

  .toolbar {
    display: flex;
    align-items: end;
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
        {/* <Button.Icon title="Edit library">
          <EditIcon />
        </Button.Icon> */}
        <div className={styles.stats}>
          {stats?.length ? (
            stats.map((stat) => (
              <span key={stat} title={stat}>
                {stat}
              </span>
            ))
          ) : (
            <i>Failed to load stats</i>
          )}
        </div>
      </div>
      <div className={styles.toolbar}>{children}</div>
    </header>
  )
}

FilterHeader.ToolbarControls = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <Flex gap="4" align="end">
      {children}
    </Flex>
  )
}
