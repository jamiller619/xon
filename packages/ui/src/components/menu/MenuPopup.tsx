import { Menu as UIMenu } from '@base-ui/react'
import { ChevronRightRegular } from '@fluentui/react-icons'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { MouseEventHandler, ReactNode } from 'react'

export type MenuItem = {
  label: ReactNode
  icon?: ReactNode
  onClick?: MouseEventHandler | undefined
  /** Nested items render as a submenu. */
  children?: MenuItem[] | undefined
  disabled?: boolean | undefined
}

export type MenuItems = (MenuItem | 'separator')[]

/*
 * Shared by Menu and ContextMenu: Base UI's ContextMenu re-exports Menu's
 * Portal/Positioner/Popup/Item parts, so this popup works under either Root.
 * The look comes from the --menu-* tokens in theme/variables.css, which the
 * customizable-select picker in Select.module.css also consumes.
 */
const styles = css<
  'positioner' | 'popup' | 'item' | 'submenuChevron' | 'separator' | 'icon'
> /*css*/`
  .positioner {
    outline: none;
  }

  .popup {
    min-width: 240px;
    background: var(--menu-bg);
    border: var(--menu-border);
    border-radius: var(--menu-border-radius);
    corner-shape: var(--corner-shape);
    box-shadow: var(--menu-shadow);
    padding: var(--menu-padding);
    color: var(--color-text);

    transition:
      opacity var(--menu-transition),
      transform var(--menu-transition);

    &[data-starting-style],
    &[data-ending-style] {
      opacity: 0;
      transform: translateY(calc(-1 * var(--space-2xs)));
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--menu-item-gap);
    padding: var(--menu-item-padding);
    border-radius: var(--menu-item-border-radius);
    corner-shape: var(--corner-shape);
    font-size: var(--menu-item-font-size);
    cursor: pointer;
    user-select: none;
    outline: none;

    &[data-highlighted] {
      background: var(--menu-item-highlight);
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
    margin: var(--space-2xs) var(--space-xs);
  }

  .icon {
    width: 16px;
    height: 16px;
  }
`

/**
 * Keys items by their label (menu items are identified by what they say), and
 * disambiguates separators and repeated/non-string labels with a counter.
 */
function keyed(items: MenuItems) {
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

/** Anchor-positioning props forwarded to the popup's Positioner. */
export type MenuPositionProps = Pick<
  UIMenu.Positioner.Props,
  'align' | 'alignOffset' | 'side' | 'sideOffset'
>

export function MenuPopup({
  className,
  items,
  ...position
}: { items: MenuItems } & MenuPositionProps & UIMenu.Positioner.Props) {
  return (
    <UIMenu.Portal>
      <UIMenu.Positioner className={styles.positioner} {...position}>
        <UIMenu.Popup className={clsx(styles.popup, className)}>
          {keyed(items).map(({ key, item }) =>
            item === 'separator' ? (
              <UIMenu.Separator key={key} className={styles.separator} />
            ) : item.children != null ? (
              <UIMenu.SubmenuRoot key={key}>
                <UIMenu.SubmenuTrigger
                  className={styles.item}
                  disabled={item.disabled ?? false}
                >
                  {item.label}
                  <ChevronRightRegular className={styles.submenuChevron} />
                </UIMenu.SubmenuTrigger>
                <MenuPopup items={item.children} />
              </UIMenu.SubmenuRoot>
            ) : (
              <UIMenu.Item
                key={key}
                className={styles.item}
                onClick={item.onClick}
                disabled={item.disabled ?? false}
              >
                <span className={styles.icon}>{item.icon}</span>
                {item.label}
              </UIMenu.Item>
            ),
          )}
        </UIMenu.Popup>
      </UIMenu.Positioner>
    </UIMenu.Portal>
  )
}
