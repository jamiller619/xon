import { useMutation } from '@tanstack/react-query'
import { LibraryType } from '@xon/shared'
import {
  Button,
  CheckboxGroup,
  Dialog,
  Field,
  Flex,
  RadioGroup,
  Textbox,
} from '@xon/ui'
import { css } from 'inline-css-modules'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MediaFolderBrowser from '~/components/create-library-form/MediaFolderBrowser'
import { useMutationHelper } from '~/hooks/useQueryAPIHelper'
import { styles as setupStyles } from './Setup'

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

const styles = css`
  .column {
    flex: 1;
  }

  .locationTextbox {
    margin-block-end: var(--space-2);
  }

  .image {
    mix-blend-mode: lighten;
    border-radius: var(--border-radius-5);
    corner-shape: var(--corner-shape);
    overflow: hidden;
  }
`

export default function CreateLibrary() {
  const navigate = useNavigate()
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [sourcePath, setSourcePath] = useState('')
  const [libraryType, setLibraryType] = useState<string | undefined>()
  const mutation = useMutation(useMutationHelper('libraries'))

  const canFormSubmit =
    name.trim() !== '' &&
    (libraryType?.length || 0) > 0 &&
    sourcePath.trim() !== ''

  useEffect(() => {
    if (mutation.isSuccess) {
      navigate('/', { replace: true })
    }
  }, [mutation, navigate])

  // A React 19 form action: useFormStatus tracks the returned promise, so the
  // submit button drives its own spinner while this is in flight.
  async function handleSubmit() {
    await mutation.mutateAsync({
      name,
      description,
      type: libraryType,
      dataSources: [{ type: 'local', path: sourcePath }],
    })
  }

  return (
    <Flex
      as="form"
      align="start"
      justify="center"
      gap="6"
      action={handleSubmit}
    >
      <div className={styles.column}>
        <h1 className={setupStyles.heading}>Create your first Library.</h1>
        <p>
          Organize your media by creating a library. Xon will scan your media to
          discover metadata and create an editorial gallery experience
          automatically.
        </p>
        <img
          className={styles.image}
          src="src/static/images/create-library.png"
          alt=""
        />
      </div>
      <Flex dir="col" gap="4" className={styles.column}>
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
            onChange={setLibraryType}
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
    </Flex>
  )
}
