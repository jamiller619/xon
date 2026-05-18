import { Progress as UIProgress } from '@base-ui/react'
import clsx from 'clsx'
import styles from './Progress.module.css'

export default function Progress({
  value,
  className,
  ...props
}: UIProgress.Root.Props) {
  return (
    <UIProgress.Root
      value={value}
      className={clsx(styles.container, className)}
      {...props}
    >
      <UIProgress.Track className={styles.track}>
        <UIProgress.Indicator className={styles.indicator} />
      </UIProgress.Track>
    </UIProgress.Root>
  )
}
