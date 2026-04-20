import { Dialog as BaseDialog } from '@base-ui/react'
import { Button, Checkbox, Dialog, Label, Surface, Textbox } from '@xon/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/apiFetch.js'
import styles from './CreateLibraryForm.module.css'

const ALL_MEDIA_TYPES: { label: string; emoji: string }[] = [
  { label: 'Movies', emoji: '🎬' },
  { label: 'TV Shows', emoji: '📺' },
  { label: 'Clips', emoji: '🎞️' },
  { label: 'Music', emoji: '🎵' },
  { label: 'Audiobooks', emoji: '🎧' },
  { label: 'Audio Clips', emoji: '🔊' },
  { label: 'Podcasts', emoji: '🎙️' },
  { label: 'Pictures', emoji: '🖼️' },
  { label: 'Images', emoji: '📷' },
  { label: 'Textures', emoji: '🎨' },
  { label: 'Home Videos', emoji: '📹' },
  { label: 'Games', emoji: '🎮' },
  { label: 'Interactive Media', emoji: '💻' },
  { label: 'Documents', emoji: '📄' },
  { label: 'Web Media', emoji: '🌐' },
  { label: 'Design Files', emoji: '✏️' },
  { label: '3D Models', emoji: '🧊' },
  { label: 'Archives', emoji: '🗜️' },
  { label: 'Fonts', emoji: '🔤' },
  { label: 'Icons', emoji: '🔷' },
]

interface CreateLibraryFormProps {
  onSuccess: (libraryId: string) => void
  onCancel?: () => void
  submitLabel?: string
  cancelLabel?: string
  formClassName?: string | undefined
}

export function CreateLibraryForm({
  onSuccess,
  onCancel,
  submitLabel = 'Create Library',
  cancelLabel = 'Cancel',
  formClassName,
}: CreateLibraryFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mediaTypes, setMediaTypes] = useState<string[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleMediaType(type: string) {
    setMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const libRes = await apiFetch('/api/v1/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          allowedMediaTypes: mediaTypes,
        }),
      })
      if (!libRes.ok) {
        const body = (await libRes.json()) as { error?: string }
        setError(body.error ?? 'Failed to create library')
        return
      }
      const lib = (await libRes.json()) as { id: string }

      if (sourcePath.trim()) {
        const srcRes = await apiFetch(`/api/v1/libraries/${lib.id}/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'local',
            path: sourcePath.trim(),
            recursive: true,
          }),
        })
        if (!srcRes.ok) {
          const body = (await srcRes.json()) as { error?: string }
          setError(body.error ?? 'Failed to add data source')
          return
        }
      }

      onSuccess(lib.id)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={formClassName ?? ''} onSubmit={handleSubmit}>
      <Label>
        Library Name
        <Textbox
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Movies, Music, Photos"
        />
      </Label>
      <Label>
        Description
        <Textbox
          className={styles.input}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </Label>
      <Label>Media Types (leave empty for all)</Label>
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
            checked={mediaTypes.includes(label)}
            onChange={() => toggleMediaType(label)}
          />
        ))}
      </Surface>
      <Label>Media Folder Path</Label>
      <div className={styles.folderRow}>
        {sourcePath && (
          <span className={styles.selectedPath} title={sourcePath}>
            {sourcePath}
          </span>
        )}
        <Dialog trigger="Browse…" title="Select Media Folder">
          <MediaFolderBrowser onSelect={setSourcePath} />
        </Dialog>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <Button type="submit" disabled={loading}>
        {loading ? 'Creating…' : submitLabel}
      </Button>
    </form>
  )
}

interface BrowseResult {
  path: string
  entries: { name: string; path: string }[]
}

function MediaFolderBrowser({ onSelect }: { onSelect: (path: string) => void }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch(`/api/v1/fs/browse?path=${encodeURIComponent(currentPath)}`)
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

  const breadcrumbs = buildBreadcrumbs(currentPath)

  return (
    <div className={styles.browser}>
      <div className={styles.breadcrumb}>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className={styles.breadcrumbItem}>
            {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
            <button
              type="button"
              className={styles.breadcrumbBtn}
              onClick={() => setCurrentPath(crumb.path)}
            >
              {crumb.label || '/'}
            </button>
          </span>
        ))}
      </div>

      <div className={styles.entryList}>
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
              <span className={styles.entryIcon}>📁</span>
              {entry.name}
            </button>
          ))}
      </div>

      <div className={styles.browserActions}>
        <BaseDialog.Close
          className={styles.selectBtn}
          onClick={() => onSelect(currentPath)}
        >
          Select This Folder
        </BaseDialog.Close>
      </div>
    </div>
  )
}

function buildBreadcrumbs(fullPath: string) {
  const parts = fullPath.split('/').filter(Boolean)
  const crumbs = [{ label: '', path: '/' }]
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      label: parts[i] ?? '',
      path: `/${parts.slice(0, i + 1).join('/')}`,
    })
  }
  return crumbs
}
