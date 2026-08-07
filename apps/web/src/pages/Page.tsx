import { Flex, type FlexProps } from '@xon/ui'
import clsx from 'clsx'
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

export default function Page({
  children,
  className,
  ...props
}: FlexProps<'div'>) {
  return (
    <Flex {...props} dir="col" gap="4" className={clsx(styles.page, className)}>
      {children}
    </Flex>
  )
}

Page.Title = ({ children }: { children: React.ReactNode }) => (
  <h1 className={styles.title}>{children}</h1>
)
