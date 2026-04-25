import clsx from 'clsx'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import type { Variant } from '../types.js'
import styles from './Badge.module.css'

type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  variant?: Variant
}

export default function Badge({
  children,
  className,
  variant,
  ...props
}: BadgeProps) {
  return (
    <div
      className={clsx(styles.badge, className, variant && styles[variant])}
      {...props}
      title={String(children)}
    >
      {children}
    </div>
  )
}
