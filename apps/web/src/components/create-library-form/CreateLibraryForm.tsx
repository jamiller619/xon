import { useMutation } from '@tanstack/react-query'
import { DataSourceType, LibraryType } from '@xon/shared'
import { Button, Dialog, Field, Flex, RadioGroup, Textbox } from '@xon/ui'
import { useEffect, useState } from 'react'
import { createLibraryMutation } from '~/hooks/useLibraries'
import styles from './CreateLibraryForm.module.css'
import MediaFolderBrowser from './MediaFolderBrowser'

const LIBRARY_TYPES = [
  {
    label: 'Movies',
    icon: '🍿',
    value: LibraryType.Movies,
  },
  {
    label: 'TV Shows',
    icon: '📺',
    value: LibraryType.TVShows,
  },
  {
    label: 'Music',
    icon: '🎶',
    value: LibraryType.Music,
  },
  {
    label: 'Photos',
    icon: '🖼️',
    value: LibraryType.Photos,
  },
  {
    label: 'Home Videos',
    icon: '📹',
    value: LibraryType.HomeVideos,
  },
]

interface CreateLibraryFormProps {
  onSuccess: (libraryId: string) => void
  submitLabel?: string
  formClassName?: string | undefined
}

export default function CreateLibraryForm({
  onSuccess,
  formClassName,
}: CreateLibraryFormProps) {
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [sourcePath, setSourcePath] = useState('')
  const [libraryType, setLibraryType] = useState<LibraryType | undefined>()
  const mutation = useMutation(createLibraryMutation)

  const canFormSubmit =
    name.trim() !== '' &&
    (libraryType?.length || 0) > 0 &&
    sourcePath.trim() !== ''

  useEffect(() => {
    if (mutation.isSuccess) {
      onSuccess(mutation.data.id)
    }
  }, [mutation, onSuccess])

  // A React 19 form action: useFormStatus tracks the returned promise, so the
  // submit button drives its own spinner while this is in flight.
  async function handleSubmit() {
    if (!libraryType) return

    await mutation.mutateAsync({
      name,
      description,
      type: libraryType,
      dataSources: [{ type: DataSourceType.local, path: sourcePath }],
    })
  }

  return (
    <Flex
      as="form"
      action={handleSubmit}
      dir="col"
      gap="4"
      className={formClassName}
    >
      <Field label="Library Name">
        <Textbox
          placeholder="e.g. Movies"
          value={name}
          onChange={(e) => setName(e.target.value)}
          block
        />
      </Field>
      <Field label="Description (optional)">
        <Textbox
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          block
        />
      </Field>
      <Field label="Media Type">
        <RadioGroup
          items={LIBRARY_TYPES}
          value={libraryType ?? ''}
          onChange={(value) => setLibraryType(value as LibraryType)}
        />
      </Field>
      <Field label="Location">
        <Textbox
          className={styles.locationTextbox}
          placeholder="e.g. /Volumes/Movies"
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          block
        />
        <Dialog
          triggerText="📂 Browse..."
          title="Select Media Folder"
          buttonProps={{ block: true }}
        >
          <MediaFolderBrowser onSelect={setSourcePath} />
        </Dialog>
      </Field>
      <Button type="submit" variant="primary" disabled={!canFormSubmit}>
        Finish Setup
      </Button>
    </Flex>
  )
}
