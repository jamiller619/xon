import { Delete16Regular as DeleteIcon } from '@fluentui/react-icons'
import { Badge, Button, Flex } from '@xon/ui'
import { css } from 'inline-css-modules'
import Page from '~/pages/Page'
import { useAppStore } from '~/store/appStore'

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

  .dataContainer {
    font-size: var(--text-sm);
    color: var(--color-text);

    span {
      color: var(--color-text-muted);
    }
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
  const isSelectMode = useAppStore(({ isSelectMode }) => isSelectMode)
  const selectedItemCount = useAppStore(
    ({ selectedItems }) => selectedItems.length,
  )

  return (
    <header className={styles.header}>
      <Flex justify="between">
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
        <Flex align="end" className={styles.dataContainer}>
          {isSelectMode && (
            <Flex align="center" gap="4">
              <Flex align="center" gap="2">
                <span>Selected:</span>
                <Badge size="small" variant="primary">
                  {selectedItemCount}
                </Badge>
              </Flex>
              <Button.Icon>
                <DeleteIcon />
              </Button.Icon>
            </Flex>
          )}
        </Flex>
      </Flex>
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
