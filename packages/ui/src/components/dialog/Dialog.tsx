import { Dialog as UIDialog } from '@base-ui/react'
import { DismissFilled as CloseIcon } from '@fluentui/react-icons'
import type { ReactNode } from 'react'
import { Button, type ButtonProps, Flex } from '../../index.js'
import styles from './Dialog.module.css'

type DialogProps = Omit<UIDialog.Root.Props, 'children'> & {
  /** Renders a trigger button. Omit when controlling the dialog via `open`. */
  triggerText?: string
  title: string
  description?: ReactNode
  children: ReactNode
  buttonProps?: ButtonProps
  showCloseButton?: boolean
}

export default function Dialog({
  triggerText,
  title,
  description,
  children,
  buttonProps,
  showCloseButton = true,
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
        <UIDialog.Backdrop className={styles.backdrop} />
        <UIDialog.Popup className={styles.popup}>
          <Flex align="center" gap="3" className={styles.header}>
            {showCloseButton && (
              <UIDialog.Close
                className={styles.close}
                render={(props) => (
                  <Button.Icon {...props}>
                    <CloseIcon />
                  </Button.Icon>
                )}
              />
            )}
            <UIDialog.Title className={styles.title}>{title}</UIDialog.Title>
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
