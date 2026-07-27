import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import type { Size, Variant } from './types.js'

const styles = css`
  .badge {
    display: inline-block;
    padding: var(--space-2xs) var(--space-sm);
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
      background: var(--color-accent-3);
    }

    &.ghost {
      background-color: transparent;
      backdrop-filter: blur(3px);
      outline: 1px solid var(--color-gray-11);
      outline-offset: -1px;
    }

    &.small {
      font-size: var(--text-xs);
    }
  }
`

type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  variant?: Variant
  size?: Size
}

export default function Badge({
  children,
  className,
  variant,
  size,
  ...props
}: BadgeProps) {
  return (
    <div
      className={clsx(
        styles.badge,
        className,
        variant && styles[variant],
        size && styles[size],
      )}
      {...props}
    >
      {children}
    </div>
  )
}
