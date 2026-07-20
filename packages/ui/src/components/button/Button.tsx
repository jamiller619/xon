import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import { useFormStatus } from 'react-dom'
import surfaceStyles from '../surface/Surface.module.css'
import type { Size, Variant } from '../types.js'
import styles from './Button.module.css'

export type ButtonProps = UIButton.Props & {
  variant?: Variant | undefined
  size?: Size | undefined
  block?: boolean | undefined
  /**
   * Force the loading spinner on. When omitted, a `type="submit"` button
   * automatically shows the spinner while its parent form's action is pending
   * (via React's `useFormStatus`). Pass this for forms that don't use a React
   * form `action` (e.g. manual `onSubmit` + a mutation's `isPending`).
   */
  loading?: boolean | undefined
}

export default function Button({
  className,
  variant,
  size,
  block = false,
  loading,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus()

  // Only a submit button reflects its form's pending state. A non-submit
  // button — or one rendered outside any form — never spins on its own;
  // useFormStatus returns `pending: false` when there's no form ancestor.
  const isLoading = loading ?? (pending && type === 'submit')

  return (
    <UIButton
      type={type}
      disabled={disabled || isLoading}
      {...props}
      className={clsx(
        styles.button,
        surfaceStyles.surface,
        className,
        variant && styles[variant],
        {
          [styles.large as string]: size === 'large',
          [styles.small as string]: size === 'small',
          [styles.mini as string]: size === 'mini',
          [styles.block as string]: block,
          [styles.loading as string]: isLoading,
        },
      )}
    >
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}
      {/* Keep the label in the layout so the button doesn't resize; it's
          hidden behind the spinner while loading. */}
      <span className={styles.label}>{children}</span>
    </UIButton>
  )
}

Button.Icon = function IconButton(props: ButtonProps) {
  return (
    <Button {...props} className={clsx(styles.iconButton, props.className)} />
  )
}

export function IconButton({
  children,
  className,
  variant,
  ...props
}: ButtonProps) {
  return (
    <Button
      {...props}
      className={clsx(
        styles.iconButton,
        className,
        variant &&
          styles[variant] && {
            [styles[variant]]: true,
          },
      )}
    >
      {children}
    </Button>
  )
}
