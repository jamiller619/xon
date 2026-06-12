import { useMutation } from '@tanstack/react-query'
import { MediaType } from '@xon/shared'
import {
  Button,
  Collapsible,
  Dialog,
  Field,
  Flex,
  RadioGroup,
  Textbox,
} from '@xon/ui'
import { css } from 'inline-css-modules'
import { type SubmitEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MediaFolderBrowser from '~/components/create-library-form/MediaFolderBrowser'
import { useMutationHelper } from '~/hooks/useQueryAPIHelper'
import { styles as setupStyles } from './Setup'

const LIBRARY_TYPES = [
  {
    label: 'Movies',
    icon: '🍿',
    value: 'movies',
  },
  {
    label: 'TV Shows',
    icon: '📺',
    value: 'series',
  },
  {
    label: 'Music',
    icon: '🎶',
    value: 'music',
  },
  {
    label: 'Photos',
    icon: '🖼️',
    value: 'photos',
  },
  {
    label: 'Home Videos',
    icon: '📹',
    value: 'home_videos',
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
  const [mediaType, setMediaType] = useState<string>('')
  const mutation = useMutation(useMutationHelper('libraries'))

  const canFormSubmit =
    name.trim() !== '' && mediaType !== '' && sourcePath.trim() !== ''

  useEffect(() => {
    if (mutation.isSuccess) {
      navigate('/', { replace: true })
    }
  }, [mutation, navigate])

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    mutation.mutate({
      name,
      mediaTypes: [mediaType],
    })
  }

  return (
    <Flex
      as="form"
      align="start"
      justify="center"
      gap="6"
      onSubmit={handleSubmit}
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
        <Field label="Media Type(s)">
          <RadioGroup
            items={LIBRARY_TYPES}
            value={mediaType}
            onChange={setMediaType}
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
