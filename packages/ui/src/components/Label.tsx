import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { Size } from './types.js'

const styles = css`
  .label {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .small {
    font-size: var(--text-xs);
    text-transform: uppercase;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }
`

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  size?: Size
}

export default function Label({
  children,
  className,
  size,
  ...props
}: LabelProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: supplied by consumer
    <label
      {...props}
      className={clsx(styles.label, className, size && styles[size])}
    >
      {children}
    </label>
  )
}
