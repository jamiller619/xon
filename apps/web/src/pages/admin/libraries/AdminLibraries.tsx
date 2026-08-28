import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ContentType, Library } from '@xon/shared'
import {
  Button,
  ConfirmationDialog,
  Dialog,
  Flex,
  Menu,
  type MenuItems,
  Surface,
} from '@xon/ui'
import { css } from 'inline-css-modules'
import { type MouseEventHandler, useState } from 'react'
import CreateLibraryButton from '~/components/CreateLibraryButton'
import LibraryIcon from '~/components/icons/LibraryIcon'
import useLibraries, { updateLibraryMutation } from '~/hooks/useLibraries'
import useLibraryThumbnail from '~/hooks/useLibraryThumbnail'
import { getAPIError } from '~/lib/apiFetch'
import Icons from '~/lib/icons'
import { librariesAPI } from '~/lib/rpc'
import Page from '~/pages/Page'

const styles = css`
  .library {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-md);
    gap: var(--space-xs);
    min-width: 300px;
    min-height: 180px;
    overflow: hidden;
    background-size: cover;
    box-shadow: var(--shadow-2);
    
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: linear-gradient(45deg, #000000f2 40%, transparent);
      z-index: -1;
    }
  }

  .title {
    font-weight: 500;
  }

  .path {
    font-family: monospace;
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
  }

  .libraryIcon {
    color: var(--color-accent-9);
  }

  .muted {
    color: var(--color-text-muted);
  }

  .deleteButton {
    margin-left: auto;
  }
`

export default function AdminLibraries() {
  const { data: libraries, refetch: refetchLibraries } = useLibraries()

  return (
    <Page>
      <header className={styles.header}>
        <Page.Title>Manage libraries</Page.Title>
        <Flex gap="2">
          <CreateLibraryButton onSuccess={() => void refetchLibraries()} />
          <Button onClick={() => void console.log('test')}>
            <Icons.AddLibrary />
            Scan all libraries
          </Button>
        </Flex>
      </header>
      <Flex gap="4">
        {libraries?.map((library) => (
          <LibraryCard key={library.id} library={library} />
        ))}
      </Flex>
    </Page>
  )
}

function LibraryCard({ library }: { library: Library }) {
  const thumbnailURL = useLibraryThumbnail(library)
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [contentType, setContentType] = useState<ContentType>(library.type)
  const updateLibrary = useMutation({
    ...updateLibraryMutation,
    onSuccess: () => {
      setEditOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['libraries'] })
      void queryClient.invalidateQueries({
        queryKey: ['library', library.id],
      })
    },
  })
  const deleteLibrary = useMutation({
    mutationFn: async () => {
      const response = await librariesAPI[':id'].$delete({
        param: { id: library.id },
      })

      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Library could not be deleted'),
        )
      }
    },
    onSuccess: () => {
      setDeleteOpen(false)
      queryClient.removeQueries({ queryKey: ['library', library.id] })
      void queryClient.invalidateQueries({ queryKey: ['libraries'] })
    },
  })

  function openEditor() {
    updateLibrary.reset()
    setContentType(library.type)
    setEditOpen(true)
  }

  async function saveContentType() {
    await updateLibrary.mutateAsync({ id: library.id, type: contentType })
  }

  function openDeleteConfirmation() {
    deleteLibrary.reset()
    setDeleteOpen(true)
  }

  function closeDeleteConfirmation() {
    if (deleteLibrary.isPending) return
    setDeleteOpen(false)
    deleteLibrary.reset()
  }

  return (
    <>
      <Surface
        className={styles.library}
        borderRadius="small"
        style={{ backgroundImage: `url('${thumbnailURL}')` }}
      >
        <Flex gap="2" dir="col">
          <LibraryIcon
            className={styles.libraryIcon ?? ''}
            type={library.type}
            size="large"
          />
          <h5 className={styles.title}>{library.name}</h5>
          <Flex align="start" gap="1" className={styles.muted}>
            <Icons.Folder />
            <p className={styles.path}>
              {library.dataSources.map((ds) => ds.path).join(', ')}
            </p>
          </Flex>
          <Flex gap="2" justify="end">
            {/* <Button.Icon title="Edit library" onClick={openEditor}>
              <EditIcon />
            </Button.Icon> */}
            {/* <Button.Icon title="Scan library">
              <ScanIcon />
            </Button.Icon> */}
            <Menu
              className={styles.moreMenu}
              items={buildMoreMenu(openEditor, openDeleteConfirmation)}
              align="start"
            >
              <Button.Icon>
                <Icons.More />
              </Button.Icon>
            </Menu>
            {/* <Button.Icon
              variant="danger"
              title="Delete library"
              className={styles.deleteButton}
              onClick={openDeleteConfirmation}
            >
              <DeleteIcon />
            </Button.Icon> */}
          </Flex>
        </Flex>
      </Surface>
      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${library.name}`}
      >
        <Flex as="form" action={saveContentType} dir="col" gap="4">
          {/* <Field
            label="Content Type"
            description="Change this if automatic detection chose the wrong library type."
            {...(updateLibrary.error
              ? { error: updateLibrary.error.message }
              : {})}
          >
            <RadioGroup
              items={LIBRARY_TYPES}
              value={contentType}
              onChange={(value) => setContentType(value as ContentType)}
            />
          </Field> */}
          <Button
            type="submit"
            variant="primary"
            disabled={updateLibrary.isPending}
          >
            Save changes
          </Button>
        </Flex>
      </Dialog>
      <ConfirmationDialog
        open={deleteOpen}
        title={`Delete ${library.name}?`}
        description={
          deleteLibrary.error ? (
            <span role="alert">{deleteLibrary.error.message}</span>
          ) : (
            <p className="center">
              This will permanently remove the library and all metadata from Xon
              and is irreversible! Are you sure?
              <br />
              <br />
              <i className="muted">Your files on disk will NOT be deleted.</i>
            </p>
          )
        }
        yesLabel="Yes, delete library"
        noLabel="Cancel"
        loading={deleteLibrary.isPending}
        onYes={() => deleteLibrary.mutate()}
        onNo={closeDeleteConfirmation}
      />
    </>
  )
}

function buildMoreMenu(
  editAction: MouseEventHandler | undefined,
  deleteAction: MouseEventHandler | undefined,
): MenuItems {
  return [
    { label: 'Edit library', icon: <Icons.Edit />, onClick: editAction },
    { label: 'Refresh library metadata', icon: <Icons.RefreshMetadata /> },
    { label: 'Edit images', icon: <Icons.EditImages /> },
    { label: 'Scan library', icon: <Icons.Scan /> },
    { label: 'Delete', icon: <Icons.Delete />, onClick: deleteAction },
  ]
}
