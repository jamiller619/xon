import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'
import Button from '../button/Button.jsx'
import Dialog from './Dialog.jsx'

const styles = css`
  /* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
  /* Hallmark · component: confirmation dialog · genre: modern-minimal · theme: Xon
   * states: default · hover · focus · active · disabled · loading · error · success
   * contrast: inherited from Dialog and Button
   */

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-xs);
    min-width: min(18rem, calc(100vw - var(--space-xl)));
    margin-block-start: var(--space-md);
  }

  @media (max-width: 24rem) {
    .actions {
      min-width: 0;

      button {
        flex: 1;
        white-space: nowrap;
      }
    }
  }
`

export type ConfirmationDialogProps = {
  open: boolean
  title?: string
  description?: ReactNode
  yesLabel?: string
  noLabel?: string
  onYes: () => void
  onNo: () => void
}

export default function ConfirmationDialog({
  open,
  title = 'Are you sure?',
  description,
  yesLabel = 'Yes',
  noLabel = 'No',
  onYes,
  onNo,
}: ConfirmationDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onNo()
      }}
      title={title}
      {...(description != null ? { description } : {})}
      showCloseButton={false}
    >
      <div className={styles.actions}>
        <Button onClick={onNo}>{noLabel}</Button>
        <Button variant="primary" onClick={onYes}>
          {yesLabel}
        </Button>
      </div>
    </Dialog>
  )
}
