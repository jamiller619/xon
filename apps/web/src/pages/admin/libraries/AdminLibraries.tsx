import {
  FolderAdd20Regular as AddLibraryIcon,
  Delete16Regular as DeleteIcon,
  Edit16Regular as EditIcon,
  Folder16Regular as FolderIcon,
  FolderSearch16Regular as ScanIcon,
} from '@fluentui/react-icons'
import type { Library } from '@xon/shared'
import { Button, Flex, Surface } from '@xon/ui'
import { css } from 'inline-css-modules'
import CreateLibraryButton from '~/components/CreateLibraryButton'
import LibraryIcon from '~/components/icons/LibraryIcon'
import useLibraries from '~/hooks/useLibraries'
import useLibraryThumbnail from '~/hooks/useLibraryThumbnail'
import Page from '~/pages/Page'

const styles = css`
  header {
    display: flex;
    gap: var(--space-md);
  }

  .library {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-md);
    gap: var(--space-xs);
    min-width: 300px;
    min-height: 180px;
    overflow: hidden;
    background-size: cover;
    filter: grayscale(1);
    
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: linear-gradient(45deg, #000000f2 40%, transparent);
      z-index: -1;
    }
  }

  .title {
    font-size: var(--text-lg);
    font-weight: 500;
  }

  .path {
    font-family: monospace;
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
  }

  .libraryIcon {
    color: var(--color-accent-9);
  }

  .muted {
    color: var(--color-text-muted);
  }
`

export default function AdminLibraries() {
  const { data: libraries, refetch } = useLibraries()

  return (
    <Page>
      <Page.Title>Manage Libraries</Page.Title>
      <header className={styles.header}>
        <CreateLibraryButton onSuccess={() => void refetch()} />
        <Button onClick={() => void console.log('test')}>
          <AddLibraryIcon />
          Scan Libraries
        </Button>
      </header>
      <Flex gap="4">
        {libraries?.map((library) => (
          <LibraryCard key={library.id} library={library} />
        ))}
      </Flex>
    </Page>
  )
}

function LibraryCard({ library }: { library: Library }) {
  const thumbnailURL = useLibraryThumbnail(library)

  return (
    <Surface
      className={styles.library}
      borderRadius="small"
      style={{ backgroundImage: `url('${thumbnailURL}')` }}
    >
      <Flex gap="2" dir="col">
        <LibraryIcon
          className={styles.libraryIcon ?? ''}
          type={library.type}
          size="large"
        />
        <h3 className={styles.title}>{library.name}</h3>
        <Flex align="start" gap="1" className={styles.muted}>
          <FolderIcon />
          <p className={styles.path}>
            {library.dataSources.map((ds) => ds.path).join(', ')}
          </p>
        </Flex>
        <Flex gap="2">
          <Button.Icon>
            <EditIcon />
          </Button.Icon>
          <Button.Icon variant="danger">
            <DeleteIcon />
          </Button.Icon>
        </Flex>
      </Flex>
    </Surface>
  )
}
