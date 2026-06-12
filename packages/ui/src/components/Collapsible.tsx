import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, ReactNode } from 'react'

type CollapsibleProps = HTMLAttributes<HTMLDetailsElement> & {
  title: string
  children: ReactNode
}

const styles = css`
  .details {
    &::details-content {
      opacity: 0;
      height: 0;
      overflow: hidden;

      transition: height 0.4s ease, opacity 0.4s ease;
      transition-behavior: allow-discrete;
    }

    &[open]::details-content {
      opacity: 1;
      height: auto;
    }
  }
`

export default function Collapsible({
  className,
  title,
  children,
  ...props
}: CollapsibleProps) {
  return (
    <details className={clsx(styles.details, className)} {...props}>
      <summary>{title}</summary>
      {children}
    </details>
  )
}
