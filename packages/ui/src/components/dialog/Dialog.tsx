import { Dialog as UIDialog } from '@base-ui/react'
import type { ReactNode } from 'react'
import { Button, type ButtonVariant, Flex, IconButton } from '../../index.js'
import styles from './Dialog.module.css'

type DialogProps = Omit<UIDialog.Root.Props, 'children'> & {
  trigger: string
  title: string
  description?: string
  children: ReactNode
  buttonVariant?: ButtonVariant
}

export default function Dialog({
  trigger,
  title,
  description,
  children,
  buttonVariant,
}: DialogProps) {
  return (
    <UIDialog.Root>
      <UIDialog.Trigger
        render={(props) => <Button variant={buttonVariant} {...props} />}
      >
        {trigger}
      </UIDialog.Trigger>
      <UIDialog.Portal>
        <UIDialog.Backdrop className={styles.backdrop} />
        <UIDialog.Popup className={styles.popup}>
          <Flex align="baseline" gap="3" className={styles.header}>
            <UIDialog.Close
              className={styles.close}
              render={(props) => <IconButton {...props}>🗙</IconButton>}
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
