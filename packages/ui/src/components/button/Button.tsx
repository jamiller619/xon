import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import { createElement, type ElementType } from 'react'
import { useFormStatus } from 'react-dom'
import surfaceStyles from '../surface/Surface.module.css'
import type {
  BorderRadius,
  PolymorphicPropsWithRef,
  Size,
  Variant,
} from '../types.js'
import styles from './Button.module.css'

type ButtonOwnProps = {
  /** Low-level Base UI render override. Prefer `as` for polymorphic rendering. */
  render?: UIButton.Props['render']
  variant?: Variant | 'link' | 'chip' | undefined
  size?: Size | undefined
  block?: boolean | undefined
  borderRadius?: BorderRadius
  disabled?: boolean | undefined
  focusableWhenDisabled?: boolean | undefined
  /**
   * Whether the rendered component produces a native `<button>`. This is
   * inferred for intrinsic elements; set it when `as` is a custom component
   * that ultimately renders a button.
   */
  nativeButton?: boolean | undefined
  type?: 'button' | 'submit' | 'reset' | undefined
  /**
   * Force the loading spinner on. When omitted, a `type="submit"` button
   * automatically shows the spinner while its parent form's action is pending
   * (via React's `useFormStatus`). Pass this for forms that don't use a React
   * form `action` (e.g. manual `onSubmit` + a mutation's `isPending`).
   */
  loading?: boolean | undefined
}

export type ButtonProps<T extends ElementType = 'button'> =
  PolymorphicPropsWithRef<T, ButtonOwnProps>

export default function Button<T extends ElementType = 'button'>({
  as,
  render,
  className,
  variant,
  size,
  block = false,
  loading,
  borderRadius,
  type = 'button',
  disabled,
  children,
  nativeButton,
  ...props
}: ButtonProps<T>) {
  const { pending } = useFormStatus()
  const isNativeButton = nativeButton ?? (as === undefined || as === 'button')

  // Only a submit button reflects its form's pending state. A non-submit
  // button — or one rendered outside any form — never spins on its own;
  // useFormStatus returns `pending: false` when there's no form ancestor.
  const isLoading = loading ?? (pending && type === 'submit')

  return (
    <UIButton
      type={isNativeButton ? type : undefined}
      render={as ? createElement(as) : render}
      nativeButton={isNativeButton}
      disabled={disabled || isLoading}
      {...props}
      className={clsx(
        styles.button,
        variant !== 'link' && surfaceStyles.surface,
        className,
        variant && styles[variant],
        {
          [styles.large as string]: size === 'large',
          [styles.small as string]: size === 'small',
          [styles.xsmall as string]: size === 'xsmall',
          [styles.block as string]: block,
          [styles.loading as string]: isLoading,
          [styles.borderRadiusSmall as string]: borderRadius === 'small',
          [styles.borderRadiusMedium as string]: borderRadius === 'medium',
          [styles.borderRadiusLarge as string]: borderRadius === 'large',
          [styles.borderRadiusNone as string]: borderRadius === 'none',
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

export function IconButton<T extends ElementType = 'button'>(
  props: ButtonProps<T>,
) {
  return (
    <Button {...props} className={clsx(props.className, styles.iconButton)} />
  )
}

Button.Icon = IconButton
