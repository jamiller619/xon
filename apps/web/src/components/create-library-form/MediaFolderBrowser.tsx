import { Dialog as BaseDialog } from '@base-ui/react'
import { Button, Flex, ScrollArea, Textbox } from '@xon/ui'
import { useEffect, useState } from 'react'
import { apiFetch } from '~/lib/apiFetch'
import styles from './CreateLibraryForm.module.css'

interface BrowseResult {
  path: string
  entries: { name: string; path: string }[]
}

export default function MediaFolderBrowser({
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
        <Button
          disabled={currentPath === '/'}
          onClick={() => setCurrentPath(parentPath(currentPath))}
          title="Go up"
        >
          ⮤
        </Button>
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
