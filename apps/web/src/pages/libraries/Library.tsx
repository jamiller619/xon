import { useQuery } from '@tanstack/react-query'
import type { Library } from '@xon/shared'
import { useParams } from 'react-router-dom'
import { apiFetch } from '~/lib/apiFetch'
import Page from '../Page'
import styles from './Library.module.css'
import { LIBRARY_TYPE_VIEWS } from './LibraryTypeView'

export default function LibraryBrowser() {
  const { id } = useParams<{ id: string }>()
  const {
    data: library,
    error,
    isPending,
  } = useQuery<Library>({
    queryKey: ['library', id],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(`/api/libraries/${id}`, { signal })
      if (!response.ok) throw new Error('Failed to load library')
      return response.json()
    },
    enabled: !!id,
  })

  if (!id) return <LibraryRouteError>Library is unavailable</LibraryRouteError>
  if (isPending) return <Page>Loading library…</Page>
  if (error || !library) {
    return <LibraryRouteError>Failed to load library</LibraryRouteError>
  }

  const LibraryView =
    LIBRARY_TYPE_VIEWS[library.type as keyof typeof LIBRARY_TYPE_VIEWS]
  if (!LibraryView) {
    return <LibraryRouteError>Unsupported library type</LibraryRouteError>
  }

  return <LibraryView library={library} />
}

function LibraryRouteError({ children }: { children: React.ReactNode }) {
  return (
    <Page>
      <div className={styles.error} role="alert">
        {children}
      </div>
    </Page>
  )
}
