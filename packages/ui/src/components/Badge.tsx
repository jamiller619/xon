import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import Tooltip from './tooltip/Tooltip.js'
import type { Variant } from './types.js'

const styles = css`
  .badge {
    display: inline-block;
    padding: var(--space-2xs) var(--space-xs);
    background: var(--color-accent-3);
    border-radius: var(--border-radius-3);
    corner-shape: var(--corner-shape);
    font-weight: 500;
    color: var(--color-accent-12);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.primary {
      background: var(--color-accent-5);
    }
  }
`

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
