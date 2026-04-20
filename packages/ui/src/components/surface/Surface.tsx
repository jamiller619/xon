import type { HTMLAttributes, PropsWithChildren } from 'react'
import clsx from 'clsx'
import styles from './Surface.module.css'

export type SurfaceProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export default function Surface({
  children,
  className,
  ...props
}: SurfaceProps) {
  return (
    <div className={clsx(styles.surface, className)} {...props}>
      {children}
    </div>
  )
}
