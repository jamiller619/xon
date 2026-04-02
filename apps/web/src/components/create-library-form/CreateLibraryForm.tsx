import { type FormEvent, useRef, useState } from 'react'
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
}

export function CreateLibraryForm({
  onSuccess,
  onCancel,
  submitLabel = 'Create Library',
  cancelLabel = 'Cancel',
}: CreateLibraryFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mediaTypes, setMediaTypes] = useState<string[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function toggleMediaType(type: string) {
    setMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  function handleBrowse() {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('webkitdirectory', '')
      fileInputRef.current.click()
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const nativeFile = file as File & { path?: string }
    if (nativeFile.path) {
      const lastSlash = Math.max(
        nativeFile.path.lastIndexOf('/'),
        nativeFile.path.lastIndexOf('\\'),
      )
      setSourcePath(
        lastSlash > 0 ? nativeFile.path.slice(0, lastSlash) : nativeFile.path,
      )
    }
    e.target.value = ''
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
    <form className={styles.form ?? ''} onSubmit={handleSubmit}>
      <label className={styles.fieldLabel ?? ''}>
        Library Name
        <input
          type="text"
          className={styles.input ?? ''}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Movies, Music, Photos"
        />
      </label>

      <label className={styles.fieldLabel ?? ''}>
        Description
        <input
          type="text"
          className={styles.input ?? ''}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </label>

      <div>
        <p className={styles.fieldLabel ?? ''}>
          Allowed Media Types (leave empty for all)
        </p>
        <div className={styles.mediaTypeGrid ?? ''}>
          {ALL_MEDIA_TYPES.map(({ label, emoji }) => (
            <label key={label} className={styles.mediaTypeCheckbox ?? ''}>
              <input
                type="checkbox"
                checked={mediaTypes.includes(label)}
                onChange={() => toggleMediaType(label)}
              />
              <span>{emoji}</span>
              {label}
            </label>
          ))}
        </div>
      </div>

      <label className={styles.fieldLabel ?? ''}>
        Media Folder Path
        <div className={styles.pathRow ?? ''}>
          <input
            type="text"
            className={styles.input ?? ''}
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/mnt/media or C:\Media (optional — add later in settings)"
          />
          <button
            type="button"
            className={styles.browseBtn ?? ''}
            onClick={handleBrowse}
          >
            Browse
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />
      </label>

      {error && <div className={styles.error ?? ''}>{error}</div>}

      <div className={styles.actions ?? ''}>
        {onCancel && (
          <button
            type="button"
            className={styles.cancelBtn ?? ''}
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          className={styles.submitBtn ?? ''}
          disabled={loading}
        >
          {loading ? 'Creating…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
