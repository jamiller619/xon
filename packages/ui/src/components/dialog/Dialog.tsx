import { Dialog as UIDialog } from '@base-ui/react'
import type { ReactNode } from 'react'
import Button from '../button/Button.jsx'
import styles from './Dialog.module.css'

type DialogProps = Omit<UIDialog.Root.Props, 'children'> & {
  trigger: string
  title: string
  description?: string
  children: ReactNode
}

export default function Dialog({
  trigger,
  title,
  description,
  children,
}: DialogProps) {
  return (
    <UIDialog.Root>
      <UIDialog.Trigger render={(props) => <Button {...props} />}>
        {trigger}
      </UIDialog.Trigger>
      <UIDialog.Portal>
        <UIDialog.Backdrop className={styles.backdrop} />
        <UIDialog.Popup className={styles.popup}>
          <UIDialog.Title className={styles.title}>{title}</UIDialog.Title>
          {description && (
            <UIDialog.Description>{description}</UIDialog.Description>
          )}
          <UIDialog.Close>Close</UIDialog.Close>
          {children}
        </UIDialog.Popup>
      </UIDialog.Portal>
    </UIDialog.Root>
  )
}
