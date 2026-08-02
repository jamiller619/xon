import { FolderAdd20Regular as AddLibraryIcon } from '@fluentui/react-icons'
import { Button, Flex } from '@xon/ui'
import { css } from 'inline-css-modules'
import CreateLibraryButton from '~/components/CreateLibraryButton'
import LibraryCard from '~/components/LibraryCard'
import useLibraries from '~/hooks/useLibraries'
import Page from '~/pages/Page'

const styles = css`
  header {
    display: flex;
    gap: var(--space-md);
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
      <Flex gap="3">
        {libraries?.map((library) => (
          <LibraryCard key={library.id} data={library} />
        ))}
      </Flex>
    </Page>
  )
}
