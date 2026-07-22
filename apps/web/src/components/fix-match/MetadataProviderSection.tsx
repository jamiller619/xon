import { Badge, Flex, Surface } from '@xon/ui'
import styles from './FixMatchDialog.module.css'
import MetadataMatchResult from './MetadataMatchResult'
import type { MatchProviderResults, SelectedMatch } from './types'

interface MetadataProviderSectionProps {
  provider: MatchProviderResults
  selected?: SelectedMatch | undefined
  searched: boolean
  onSelect: (selected: SelectedMatch) => void
}

export default function MetadataProviderSection({
  provider,
  selected,
  searched,
  onSelect,
}: MetadataProviderSectionProps) {
  return (
    <Surface
      aria-label={provider.name}
      className={styles.provider}
      borderRadius="small"
    >
      <Flex align="center" gap="2">
        <strong>{provider.name}</strong>
        {provider.status !== 'success' && (
          <Badge size="small">{provider.status}</Badge>
        )}
      </Flex>
      {provider.status === 'error' && (
        <p className={styles.error}>{provider.error ?? 'Search failed'}</p>
      )}
      {provider.status === 'unavailable' && (
        <p className={styles.muted}>{provider.reason ?? 'Not configured'}</p>
      )}
      {searched &&
        provider.status === 'success' &&
        provider.results.length === 0 && (
          <p className={styles.muted}>No matches found.</p>
        )}
      {provider.results.length > 0 && (
        <div className={styles.results}>
          {provider.results.map((result) => (
            <MetadataMatchResult
              key={result.id}
              result={result}
              selected={
                selected?.providerId === provider.id &&
                selected.matchId === result.id
              }
              onSelect={() =>
                onSelect({ providerId: provider.id, matchId: result.id })
              }
            />
          ))}
        </div>
      )}
    </Surface>
  )
}
