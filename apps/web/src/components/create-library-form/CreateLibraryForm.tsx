import { Dialog as BaseDialog } from '@base-ui/react'
import { DataSourceType, type Library, MediaCategory } from '@xon/shared'
import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  Label,
  ScrollArea,
  Surface,
  Textbox,
} from '@xon/ui'
import clsx from 'clsx'
import { type SubmitEvent, useEffect, useState } from 'react'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import styles from './CreateLibraryForm.module.css'

const ALL_MEDIA_TYPES: { label: MediaCategory; emoji: string }[] = [
  { label: MediaCategory.Movies, emoji: '🎬' },
  { label: MediaCategory.TVShows, emoji: '📺' },
  // { label: 'Clips', emoji: '🎞️' },
  { label: MediaCategory.Music, emoji: '🎵' },
  // { label: 'Audiobooks', emoji: '🎧' },
  // { label: 'Audio Clips', emoji: '🔊' },
  // { label: 'Podcasts', emoji: '🎙️' },
  { label: MediaCategory.Pictures, emoji: '🖼️' },
  // { label: 'Images', emoji: '📷' },
  // { label: 'Textures', emoji: '🎨' },
  { label: MediaCategory.HomeVideos, emoji: '📹' },
  // { label: 'Games', emoji: '🎮' },
  // { label: 'Interactive Media', emoji: '💻' },
  // { label: 'Documents', emoji: '📄' },
  // { label: 'Web Media', emoji: '🌐' },
  // { label: 'Design Files', emoji: '✏️' },
  // { label: '3D Models', emoji: '🧊' },
  // { label: 'Archives', emoji: '🗜️' },
  // { label: 'Fonts', emoji: '🔤' },
  // { label: 'Icons', emoji: '🔷' },
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
  const [mediaCategories, setMediaCategories] = useState<MediaCategory[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleMediaType(type: MediaCategory) {
    setMediaCategories((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const libRes = await apiFetch('/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          mediaCategories,
          dataSources: [
            {
              type: DataSourceType.local,
              path: sourcePath.trim(),
            },
          ],
        }),
      })

      if (!libRes.ok) {
        setError(await getAPIError(libRes, 'Failed to create library'))

        return
      }

      const library = (await libRes.json()) as Library

      onSuccess(library.id)
    } catch {
      setError('Network error — please try again')
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

interface BrowseResult {
  path: string
  entries: { name: string; path: string }[]
}

function MediaFolderBrowser({
  onSelect,
}: {
  onSelect: (path: string) => void
}) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch(`/api/fs/browse?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data: BrowseResult | { error: string }) => {
        if ('error' in data) {
          setError(data.error)
          setEntries([])
        } else {
          setCurrentPath(data.path)
          setEntries(data.entries)
        }
      })
      .catch(() => setError('Network error — please try again'))
      .finally(() => setLoading(false))
  }, [currentPath])

  return (
    <div className={styles.browser}>
      <Flex align="center" gap="3">
        <button
          type="button"
          className={styles.upBtn}
          disabled={currentPath === '/'}
          onClick={() => setCurrentPath(parentPath(currentPath))}
          title="Go up"
        >
          ⮤
        </button>
        <Textbox value={currentPath} block />
      </Flex>
      <ScrollArea className={styles.entryList}>
        {loading && <p className={styles.hint}>Loading…</p>}
        {!loading && error && <p className={styles.browserError}>{error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p className={styles.hint}>No subfolders found.</p>
        )}
        {!loading &&
          entries.map((entry) => (
            <button
              type="button"
              key={entry.path}
              className={styles.entry}
              onClick={() => setCurrentPath(entry.path)}
            >
              <span>📁</span>
              {entry.name}
            </button>
          ))}
      </ScrollArea>
      <div className={styles.browserActions}>
        <BaseDialog.Close
          onClick={() => onSelect(currentPath)}
          render={(props) => (
            <Button
              {...props}
              size="small"
              variant="primary"
              style={{ flex: 1 }}
            />
          )}
        >
          Select This Folder
        </BaseDialog.Close>
      </div>
    </div>
  )
}

function parentPath(p: string): string {
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}
