import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import surfaceStyles from '../surface/Surface.module.css'
import type { Variant } from '../types.js'
import styles from './Button.module.css'

export type ButtonProps = UIButton.Props & {
  variant?: Variant | undefined
  size?: 'small' | 'large' | undefined
  block?: boolean | undefined
}

export default function Button({
  className,
  variant,
  size,
  block = false,
  ...props
}: ButtonProps) {
  return (
    <UIButton
      type="button"
      {...props}
      className={clsx(
        styles.button,
        surfaceStyles.surface,
        className,
        variant && styles[variant],
        {
          [styles.large as string]: size === 'large',
          [styles.small as string]: size === 'small',
          [styles.block as string]: block,
        },
      )}
    />
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
