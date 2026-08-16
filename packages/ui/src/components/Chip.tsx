import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, PropsWithChildren } from 'react'
import type { Size, Variant } from './types.js'

const styles = css`
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--border-radius-2);
    corner-shape: var(--corner-shape);
    font-weight: 500;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    background: var(--color-gray-5);
    
    &.primary {
      color: var(--color-accent-12);
      background: var(--color-accent-7);
    }

    &.ghost {
      background-color: transparent;
      backdrop-filter: blur(3px);
      outline: 2px solid var(--color-gray-11);
      outline-offset: -2px;
    }

    &.small {
      font-size: var(--text-xs);
    }
  }
`

type ChipProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  variant?: Variant
  size?: Size
}

export default function Chip({
  children,
  className,
  variant,
  size,
  ...props
}: ChipProps) {
  return (
    <div
      className={clsx(
        styles.chip,
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
