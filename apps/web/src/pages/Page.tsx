import { Flex } from '@xon/ui'
import { css } from 'inline-css-modules'

const styles = css`
  .page {
    padding: var(--space-md);
  }

  .title {
    flex: none;
    margin: 0;
    padding-block: var(--space-sm);
    font-size: var(--text-2xl);
    font-weight: 500;
  }
`

export default function Page({ children }: { children: React.ReactNode }) {
  return (
    <Flex dir="col" gap="4" className={styles.page}>
      {children}
    </Flex>
  )
}

Page.Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className={styles.title}>{children}</h1>
)
