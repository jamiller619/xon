import { ScrollArea as UIScrollArea } from '@base-ui/react'
import type { ReactNode } from 'react'
import styles from './ScrollArea.module.css'

type ScrollAreaProps = UIScrollArea.Root.Props & {
  children: ReactNode
}

export default function ScrollArea({ children, ...props }: ScrollAreaProps) {
  return (
    <UIScrollArea.Root {...props}>
      <UIScrollArea.Viewport className={styles.viewport}>
        <UIScrollArea.Content>{children}</UIScrollArea.Content>
      </UIScrollArea.Viewport>
      <UIScrollArea.Scrollbar
        orientation="vertical"
        className={styles.scrollbar}
      >
        <UIScrollArea.Thumb className={styles.thumb} />
      </UIScrollArea.Scrollbar>
      <UIScrollArea.Corner />
    </UIScrollArea.Root>
  )
}
