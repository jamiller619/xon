import {
  ImageEdit16Regular as ImageEditIcon,
  ArrowSyncRegular as RefreshIcon,
  FolderSearchRegular as ScanIcon,
} from '@fluentui/react-icons'
import type { Library } from '@xon/shared'
import { Card, ContextMenu } from '@xon/ui'
import { css } from 'inline-css-modules'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getEditImagesDialogHref } from '~/components/dialog-router/dialogRoute'
import { useRefreshMetadata, useScanLibrary } from '~/hooks/useLibraries'
import useLibraryThumbnail from '~/hooks/useLibraryThumbnail'
import ArtworkImage from './ArtworkImage'
import { useRefreshMetadataConfirmation } from './confirmation/ConfirmationProvider'

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
  const scanLibrary = useScanLibrary(data.id)
  const refreshMetadata = useRefreshMetadata(data.id)
  const location = useLocation()
  const navigate = useNavigate()
  const thumbnailURL = useLibraryThumbnail(data)
  const editImagesHref = getEditImagesDialogHref(location, {
    type: 'library',
    id: data.id,
  })

  const cardContent = (
    <>
      <Card.Thumb aspectRatio="4 / 3">
        <span className={styles.libraryThumbnailBackdrop}>
          <ArtworkImage
            src={thumbnailURL}
            alt=""
            loading="lazy"
            className={styles.libraryThumbnailImg}
          />
        </span>
      </Card.Thumb>
      <Card.Info>
        <Card.Title>{data.name}</Card.Title>
      </Card.Info>
    </>
  )

  return (
    <ContextMenu
      items={[
        {
          label: 'Scan library',
          icon: <ScanIcon />,
          onClick: () => scanLibrary.mutate(),
        },
        {
          label: 'Edit images',
          icon: <ImageEditIcon />,
          onClick: () => void navigate(editImagesHref),
        },
        {
          label: 'Refresh metadata',
          icon: <RefreshIcon />,
          onClick: () => confirmRefresh(() => refreshMetadata.mutate()),
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
  )
}
