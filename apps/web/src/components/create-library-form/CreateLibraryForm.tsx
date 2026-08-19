import {
  Add20Regular as AddIcon,
  Delete20Regular as DeleteIcon,
} from '@fluentui/react-icons'
import { useMutation } from '@tanstack/react-query'
import { type ContentType, DataSourceType } from '@xon/shared'
import { Button, Dialog, Field, Flex, RadioGroup, Textbox } from '@xon/ui'
import { useEffect, useRef, useState } from 'react'
import { createLibraryMutation } from '~/hooks/useLibraries'
import styles from './CreateLibraryForm.module.css'
import MediaFolderBrowser from './MediaFolderBrowser'

const LIBRARY_TYPES = [
  {
    label: 'Movies',
    icon: '🍿',
    value: 'video/movie',
  },
  {
    label: 'TV Shows',
    icon: '📺',
    value: 'video/tvshow',
  },
  {
    label: 'Music',
    icon: '🎶',
    value: 'audio',
  },
  {
    label: 'Photos',
    icon: '🖼️',
    value: 'image',
  },
  {
    label: 'Videos',
    icon: '📹',
    value: 'video',
  },
]

export type CreateLibraryFormProps = {
  onSuccess: (libraryId: string) => void
  submitLabel?: string
  formClassName?: string | undefined
}

type LocationInput = {
  id: number
  path: string
}

export default function CreateLibraryForm({
  onSuccess,
  formClassName,
  submitLabel = 'Create library',
}: CreateLibraryFormProps) {
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [locations, setLocations] = useState<LocationInput[]>([
    { id: 0, path: '' },
  ])
  const nextLocationId = useRef(1)
  const [contentType, setContentType] = useState<ContentType>()
  const mutation = useMutation(createLibraryMutation)

  const canFormSubmit =
    name.trim() !== '' &&
    (contentType?.length || 0) > 0 &&
    locations.every((location) => location.path.trim() !== '')

  useEffect(() => {
    if (mutation.isSuccess) {
      onSuccess(mutation.data.id)
    }
  }, [mutation, onSuccess])

  // A React 19 form action: useFormStatus tracks the returned promise, so the
  // submit button drives its own spinner while this is in flight.
  async function handleSubmit() {
    if (!contentType) return

    await mutation.mutateAsync({
      name,
      description,
      type: contentType,
      dataSources: locations.map((location) => ({
        type: DataSourceType.local,
        path: location.path.trim(),
      })),
    })
  }

  function updateLocation(id: number, path: string) {
    setLocations((current) =>
      current.map((location) =>
        location.id === id ? { ...location, path } : location,
      ),
    )
  }

  function addLocation() {
    const id = nextLocationId.current
    nextLocationId.current += 1
    setLocations((current) => [...current, { id, path: '' }])
  }

  function removeLocation(id: number) {
    setLocations((current) =>
      current.length > 1
        ? current.filter((location) => location.id !== id)
        : current,
    )
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
      <Field label="Content Type">
        <RadioGroup
          items={LIBRARY_TYPES}
          value={contentType ?? ''}
          onChange={(value) => setContentType(value as ContentType)}
        />
      </Field>
      <Field
        label="Locations"
        description="Add every folder that belongs to this library."
      >
        <div className={styles.locationList}>
          {locations.map((location, index) => (
            <div className={styles.locationRow} key={location.id}>
              <Textbox
                aria-label={`Location ${index + 1}`}
                placeholder="e.g. /Volumes/Movies"
                value={location.path}
                onChange={(event) =>
                  updateLocation(location.id, event.target.value)
                }
                block
              />
              <Dialog
                triggerText="📂 Browse..."
                title="Select Media Folder"
                buttonProps={{ className: styles.browseButton }}
              >
                <MediaFolderBrowser
                  onSelect={(path) => updateLocation(location.id, path)}
                />
              </Dialog>
              {locations.length > 1 && (
                <Button.Icon
                  aria-label={`Remove location ${index + 1}`}
                  className={styles.removeLocationButton}
                  title={`Remove location ${index + 1}`}
                  variant="ghost"
                  onClick={() => removeLocation(location.id)}
                >
                  <DeleteIcon aria-hidden="true" />
                </Button.Icon>
              )}
            </div>
          ))}
          <Button
            className={styles.addLocationButton}
            variant="ghost"
            onClick={addLocation}
          >
            <AddIcon aria-hidden="true" />
            Add location
          </Button>
        </div>
      </Field>
      <Button type="submit" variant="primary" disabled={!canFormSubmit}>
        {submitLabel}
      </Button>
    </Flex>
  )
}
