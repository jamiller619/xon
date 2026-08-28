import { useQuery } from '@tanstack/react-query'
import type { Library, MediaItem } from '@xon/shared'
import { Button, Dialog } from '@xon/ui'
import { useSearchParams } from 'react-router-dom'
import { useRefreshMetadataConfirmation } from '~/components/confirmation/ConfirmationProvider'
import { getEditImagesTarget } from '~/components/dialog-router/dialogRoute'
import EditImages from '~/components/EditImages'
import { useRefreshMetadata } from '~/hooks/useLibraries'
import { apiFetch, getAPIError } from '~/lib/apiFetch'
import Icons from '~/lib/icons'

type EditImagesDialogProps = {
  onClose: () => void
}

type LibraryImageTarget = Pick<Library, 'id' | 'images' | 'name'>
type ImageTarget = MediaItem | LibraryImageTarget

export default function EditImagesDialog({ onClose }: EditImagesDialogProps) {
  const [searchParams] = useSearchParams()
  const target = getEditImagesTarget(searchParams)
  const confirmRefresh = useRefreshMetadataConfirmation()
  const { data, error, isPending } = useQuery<ImageTarget>({
    queryKey:
      target?.type === 'media'
        ? ['mediaById', { id: target.id }]
        : ['library', target?.id],
    queryFn: async ({ signal }) => {
      if (target === null) throw new Error('No image target was provided')
      const endpoint =
        target.type === 'media'
          ? `/api/media/${encodeURIComponent(target.id)}`
          : `/api/libraries/${encodeURIComponent(target.id)}`
      const response = await apiFetch(endpoint, { signal })
      if (!response.ok) {
        throw new Error(
          await getAPIError(response, 'Could not load the image target'),
        )
      }
      return response.json()
    },
    enabled: target !== null,
  })

  const mediaItem = target?.type === 'media' ? (data as MediaItem) : undefined
  const library =
    target?.type === 'library' ? (data as LibraryImageTarget) : undefined
  const metadataRefresh = useRefreshMetadata(
    mediaItem?.libraryId,
    mediaItem?.id,
  )
  const title = mediaItem?.title ?? library?.name

  function refreshMetadata() {
    if (!mediaItem) return
    confirmRefresh(() => metadataRefresh.mutate())
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title ? `${title}: Edit images` : 'Edit images'}
      headerActions={
        mediaItem ? (
          <Button
            size="small"
            loading={metadataRefresh.isRunning}
            disabled={metadataRefresh.isRunning}
            onClick={refreshMetadata}
          >
            <Icons.RefreshMetadata aria-hidden="true" />
            Refresh Metadata
          </Button>
        ) : undefined
      }
    >
      {target === null ? (
        <p role="alert">Choose a media item or library to edit images for.</p>
      ) : isPending ? (
        <p>Loading images…</p>
      ) : error || !data ? (
        <p role="alert">{error?.message ?? 'Could not load images'}</p>
      ) : mediaItem ? (
        <EditImages key={`media:${mediaItem.id}`} item={mediaItem} />
      ) : library ? (
        <EditImages key={`library:${library.id}`} library={library} />
      ) : null}
    </Dialog>
  )
}
