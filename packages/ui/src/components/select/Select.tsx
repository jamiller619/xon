import clsx from 'clsx'
import type { SelectHTMLAttributes } from 'react'
import type { Variant } from '../types.js'
import styles from './Select.module.css'

// Native `size` (visible row count) is dropped: it turns the select into an
// inline listbox, which this component doesn't style. `size` here matches
// Button's size prop instead.
export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size'
> & {
  variant?: Variant | undefined
  size?: 'small' | 'large' | undefined
  block?: boolean | undefined
}

/**
 * A native `<select>` dressed like Button. All behavior (opening, keyboard
 * navigation, selection, form participation) is the browser's; the dropdown
 * itself is styled via the customizable-select CSS (`appearance: base-select`
 * and `::picker(select)`) where supported, falling back to a styled trigger
 * with the platform-native picker elsewhere.
 *
 * Pass plain `<option>`/`<optgroup>` elements as children.
 */
export default function Select({
  className,
  variant,
  size,
  block = false,
  children,
  ...props
}: SelectProps) {
  return (
    <select
      {...props}
      className={clsx(styles.select, className, variant && styles[variant], {
        [styles.small as string]: size === 'small',
        [styles.large as string]: size === 'large',
        [styles.block as string]: block,
      })}
    >
      {children}
    </select>
  )
}
