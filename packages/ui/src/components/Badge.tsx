import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import type { Variant } from './types.js'

const styles = css`
  .badge {
    display: inline-block;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--border-radius-3);
    corner-shape: var(--corner-shape);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    background: var(--color-gray-5);
    color: var(--color-text);
    
    &.primary {
      color: var(--color-accent-12);
      background: var(--color-accent-4);
    }

    &.ghost {
      background-color: transparent;
      backdrop-filter: blur(8px);
      outline: 2px solid var(--color-gray-8);
      outline-offset: -2px;
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
    <div
      className={clsx(styles.badge, className, variant && styles[variant])}
      {...props}
    >
      {children}
    </div>
  )
}
