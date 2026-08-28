import clsx from 'clsx'
import { css } from 'inline-css-modules'
import FilterHeader from '~/components/FilterHeader'
import Page from '~/pages/Page'
import { useAppStore } from '~/store/appStore'
import libraryStyles from '../Library.module.css'

type LibraryViewLayoutProps = {
  title: string
  stats?: string[]
  controls?: React.ReactNode
  error?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
}

const styles = css`
  .selectMode {
    a {
      img {
        /* transition: filter 500ms ease-in-out; */
        filter: grayscale(90%) brightness(0.6);
      }

      &:hover {
        div:first-child {
          transform: none;
        }
      }
    }
  }

  .withFooter {
    padding-block-end: calc(var(--space-xl) + var(--space-md));
  }

  .footer {
    position: fixed;
    right: var(--space-lg);
    bottom: calc(var(--audio-player-height, 0px) + var(--space-md));
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
  }
`

export default function LibraryViewLayout({
  title,
  stats,
  controls,
  error,
  footer,
  children,
}: LibraryViewLayoutProps) {
  const isSelectMode = useAppStore(({ isSelectMode }) => isSelectMode)

  return (
    <Page
      className={clsx({
        [styles.selectMode as string]: isSelectMode,
        [styles.withFooter as string]: Boolean(footer),
      })}
    >
      <FilterHeader title={title} {...(stats ? { stats } : {})}>
        {controls}
      </FilterHeader>
      {error && (
        <div className={libraryStyles.error} role="alert">
          {error}
        </div>
      )}
      {children}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </Page>
  )
}
