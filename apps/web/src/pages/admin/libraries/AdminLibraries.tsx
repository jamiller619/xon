import type { DataSource, Library } from '@xon/shared/'
import { Button } from '@xon/ui'
import { useState } from 'react'
import { CreateLibraryForm } from '~/components/create-library-form/CreateLibraryForm'
import useLibraries from '~/hooks/useLibraries'
import { apiFetch } from '~/lib/apiFetch'
import styles from './AdminLibraries.module.css'

const SCHEDULE_PRESETS = [
  { label: 'Disabled', value: null },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Hourly', value: '0 */1 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily', value: '0 */24 * * *' },
]

function getNextScanTime(schedule: string | null): string | null {
  if (!schedule) return null
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour] = parts
  let intervalMs: number | null = null
  if (min && /^\*\/\d+$/.test(min) && hour === '*') {
    const n = Number(min.slice(2))
    if (n >= 1 && n <= 59) intervalMs = n * 60 * 1000
  } else if (min === '0' && hour && /^\*\/\d+$/.test(hour)) {
    const n = Number(hour.slice(2))
    if (n >= 1 && n <= 23) intervalMs = n * 60 * 60 * 1000
  }
  if (!intervalMs) return null
  const now = Date.now()
  const next = new Date(Math.ceil(now / intervalMs) * intervalMs)
  return next.toLocaleString()
}

// function parseAllowedMediaTypes(raw: string): string[] {
//   try {
//     const parsed = JSON.parse(raw)
//     if (Array.isArray(parsed)) return parsed as string[]
//   } catch {
//     // ignore
//   }
//   return []
// }

export default function AdminLibraries() {
  const {
    libraries,
    fetchLibraries,
    isLoading,
    error: librariesError,
  } = useLibraries()
  const [error, setError] = useState('')

  // Create/edit form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formMediaTypes, setFormMediaTypes] = useState<string[]>([])
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Data source form state (for edit modal)
  const [newSourcePath, setNewSourcePath] = useState('')
  const [newSourceType, setNewSourceType] = useState<'local' | 'network'>(
    'local',
  )
  const [newSourceRecursive, setNewSourceRecursive] = useState(true)
  const [addingSource, setAddingSource] = useState(false)
  const [sourceError, setSourceError] = useState('')

  // Schedule state
  const [scheduleValue, setScheduleValue] = useState<string | null>(null)
  const [watchEnabled, setWatchEnabled] = useState(true)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Scan status
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())
  const [scanMessages, setScanMessages] = useState<Record<string, string>>({})

  function openCreateForm() {
    setShowCreateForm(true)
    setEditingLibrary(null)
  }

  async function openEditForm(lib: Library) {
    setFormError('')
    setSourceError('')
    setScheduleError('')
    setNewSourcePath('')
    setNewSourceType('local')
    setNewSourceRecursive(true)
    // Fetch data sources
    try {
      const res = await apiFetch(`/api/libraries/${lib.id}`)
      const data = (await res.json()) as Library
      setEditingLibrary(data)
      setFormName(data.name)
      setFormDescription(data.description ?? '')
      setShowCreateForm(false)
    } catch {
      setError('Failed to load library details')
    }
  }

  function toggleMediaType(type: string) {
    setFormMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingLibrary) return
    setFormSaving(true)
    setFormError('')
    try {
      const res = await apiFetch(`/api/libraries/${editingLibrary.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription || undefined,
          mediaTypes: formMediaTypes,
        }),
      })
      if (!res.ok) {
        setFormError('Failed to update library')
      } else {
        // Refresh editing library with updated data sources
        const updated = (await res.json()) as Library
        setEditingLibrary({ ...editingLibrary, ...updated })
        await fetchLibraries()
        setFormError('')
      }
    } catch {
      setFormError('Failed to update library')
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/libraries/${id}`, { method: 'DELETE' })
      setDeleteConfirmId(null)
      if (editingLibrary?.id === id) setEditingLibrary(null)
      await fetchLibraries()
    } catch {
      setError('Failed to delete library')
    }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault()
    if (!editingLibrary) return
    setAddingSource(true)
    setSourceError('')
    try {
      const res = await apiFetch(
        `/api/libraries/${editingLibrary.id}/sources`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: newSourceType,
            path: newSourcePath,
            recursive: newSourceRecursive,
            enabled: true,
          }),
        },
      )
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setSourceError(body.error ?? 'Failed to add data source')
      } else {
        const newSource = (await res.json()) as DataSource
        setEditingLibrary({
          ...editingLibrary,
          dataSources: [...(editingLibrary.dataSources || []), newSource],
        })
        setNewSourcePath('')
        setNewSourceType('local')
        setNewSourceRecursive(true)
      }
    } catch {
      setSourceError('Failed to add data source')
    } finally {
      setAddingSource(false)
    }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!editingLibrary) return
    setScheduleSaving(true)
    setScheduleError('')
    try {
      const [schedRes, watchRes] = await Promise.all([
        apiFetch(`/api/libraries/${editingLibrary.id}/scan/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanSchedule: scheduleValue }),
        }),
        apiFetch(`/api/libraries/${editingLibrary.id}/scan/watch`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchEnabled }),
        }),
      ])
      if (!schedRes.ok || !watchRes.ok) {
        setScheduleError('Failed to save schedule settings')
      } else {
        const updated = (await watchRes.json()) as Library
        setEditingLibrary({ ...editingLibrary, ...updated })
        await fetchLibraries()
      }
    } catch {
      setScheduleError('Failed to save schedule settings')
    } finally {
      setScheduleSaving(false)
    }
  }

  async function handleScan(libraryId: string) {
    setScanningIds((prev) => new Set([...prev, libraryId]))
    setScanMessages((prev) => ({ ...prev, [libraryId]: '' }))
    try {
      const res = await apiFetch(`/api/libraries/${libraryId}/scan`, {
        method: 'POST',
      })
      if (res.status === 409) {
        setScanMessages((prev) => ({
          ...prev,
          [libraryId]: 'Scan already running',
        }))
      } else if (res.ok) {
        setScanMessages((prev) => ({ ...prev, [libraryId]: 'Scan started' }))
        setTimeout(() => {
          setScanMessages((prev) => ({ ...prev, [libraryId]: '' }))
        }, 3000)
      } else {
        setScanMessages((prev) => ({
          ...prev,
          [libraryId]: 'Failed to start scan',
        }))
      }
    } catch {
      setScanMessages((prev) => ({
        ...prev,
        [libraryId]: 'Failed to start scan',
      }))
    } finally {
      setScanningIds((prev) => {
        const next = new Set(prev)
        next.delete(libraryId)
        return next
      })
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading...</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Libraries</h1>
        <Button variant="primary" onClick={openCreateForm}>
          + New Library
        </Button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Create form */}
      {showCreateForm && (
        <div className={styles.formCard}>
          <h2 className={styles.formHeading}>Create Library</h2>
          <CreateLibraryForm
            onSuccess={() => {
              setShowCreateForm(false)
              void fetchLibraries()
            }}
            // onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* Edit panel */}
      {editingLibrary && (
        <div className={styles.editPanel}>
          <div className={styles.editPanelHeader}>
            <h2 className={styles.formHeading}>Edit Library</h2>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setEditingLibrary(null)}
            >
              Close
            </button>
          </div>

          <form onSubmit={handleUpdate}>
            <LibraryFormFields
              name={formName}
              description={formDescription}
              mediaTypes={formMediaTypes}
              onNameChange={setFormName}
              onDescriptionChange={setFormDescription}
              onToggleMediaType={toggleMediaType}
            />
            {formError && <p className={styles.error}>{formError}</p>}
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={formSaving}
              >
                {formSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* Scan schedule section */}
          <div className={styles.sourcesSection}>
            <h3 className={styles.sourcesSectionHeading}>Scan Schedule</h3>

            <form onSubmit={handleSaveSchedule} className={styles.scheduleForm}>
              <div className={styles.scheduleRow}>
                <label className={styles.scheduleLabel}>
                  Schedule
                  <select
                    className={styles.select}
                    value={scheduleValue ?? ''}
                    onChange={(e) => setScheduleValue(e.target.value || null)}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.label} value={p.value ?? ''}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className={`${styles.checkboxLabel} ${styles.watchLabel}`}
                >
                  <input
                    type="checkbox"
                    checked={watchEnabled}
                    onChange={(e) => setWatchEnabled(e.target.checked)}
                  />
                  Watch filesystem for changes
                </label>
              </div>

              {scheduleValue && (
                <p className={styles.nextScanInfo}>
                  Next scan: {getNextScanTime(scheduleValue) ?? '—'}
                </p>
              )}

              {scheduleError && <p className={styles.error}>{scheduleError}</p>}

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={scheduleSaving}
                >
                  {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>

          {/* Data sources section */}
          <div className={styles.sourcesSection}>
            <h3 className={styles.sourcesSectionHeading}>Data Sources</h3>
            {editingLibrary.dataSources?.length === 0 && (
              <p className={styles.emptyMsg}>No data sources added yet.</p>
            )}

            <form onSubmit={handleAddSource} className={styles.addSourceForm}>
              <h4 className={styles.addSourceHeading}>Add Data Source</h4>
              <div className={styles.addSourceRow}>
                <select
                  className={styles.select}
                  value={newSourceType}
                  onChange={(e) =>
                    setNewSourceType(e.target.value as 'local' | 'network')
                  }
                >
                  <option value="local">Local</option>
                  <option value="network">Network</option>
                </select>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="/path/to/media"
                  value={newSourcePath}
                  onChange={(e) => setNewSourcePath(e.target.value)}
                  required
                />
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={newSourceRecursive}
                    onChange={(e) => setNewSourceRecursive(e.target.checked)}
                  />
                  Recursive
                </label>
                <button
                  type="submit"
                  className={styles.addBtn}
                  disabled={addingSource}
                >
                  {addingSource ? 'Adding...' : 'Add'}
                </button>
              </div>
              {sourceError && <p className={styles.error}>{sourceError}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Library list */}
      {libraries.length === 0 && !showCreateForm && (
        <div className={styles.empty}>
          <p>No libraries yet. Create one to get started.</p>
        </div>
      )}
      <div className={styles.libraryList}>
        {libraries.map((lib) => (
          <div key={lib.id} className={styles.libraryCard}>
            <div className={styles.libraryCardMain}>
              <div>
                {/* <p className={styles.libraryName}>{lib.name}</p>
                {lib.description && (
                  <p className={styles.libraryDescription}>{lib.description}</p>
                )}
                <p className={styles.libraryMeta}>
                  {lib.mediaCategories.join(', ') || 'All media types'}
                </p>
                <div className={styles.libraryScanMeta}>
                  {lib.scanSchedule && (
                    <span className={styles.scheduleTag}>
                      {SCHEDULE_PRESETS.find(
                        (p) => p.value === lib.scanSchedule,
                      )?.label ?? lib.scanSchedule}
                    </span>
                  )}
                  {lib.watchEnabled && (
                    <span className={styles.watchTag}>Watching</span>
                  )}
                  {lib.lastScanResult && (
                    <span
                      className={`${styles.lastScanTag} ${
                        lib.lastScanResult === 'failed'
                          ? styles.scanResultFailed
                          : ''
                      }`}
                    >
                      Last: {lib.lastScanResult}
                      {lib.lastScanDuration !== null &&
                        lib.lastScanDuration !== undefined &&
                        ` (${formatDuration(lib.lastScanDuration)})`}
                    </span>
                  )}
                </div> */}
              </div>
              <div className={styles.libraryCardActions}>
                {scanMessages[lib.id] && (
                  <span className={styles.scanMsg}>{scanMessages[lib.id]}</span>
                )}
                <Button
                  onClick={() => handleScan(lib.id)}
                  disabled={scanningIds.has(lib.id)}
                >
                  {scanningIds.has(lib.id) ? 'Starting...' : 'Scan'}
                </Button>
                <Button onClick={() => openEditForm(lib)}>Edit</Button>
                {deleteConfirmId === lib.id ? (
                  <span className={styles.deleteConfirm}>
                    <span>Delete?</span>
                    <button
                      type="button"
                      className={styles.confirmDeleteBtn}
                      onClick={() => handleDelete(lib.id)}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={styles.cancelDeleteBtn}
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => setDeleteConfirmId(lib.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface LibraryFormFieldsProps {
  name: string
  description: string
  mediaTypes: string[]
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onToggleMediaType: (t: string) => void
}

function LibraryFormFields({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: LibraryFormFieldsProps) {
  return (
    <div className={styles.formFields}>
      <label className={styles.fieldLabel}>
        Name
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          placeholder="My Movies"
        />
      </label>
      <label className={styles.fieldLabel}>
        Description
        <input
          type="text"
          className={styles.input}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Optional description"
        />
      </label>
    </div>
  )
}
