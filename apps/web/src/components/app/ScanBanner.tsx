import { useQuery } from '@tanstack/react-query'
import { Flex, Progress, Surface } from '@xon/ui'
import { useScanEvents } from '~/hooks/useScanEvents'
import { librariesQuery } from '~/lib/librariesApi'
import type { ScanEntry } from '~/store/scanStore'
import { useScanStore } from '~/store/scanStore'
import styles from './ScanBanner.module.css'

/**
 * Persistent notification-style banner shown whenever one or more library scans
 * are active. Displays a progress bar and the latest progress line for each
 * scan, fed live from the server over the WebSocket event stream.
 */
export default function ScanBanner() {
  // Opens the shared event stream and routes scan events into the store.
  useScanEvents()

  const scans = useScanStore((s) => s.scans)
  const { data: libraries } = useQuery(librariesQuery)

  const entries = Object.values(scans)
  if (entries.length === 0) return null

  const nameFor = (libraryId: string): string =>
    libraries?.find((l) => l.id === libraryId)?.name ?? 'Library'

  return (
    <div className={styles.stack ?? ''} aria-live="polite">
      {entries.map((entry) => (
        <ScanItem
          key={entry.libraryId}
          entry={entry}
          libraryName={nameFor(entry.libraryId)}
        />
      ))}
    </div>
  )
}

function ScanItem({
  entry,
  libraryName,
}: {
  entry: ScanEntry
  libraryName: string
}) {
  const { progress, status, summary, error } = entry

  const percent =
    progress && progress.totalFiles > 0
      ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
      : null

  // Indeterminate while still discovering (no known total yet).
  const indeterminate = !progress || progress.phase === 'discovering'

  let line: string
  if (status === 'complete' && summary) {
    line = `Done — ${summary.newItems} new, ${summary.updatedItems} updated, ${summary.removedItems} removed`
  } else if (status === 'error') {
    line = error ?? 'Scan failed'
  } else {
    line = progress?.message ?? 'Starting scan…'
  }

  return (
    <Surface className={styles.banner ?? ''} data-status={status}>
      <Flex dir="col" gap="2">
        <Flex align="center" justify="between" gap="3">
          <span className={styles.title ?? ''}>Scanning {libraryName}</span>
          {percent !== null && status === 'running' && (
            <span className={styles.percent ?? ''}>{percent}%</span>
          )}
        </Flex>
        {status === 'running' && (
          <Progress value={indeterminate ? null : percent} />
        )}
        <span className={styles.line ?? ''} title={line}>
          {line}
        </span>
      </Flex>
    </Surface>
  )
}
