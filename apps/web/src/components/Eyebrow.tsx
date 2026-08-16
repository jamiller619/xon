import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { JSX } from 'react'

const styles = css`
  .eyebrow {
    display: block;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-style: normal;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
`

export default function Eyebrow({
  children,
  className,
  ...props
}: JSX.IntrinsicElements['span']) {
  return (
    <span className={clsx(styles.eyebrow, className)} {...props}>
      {children}
    </span>
  )
}
