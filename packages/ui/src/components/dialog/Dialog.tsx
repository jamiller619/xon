import { Dialog as UIDialog } from '@base-ui/react'
import { Dismiss16Regular as CloseIcon } from '@fluentui/react-icons'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Button, type ButtonProps, Flex } from '../../index.js'
import styles from './Dialog.module.css'

type DialogProps = Omit<UIDialog.Root.Props, 'children'> & {
  /** Renders a trigger button. Omit when controlling the dialog via `open`. */
  triggerText?: string
  title: string
  description?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  buttonProps?: ButtonProps
  showCloseButton?: boolean
  backdropClassName?: string | undefined
  popupClassName?: string | undefined
  headerClassName?: string | undefined
}

export default function Dialog({
  triggerText,
  title,
  description,
  headerActions,
  children,
  buttonProps,
  showCloseButton = true,
  backdropClassName,
  popupClassName,
  headerClassName,
  ...props
}: DialogProps) {
  return (
    <UIDialog.Root {...props}>
      {triggerText != null && (
        <UIDialog.Trigger
          render={(props) => <Button {...buttonProps} {...props} />}
        >
          {triggerText}
        </UIDialog.Trigger>
      )}
      <UIDialog.Portal>
        <UIDialog.Backdrop
          className={clsx(styles.backdrop, backdropClassName)}
        />
        <UIDialog.Popup className={clsx(styles.popup, popupClassName)}>
          <Flex
            align="center"
            gap="3"
            className={clsx(styles.header, headerClassName)}
          >
            <div>
              {showCloseButton && (
                <UIDialog.Close
                  className={styles.close}
                  render={(props) => (
                    <Button.Icon
                      {...props}
                      aria-label="Close dialog"
                      variant="ghost"
                    >
                      <CloseIcon />
                    </Button.Icon>
                  )}
                />
              )}
            </div>
            <UIDialog.Title className={styles.title}>{title}</UIDialog.Title>
            {headerActions != null && (
              <div className={styles.headerActions}>{headerActions}</div>
            )}
            <div />
          </Flex>
          {description && (
            <UIDialog.Description>{description}</UIDialog.Description>
          )}
          {children}
        </UIDialog.Popup>
      </UIDialog.Portal>
    </UIDialog.Root>
  )
}
