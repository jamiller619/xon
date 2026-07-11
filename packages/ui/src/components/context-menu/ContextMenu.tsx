import { ContextMenu as UIContextMenu } from '@base-ui/react'
import { ChevronRightRegular } from '@fluentui/react-icons'
import { css } from 'inline-css-modules'
import type { MouseEventHandler, ReactNode } from 'react'

export type ContextMenuItem = {
  label: ReactNode
  onClick?: MouseEventHandler | undefined
  /** Nested items render as a submenu. */
  children?: ContextMenuItem[] | undefined
  disabled?: boolean | undefined
}

export type ContextMenuItems = (ContextMenuItem | 'separator')[]

export type ContextMenuProps = Omit<UIContextMenu.Root.Props, 'children'> & {
  items: ContextMenuItems
  /** Class applied to the trigger element wrapping `children`. */
  className?: string | undefined
  /** The right-clickable (or long-pressable) area that opens the menu. */
  children: ReactNode
}

/*
 * The popup mirrors the customizable-select picker in Select.module.css so
 * menus and select dropdowns read as the same control family.
 */
const styles = css<
  'positioner' | 'popup' | 'item' | 'submenuChevron' | 'separator'
> /*css*/`
  .positioner {
    outline: none;
  }

  .popup {
    min-width: 160px;
    background: var(--color-gray-3);
    border: 1px solid var(--color-gray-5);
    border-radius: var(--border-radius-2);
    corner-shape: var(--corner-shape);
    box-shadow: var(--shadow-4);
    padding: var(--space-2);
    color: var(--color-text);

    transform-origin: var(--transform-origin);
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;

    &[data-starting-style],
    &[data-ending-style] {
      opacity: 0;
      transform: scale(0.95);
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--border-radius-1);
    corner-shape: var(--corner-shape);
    font-size: var(--font-size-2);
    cursor: pointer;
    user-select: none;
    outline: none;

    &[data-highlighted] {
      background: var(--color-gray-5);
    }

    &[data-disabled] {
      color: var(--color-gray-8);
      cursor: not-allowed;
    }
  }

  .submenuChevron {
    margin-left: auto;
    width: 1em;
    height: 1em;
    color: var(--color-gray-11);
  }

  .separator {
    height: 1px;
    background: var(--color-gray-5);
    margin: var(--space-2) var(--space-3);
  }
`

/**
 * A right-click menu anchored to the pointer. Children are the surface that
 * opens it; the menu itself is described by `items`:
 *
 *   <ContextMenu
 *     items={[
 *       { label: 'Play', onClick: play },
 *       {
 *         label: 'Add to playlist',
 *         children: [{ label: 'Favorites', onClick: addToFavorites }],
 *       },
 *       'separator',
 *       { label: 'Delete', onClick: remove },
 *     ]}
 *   >
 *     <MediaItem />
 *   </ContextMenu>
 */
export default function ContextMenu({
  items,
  className,
  children,
  ...props
}: ContextMenuProps) {
  return (
    <UIContextMenu.Root {...props}>
      <UIContextMenu.Trigger className={className}>
        {children}
      </UIContextMenu.Trigger>
      <MenuPopup items={items} />
    </UIContextMenu.Root>
  )
}

/**
 * Keys items by their label (menu items are identified by what they say), and
 * disambiguates separators and repeated/non-string labels with a counter.
 */
function keyed(items: ContextMenuItems) {
  const seen = new Map<string, number>()

  return items.map((item) => {
    const label =
      item === 'separator'
        ? 'separator'
        : typeof item.label === 'string'
          ? item.label
          : 'item'
    const n = seen.get(label) ?? 0

    seen.set(label, n + 1)

    return { key: n === 0 ? label : `${label}-${n}`, item }
  })
}

function MenuPopup({ items }: { items: ContextMenuItems }) {
  return (
    <UIContextMenu.Portal>
      <UIContextMenu.Positioner className={styles.positioner}>
        <UIContextMenu.Popup className={styles.popup}>
          {keyed(items).map(({ key, item }) =>
            item === 'separator' ? (
              <UIContextMenu.Separator key={key} className={styles.separator} />
            ) : item.children != null ? (
              <UIContextMenu.SubmenuRoot key={key}>
                <UIContextMenu.SubmenuTrigger
                  className={styles.item}
                  disabled={item.disabled ?? false}
                >
                  {item.label}
                  <ChevronRightRegular className={styles.submenuChevron} />
                </UIContextMenu.SubmenuTrigger>
                <MenuPopup items={item.children} />
              </UIContextMenu.SubmenuRoot>
            ) : (
              <UIContextMenu.Item
                key={key}
                className={styles.item}
                onClick={item.onClick}
                disabled={item.disabled ?? false}
              >
                {item.label}
              </UIContextMenu.Item>
            ),
          )}
        </UIContextMenu.Popup>
      </UIContextMenu.Positioner>
    </UIContextMenu.Portal>
  )
}
