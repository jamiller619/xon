import clsx from 'clsx'
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import styles from './Tooltip.module.css'

type TooltipProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export default function Tooltip({
  content,
  side = 'top',
  children,
  className,
  ...props
}: TooltipProps) {
  return (
    <span className={clsx(styles.trigger, className)} {...props}>
      {children}
      <span role="tooltip" className={clsx(styles.tooltip, styles[side])}>
        {content}
      </span>
    </span>
  )
}
