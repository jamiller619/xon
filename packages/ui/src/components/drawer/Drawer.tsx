import { Drawer as UIDrawer } from '@base-ui/react'
import { Dismiss20Regular as CloseIcon } from '@fluentui/react-icons'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import Button from '../button/Button.js'
import Surface from '../surface/Surface.js'
import styles from './Drawer.module.css'

export type DrawerProps = Omit<
  UIDrawer.Root.Props,
  'children' | 'swipeDirection'
> & {
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  side?: 'left' | 'right'
  className?: string | undefined
  contentClassName?: string | undefined
}

/**
 * A modal surface that enters from either side of the viewport. The panel is
 * full-screen on small viewports and supports pointer/touch swipe dismissal.
 */
export default function Drawer({
  title,
  description,
  children,
  side = 'right',
  className,
  contentClassName,
  ...props
}: DrawerProps) {
  return (
    <UIDrawer.Root swipeDirection={side} {...props}>
      <UIDrawer.Portal>
        <UIDrawer.Backdrop className={styles.backdrop} />
        <UIDrawer.Viewport className={styles.viewport} data-side={side}>
          <UIDrawer.Popup className={clsx(styles.popup, className)}>
            <Surface className={styles.surface} borderRadius="none">
              <header className={styles.header}>
                <UIDrawer.Close
                  render={(closeProps) => (
                    <Button.Icon
                      {...closeProps}
                      aria-label="Close drawer"
                      variant="ghost"
                    >
                      <CloseIcon />
                    </Button.Icon>
                  )}
                />
                <div className={styles.heading}>
                  <UIDrawer.Title className={styles.title}>
                    {title}
                  </UIDrawer.Title>
                  {description != null && (
                    <UIDrawer.Description className={styles.description}>
                      {description}
                    </UIDrawer.Description>
                  )}
                </div>
              </header>
              <UIDrawer.Content
                className={clsx(styles.content, contentClassName)}
              >
                {children}
              </UIDrawer.Content>
            </Surface>
          </UIDrawer.Popup>
        </UIDrawer.Viewport>
      </UIDrawer.Portal>
    </UIDrawer.Root>
  )
}
