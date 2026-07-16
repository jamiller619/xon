import { Menu as UIMenu } from '@base-ui/react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import {
  type MenuItems,
  MenuPopup,
  type MenuPositionProps,
} from './MenuPopup.jsx'

export type MenuProps = Omit<UIMenu.Root.Props, 'children'> &
  MenuPositionProps & {
    items: MenuItems
    /** Class applied to the trigger element. */
    className?: string | undefined
    /** The element that opens the menu on click, typically a Button. */
    children: ReactNode
  }

/**
 * A click-opened dropdown menu. Children are the trigger; the menu itself is
 * described by `items`, same as ContextMenu:
 *
 *   <Menu
 *     items={[
 *       { label: 'Rename', onClick: rename },
 *       {
 *         label: 'Sort by',
 *         children: [{ label: 'Name', onClick: sortByName }],
 *       },
 *       'separator',
 *       { label: 'Delete', onClick: remove },
 *     ]}
 *   >
 *     <Button.Icon><MoreHorizontalRegular /></Button.Icon>
 *   </Menu>
 *
 * When children is a single element, Base UI merges the trigger's behavior
 * onto it (no extra DOM node); otherwise children render inside a plain
 * unstyled `<button>` trigger.
 */
export default function Menu({
  items,
  className,
  children,
  align,
  alignOffset,
  side,
  sideOffset,
  ...props
}: MenuProps) {
  return (
    <UIMenu.Root {...props}>
      {isValidElement(children) ? (
        <UIMenu.Trigger
          className={className}
          render={children as ReactElement<Record<string, unknown>>}
        />
      ) : (
        <UIMenu.Trigger className={className}>{children}</UIMenu.Trigger>
      )}
      <MenuPopup
        items={items}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      />
    </UIMenu.Root>
  )
}
