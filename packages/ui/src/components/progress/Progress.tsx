import { Progress as UIProgress } from '@base-ui/react'
import clsx from 'clsx'
import type { Variant } from '../types.js'
import styles from './Progress.module.css'

type ProgressProps = UIProgress.Root.Props & {
  animated?: boolean
  variant?: Variant
}

export default function Progress({
  animated = false,
  value,
  className,
  variant,
  ...props
}: ProgressProps) {
  return (
    <UIProgress.Root
      value={value}
      className={clsx(styles.container, className, {
        [styles.animated as string]: animated,
        [styles[variant ?? ''] as string]: variant,
      })}
      {...props}
    >
      <UIProgress.Track className={styles.track}>
        <UIProgress.Indicator className={styles.indicator} />
      </UIProgress.Track>
    </UIProgress.Root>
  )
}
