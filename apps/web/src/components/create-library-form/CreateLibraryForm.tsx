import {
  Add20Regular as AddIcon,
  Delete20Regular as DeleteIcon,
} from '@fluentui/react-icons'
import { useMutation } from '@tanstack/react-query'
import { type ContentType, DataSourceType } from '@xon/shared'
import { Button, Dialog, Field, Flex, Textbox } from '@xon/ui'
import { useEffect, useRef, useState } from 'react'
import { createLibraryMutation } from '~/hooks/useLibraries'
import styles from './CreateLibraryForm.module.css'
import MediaFolderBrowser from './MediaFolderBrowser'

const AUTOMATIC_CONTENT_TYPE = 'automatic'

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
  const [contentType, setContentType] = useState<
    ContentType | typeof AUTOMATIC_CONTENT_TYPE
  >(AUTOMATIC_CONTENT_TYPE)
  const mutation = useMutation(createLibraryMutation)

  const canFormSubmit =
    name.trim() !== '' &&
    locations.every((location) => location.path.trim() !== '')

  useEffect(() => {
    if (mutation.isSuccess) {
      onSuccess(mutation.data.id)
    }
  }, [mutation, onSuccess])

  // A React 19 form action: useFormStatus tracks the returned promise, so the
  // submit button drives its own spinner while this is in flight.
  async function handleSubmit() {
    await mutation.mutateAsync({
      name,
      description,
      ...(contentType === AUTOMATIC_CONTENT_TYPE ? {} : { type: contentType }),
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
      {/* <Field
        label="Content Type"
        description="Automatic analyzes the selected folders on the server. Choose a type to override it."
        {...(mutation.error ? { error: mutation.error.message } : {})}
      >
        <RadioGroup
          items={[
            {
              label: 'Automatic',
              icon: '✨',
              value: AUTOMATIC_CONTENT_TYPE,
            },
            ...LIBRARY_TYPES,
          ]}
          value={contentType}
          onChange={(value) => {
            mutation.reset()
            setContentType(value as ContentType | typeof AUTOMATIC_CONTENT_TYPE)
          }}
        />
      </Field> */}
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
