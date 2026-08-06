import FilterHeader from '~/components/FilterHeader'
import Page from '~/pages/Page'
import styles from '../../Library.module.css'

type LibraryViewLayoutProps = {
  title: string
  stats?: string[]
  controls?: React.ReactNode
  error?: React.ReactNode
  children?: React.ReactNode
}

export default function LibraryViewLayout({
  title,
  stats,
  controls,
  error,
  children,
}: LibraryViewLayoutProps) {
  return (
    <Page>
      <FilterHeader title={title} {...(stats ? { stats } : {})}>
        {controls}
      </FilterHeader>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {children}
    </Page>
  )
}
