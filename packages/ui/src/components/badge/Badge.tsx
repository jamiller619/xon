import clsx from 'clsx'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import Tooltip from '../tooltip/Tooltip.jsx'
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
    <Tooltip content={String(children)}>
      <div
        className={clsx(styles.badge, className, variant && styles[variant])}
        {...props}
      >
        {children}
      </div>
    </Tooltip>
  )
}
