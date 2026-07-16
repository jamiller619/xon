import { ContextMenu as UIContextMenu } from '@base-ui/react'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'
import {
  type MenuItem,
  type MenuItems,
  MenuPopup,
} from '../menu/MenuPopup.jsx'

export type ContextMenuItem = MenuItem

export type ContextMenuItems = MenuItems

export type ContextMenuProps = Omit<UIContextMenu.Root.Props, 'children'> & {
  items: ContextMenuItems
  /** Class applied to the trigger element wrapping `children`. */
  className?: string | undefined
  /** The right-clickable (or long-pressable) area that opens the menu. */
  children: ReactNode
}

const styles = css<'trigger'> /*css*/`
  /* The trigger is a wrapper div; display: contents keeps it out of layout so
     children size themselves as if they weren't wrapped (flex/grid children,
     container queries, etc. all still see the original parent). */
  .trigger {
    display: contents;
  }
`

/**
 * A right-click menu anchored to the pointer. Children are the surface that
 * opens it; the menu itself is described by `items` (the popup is MenuPopup,
 * shared with Menu):
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
      <UIContextMenu.Trigger className={clsx(styles.trigger, className)}>
        {children}
      </UIContextMenu.Trigger>
      <MenuPopup items={items} />
    </UIContextMenu.Root>
  )
}
