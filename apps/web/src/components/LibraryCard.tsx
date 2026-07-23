import {
  ArrowSyncRegular as RefreshIcon,
  FolderSearchRegular as ScanIcon,
} from '@fluentui/react-icons'
import type { Library } from '@xon/shared'
import { Card, ContextMenu } from '@xon/ui'
import { css } from 'inline-css-modules'
import { Link } from 'react-router-dom'
import { apiPost } from '~/lib/apiFetch'
import { useScanStore } from '~/store/scanStore'
import { useRefreshMetadataConfirmation } from './confirmation/ConfirmationProvider'

const styles = css`
  .library {
    min-width: 250px;
  }

  /* The 3D-tilted backdrop needs its perspective on the thumb (its parent) */
  .libraryThumb {
    perspective: 1000px;
  }

  .libraryThumbnailBackdrop {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    transform: rotateX(20deg) rotateY(-10deg) scale(1.5);

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
  data: Library
  withLink?: boolean
}

export default function LibraryCard({ data, withLink }: LibraryCardProps) {
  const confirmRefresh = useRefreshMetadataConfirmation()
  const scanCompletedAt = useScanStore((s) => s.completedAt)
  const cardProps = withLink ? { as: Link, to: `/libraries/${data.id}` } : {}

  return (
    <ContextMenu
      items={[
        {
          label: 'Scan library',
          icon: <ScanIcon />,
          onClick: () => apiPost(`/api/libraries/${data.id}/scan`),
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
      <Card {...cardProps} key={data.id} className={styles.library}>
        <Card.Thumb aspectRatio="4 / 3" className={styles.libraryThumb}>
          <span className={styles.libraryThumbnailBackdrop}>
            <img
              src={`/api/libraries/${data.id}/thumbnail${
                scanCompletedAt[data.id] ? `?v=${scanCompletedAt[data.id]}` : ''
              }`}
              alt=""
              loading="lazy"
              decoding="async"
              className={styles.libraryThumbnailImg}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </span>
        </Card.Thumb>
        <Card.Info>
          <Card.Title>{data.name}</Card.Title>
        </Card.Info>
      </Card>
    </ContextMenu>
  )
}
