import { FolderAdd20Regular as AddLibraryIcon } from '@fluentui/react-icons'
import { Button, Dialog, Flex } from '@xon/ui'
import { useState } from 'react'
import CreateLibraryForm from '~/components/create-library-form/CreateLibraryForm'
import LibraryCard from '~/components/LibraryCard'
import useLibraries from '~/hooks/useLibraries'
import Page from '~/pages/Page'

export default function AdminLibraries() {
  const { data: libraries, refetch } = useLibraries()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <Page>
      <Page.Title>Manage Libraries</Page.Title>
      <header>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <AddLibraryIcon />
          Add Library
        </Button>
        <Dialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          title="Create Library"
        >
          <CreateLibraryForm
            onSuccess={() => {
              setCreateDialogOpen(false)
              void refetch()
            }}
          />
        </Dialog>
      </header>
      <Flex gap="3">
        {libraries?.map((library) => (
          <LibraryCard key={library.id} data={library} />
        ))}
      </Flex>
    </Page>
  )
}
