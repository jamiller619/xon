import { useQuery } from '@tanstack/react-query'
import type { LibraryStats } from '@xon/shared'
import { Button } from '@xon/ui'
import prettyBytes from 'pretty-bytes'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import { useRefreshMetadata } from '~/hooks/useLibraries'
import { apiFetch } from '~/lib/apiFetch'
import Icons from '~/lib/icons'
import type { LibraryTypeViewProps } from '../../LibraryTypeView'
import MoviesView from './MoviesView'

export default function MoviesLibraryView({ library }: LibraryTypeViewProps) {
  const metadataRefresh = useRefreshMetadata(library.id)
  const confirmRefresh = useRefreshMetadataConfirmation()
  const { data: libraryStats } = useQuery<LibraryStats>({
    queryKey: ['library-stats', library.id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${library.id}/stats`, {
        signal,
      })
      if (!response.ok) throw new Error('Failed to load library stats')
      return response.json()
    },
  })
  const stats = [
    library.dataSources.length
      ? library.dataSources.map((source) => source.path).join(', ')
      : '',
    libraryStats
      ? `${libraryStats.totalItems.toLocaleString()} ${
          libraryStats.totalItems === 1 ? 'item' : 'items'
        }`
      : '',
    libraryStats ? prettyBytes(libraryStats.totalSize) : '',
  ].filter(Boolean)
  const error =
    metadataRefresh.error instanceof Error
      ? metadataRefresh.error.message
      : metadataRefresh.error
        ? 'Could not refresh library metadata'
        : undefined

  return (
    <MoviesView
      source={{ kind: 'library', id: library.id }}
      title={library.name}
      stats={stats}
      library={library}
      {...(error ? { error } : {})}
      actions={
        <Button
          loading={metadataRefresh.isRunning}
          disabled={metadataRefresh.isRunning}
          onClick={() => confirmRefresh(() => metadataRefresh.mutate())}
        >
          <Icons.RefreshMetadata />
          {metadataRefresh.isRunning
            ? 'Refreshing metadata'
            : 'Refresh metadata'}
        </Button>
      }
      emptyContent="No media in this library yet."
    />
  )
}
