import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@xon/ui'
import { useCallback } from 'react'
import CreateLibraryForm from '~/components/create-library-form/CreateLibraryForm'

type CreateLibraryDialogProps = {
  onClose: () => void
}

export default function CreateLibraryDialog({
  onClose,
}: CreateLibraryDialogProps) {
  const queryClient = useQueryClient()
  const handleSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['libraries'] })
    onClose()
  }, [onClose, queryClient])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Create Library"
    >
      <CreateLibraryForm onSuccess={handleSuccess} />
    </Dialog>
  )
}
