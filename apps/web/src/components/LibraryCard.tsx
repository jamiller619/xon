import {
  ImageEdit16Regular as ImageEditIcon,
  ArrowSyncRegular as RefreshIcon,
  FolderSearchRegular as ScanIcon,
} from '@fluentui/react-icons'
import type { Library } from '@xon/shared'
import { Card, ContextMenu, Dialog } from '@xon/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import useLibraryThumbnail from '~/hooks/useLibraryThumbnail'
import { apiPost } from '~/lib/apiFetch'
import { useRefreshMetadataConfirmation } from './confirmation/ConfirmationProvider'
import EditImages from './EditImages'

const styles = css`
  .library {
    min-width: 250px;
  }

  .libraryThumbnailBackdrop {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;

    &::before {
      content: "";
      position: absolute;
      z-index: 1;
      inset: 0;
      background-image: linear-gradient(45deg, black, transparent);
    }
  }

  .libraryThumbnailImg {
    display: block;
    position: absolute;
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
`

type LibraryCardProps = {
  data: Omit<Library, 'createdAt' | 'updatedAt'> & {
    createdAt: Date | string
    updatedAt: Date | string | null
  }
  withLink?: boolean
}

export default function LibraryCard({ data, withLink }: LibraryCardProps) {
  const confirmRefresh = useRefreshMetadataConfirmation()
  const [editImagesOpen, setEditImagesOpen] = useState(false)
  const thumbnailURL = useLibraryThumbnail(data)

  const cardContent = (
    <>
      <Card.Thumb aspectRatio="4 / 3">
        <span className={styles.libraryThumbnailBackdrop}>
          <img
            src={thumbnailURL}
            alt=""
            loading="lazy"
            decoding="async"
            className={styles.libraryThumbnailImg}
            onLoad={(e) => {
              e.currentTarget.style.display = ''
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </span>
      </Card.Thumb>
      <Card.Info>
        <Card.Title>{data.name}</Card.Title>
      </Card.Info>
    </>
  )

  return (
    <>
      <ContextMenu
        items={[
          {
            label: 'Scan library',
            icon: <ScanIcon />,
            onClick: () => apiPost(`/api/libraries/${data.id}/scan`),
          },
          {
            label: 'Edit images',
            icon: <ImageEditIcon />,
            onClick: () => setEditImagesOpen(true),
          },
          {
            label: 'Refresh metadata',
            icon: <RefreshIcon />,
            onClick: () =>
              confirmRefresh(() =>
                apiPost(`/api/libraries/${data.id}/scan/refresh`),
              ),
          },
        ]}
        key={data.id}
      >
        {withLink ? (
          <Card
            as={Link}
            to={`/libraries/${data.id}`}
            key={data.id}
            className={styles.library}
          >
            {cardContent}
          </Card>
        ) : (
          <Card key={data.id} className={styles.library}>
            {cardContent}
          </Card>
        )}
      </ContextMenu>
      <Dialog
        open={editImagesOpen}
        onOpenChange={setEditImagesOpen}
        title={`${data.name}: Edit images`}
      >
        <EditImages library={data} />
      </Dialog>
    </>
  )
}
