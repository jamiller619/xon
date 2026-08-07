import {
  CheckmarkCircle24Filled as SelectBoxCheckedIcon,
  Circle24Regular as SelectBoxIcon,
} from '@fluentui/react-icons'
import type { MediaItem } from '@xon/shared'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { useAppStore } from '~/store/appStore'

const styles = css`
  .selectContainer {
    position: relative;
    padding-block-start: var(--space-xs);

    .selectBox {
      position: absolute;
      top: 0;
      left: calc(0px - var(--space-xs));
      z-index: 1;
      color: var(--color-accent-9);
      background: var(--color-gray-2);
      border-radius: 1000px;
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  .selected {
    a {
      img {
        filter: none !important;
      }

      div:first-child {
        outline: 3px solid var(--color-accent-9);
        outline-offset: -3px;
      }

      &:hover {
        div:first-child {
          transform: none;
        }
      }
    }
  }
`

type SelectWrapperProps = {
  id: string
  children: (
    onOpen: ((item: MediaItem, event?: React.MouseEvent) => void) | undefined,
  ) => React.ReactNode
}

export default function SelectWrapper({ id, children }: SelectWrapperProps) {
  const isSelectMode = useAppStore(({ isSelectMode }) => isSelectMode)
  const selectedItems = useAppStore(({ selectedItems }) => selectedItems)
  const setSelectedItems = useAppStore(
    ({ setSelectedItems }) => setSelectedItems,
  )
  const isSelected = selectedItems.includes(id)

  function handleSelect(_: MediaItem, event?: React.MouseEvent) {
    event?.preventDefault()

    setSelectedItems(
      isSelected
        ? selectedItems.filter((selectedItem) => selectedItem !== id)
        : [...selectedItems, id],
    )
  }

  return (
    <div
      className={clsx(styles.selectContainer, {
        [styles.selected as string]: isSelectMode && isSelected,
      })}
    >
      {isSelectMode && (
        <div className={styles.selectBox} aria-hidden="true">
          {isSelected ? <SelectBoxCheckedIcon /> : <SelectBoxIcon />}
        </div>
      )}
      {children(isSelectMode ? handleSelect : undefined)}
    </div>
  )
}
