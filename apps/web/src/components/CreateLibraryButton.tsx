import { FolderAdd20Regular as AddLibraryIcon } from '@fluentui/react-icons'
import { Button, Dialog } from '@xon/ui'
import { type ReactNode, useState } from 'react'
import CreateLibraryForm, {
  type CreateLibraryFormProps,
} from './create-library-form/CreateLibraryForm'

type CreateLibraryButtonProps = Pick<CreateLibraryFormProps, 'onSuccess'> & {
  button?: (onClick: () => void) => ReactNode
}

export default function CreateLibraryButton({
  onSuccess,
  button,
}: CreateLibraryButtonProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <>
      {button ? (
        button(() => setCreateDialogOpen(true))
      ) : (
        <Button onClick={() => setCreateDialogOpen(true)}>
          <AddLibraryIcon />
          Create library
        </Button>
      )}
      <Dialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="Create Library"
      >
        <CreateLibraryForm
          onSuccess={(...args) => {
            setCreateDialogOpen(false)
            onSuccess(...args)
          }}
        />
      </Dialog>
    </>
  )
}
