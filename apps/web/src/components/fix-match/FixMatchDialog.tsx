import { useQuery } from '@tanstack/react-query'
import type { MediaItem } from '@xon/shared'
import { Button, Dialog, Flex, ScrollArea } from '@xon/ui'
import { useMemo, useState } from 'react'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import CurrentMatchSummary from './CurrentMatchSummary'
import styles from './FixMatchDialog.module.css'
import MatchSearchField from './MatchSearchField'
import MetadataProviderSection from './MetadataProviderSection'
import type {
  MatchProvider,
  MatchProviderResults,
  SelectedMatch,
} from './types'
import { useApplyMetadataMatch } from './useApplyMetadataMatch'
import { useMetadataMatchSearch } from './useMetadataMatchSearch'

interface FixMatchDialogProps {
  item: MediaItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

function initialQuery(item: MediaItem): string {
  if (item.title.trim()) return item.title.trim()
  const filename = item.filePath.split(/[\\/]/).at(-1) ?? ''
  return filename.replace(/\.[^.]+$/, '')
}

export default function FixMatchDialog({
  item,
  open,
  onOpenChange,
}: FixMatchDialogProps) {
  const [query, setQuery] = useState(() => initialQuery(item))
  const [selected, setSelected] = useState<SelectedMatch>()
  const providersQuery = useQuery({
    queryKey: ['match-providers', item.id],
    enabled: open,
    queryFn: async () => {
      const response = await apiFetch(`/api/media/${item.id}/match-providers`)
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not load metadata providers'),
        )
      }
      return response.json() as Promise<MatchProvider[]>
    },
  })
  const providers = providersQuery.data ?? []
  const search = useMetadataMatchSearch(item.id)
  const applyMatch = useApplyMetadataMatch(item.id, item.libraryId)

  const providerResults = useMemo(() => {
    const displayResults =
      search.results ??
      providers.map(
        (provider): MatchProviderResults => ({
          ...provider,
          status: provider.available ? 'success' : 'unavailable',
          results: [],
        }),
      )
    return displayResults
  }, [providers, search.results])

  async function applySelected() {
    if (!selected) return
    const result = await applyMatch.mutateAsync(selected)
    if (result.warnings.length === 0) onOpenChange(false)
  }

  const error =
    search.error ??
    (providersQuery.error instanceof Error
      ? providersQuery.error.message
      : undefined) ??
    (applyMatch.error instanceof Error ? applyMatch.error.message : undefined)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${item.title}: Fix match`}
    >
      <div className={styles.dialog}>
        <CurrentMatchSummary item={item} />
        <MatchSearchField
          query={query}
          onQueryChange={setQuery}
          onSearch={() => {
            setSelected(undefined)
            void search.search(query.trim())
          }}
          isSearching={search.isSearching}
        />
        {error && <p className={styles.error}>{error}</p>}
        {applyMatch.data?.warnings.map((warning) => (
          <p className={styles.warning} key={warning.providerId}>
            {warning.providerId}: {warning.error}
          </p>
        ))}
        <ScrollArea className={styles.providerScroll}>
          {providersQuery.isPending && <p>Loading metadata providers…</p>}
          {!providersQuery.isPending && providers.length === 0 && (
            <p className={styles.muted}>No metadata providers are available.</p>
          )}
          {search.results == null && providers.length > 0 && (
            <p className={styles.muted}>Review the title, then click Search.</p>
          )}
          {providerResults.map((provider) => (
            <MetadataProviderSection
              key={provider.id}
              provider={provider}
              selected={selected}
              searched={search.results != null}
              onSelect={setSelected}
            />
          ))}
        </ScrollArea>
        <Flex justify="end" gap="2" className={styles.actions}>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected}
            loading={applyMatch.isPending}
            onClick={() => void applySelected()}
          >
            Apply match
          </Button>
        </Flex>
      </div>
    </Dialog>
  )
}
