import { DataSourceType, MediaType } from '@xon/shared'
import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  Label,
  Surface,
  Textbox,
} from '@xon/ui'
import clsx from 'clsx'
import { type SubmitEvent, useState } from 'react'
import * as api from '~/lib/api'
import styles from './CreateLibraryForm.module.css'
import MediaFolderBrowser from './MediaFolderBrowser'

const ALL_MEDIA_TYPES: { label: MediaType.MainType; emoji: string }[] = [
  { label: MediaType.MainType.Video, emoji: '📺' },
  { label: MediaType.MainType.Audio, emoji: '🎵' },
  { label: MediaType.MainType.Image, emoji: '🖼️' },
]

interface CreateLibraryFormProps {
  onSuccess: (libraryId: string) => void
  submitLabel?: string
  formClassName?: string | undefined
}

export function CreateLibraryForm({
  onSuccess,
  submitLabel = 'Create Library',
  formClassName,
}: CreateLibraryFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mediaCategories, setMediaCategories] = useState<MediaType.MainType[]>(
    [],
  )
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleMediaType(type: MediaType.MainType) {
    setMediaCategories((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const dataSource = {
        type: DataSourceType.local,
        path: sourcePath.trim(),
      }

      const library = await api.createLibrary({
        name,
        description: description.trim() || undefined,
        mediaCategories,
        dataSources: [dataSource],
      })

      onSuccess(library.id)
    } catch (err) {
      setError(`Failed to create library: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={clsx(styles.form, formClassName)} onSubmit={handleSubmit}>
      <Label>
        Library Name
        <Textbox
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Movies, Music, Photos"
          block={true}
        />
      </Label>
      <Label>
        Description
        <Textbox
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          block={true}
        />
      </Label>
      <span>Media Types (leave empty for all)</span>
      <Surface className={styles.well}>
        {ALL_MEDIA_TYPES.map(({ label, emoji }) => (
          <Checkbox
            className={styles.checkbox}
            key={label}
            label={
              <>
                <span>{emoji}</span> {label}
              </>
            }
            checked={mediaCategories.includes(label)}
            onChange={() => toggleMediaType(label)}
          />
        ))}
      </Surface>
      <Flex justify="between" align="center" gap="3">
        <Label>Path to Media Files</Label>
        <Textbox
          value={sourcePath}
          required
          onChange={(e) => setSourcePath(e.target.value)}
          style={{ flex: 1 }}
          block={true}
        />
      </Flex>
      <Dialog triggerText="📂 Browse..." title="Select Media Folder">
        <MediaFolderBrowser onSelect={setSourcePath} />
      </Dialog>
      {error && <div className={styles.error}>{error}</div>}
      <Button
        type="submit"
        block
        disabled={loading || !name.trim() || !sourcePath.trim()}
      >
        {loading ? 'Creating...' : submitLabel}
      </Button>
    </form>
  )
}
