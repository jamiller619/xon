import { Dialog as UIDialog } from '@base-ui/react'
import type { ReactNode } from 'react'
import { Button, type ButtonProps, Flex } from '../../index.js'
import styles from './Dialog.module.css'

type DialogProps = Omit<UIDialog.Root.Props, 'children'> & {
  triggerText: string
  title: string
  description?: string
  children: ReactNode
  buttonProps?: ButtonProps
}

export default function Dialog({
  triggerText,
  title,
  description,
  children,
  buttonProps,
}: DialogProps) {
  return (
    <UIDialog.Root>
      <UIDialog.Trigger
        render={(props) => <Button {...buttonProps} {...props} />}
      >
        {triggerText}
      </UIDialog.Trigger>
      <UIDialog.Portal>
        <UIDialog.Backdrop className={styles.backdrop} />
        <UIDialog.Popup className={styles.popup}>
          <Flex align="center" gap="3" className={styles.header}>
            <UIDialog.Close
              className={styles.close}
              render={(props) => <Button.Icon {...props}>🗙</Button.Icon>}
            />
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
