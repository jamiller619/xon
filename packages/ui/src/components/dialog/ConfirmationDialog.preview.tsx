import { useState } from 'react'
import Button from '../button/Button.jsx'
import ConfirmationDialog from './ConfirmationDialog.jsx'

export default function ConfirmationDialogPreview() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<'yes' | 'no'>()

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open confirmation</Button>
      <output aria-live="polite">
        {result ? `Selected: ${result}` : 'No selection'}
      </output>
      <ConfirmationDialog
        open={open}
        description="This action will refresh the stored metadata."
        onYes={() => {
          setResult('yes')
          setOpen(false)
        }}
        onNo={() => {
          setResult('no')
          setOpen(false)
        }}
      />
    </>
  )
}
