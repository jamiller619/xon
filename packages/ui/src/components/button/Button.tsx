import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Variant } from '../types.js'
import styles from './Button.module.css'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'small'
}

export default function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <UIButton
      type="button"
      {...props}
      className={clsx(styles.button, className, variant && styles[variant], {
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        [styles.small!]: size === 'small',
      })}
    />
  )
}

type IconButtonProps = ButtonProps & {
  children: ReactNode
}

export function IconButton({
  children,
  className,
  variant,
  ...props
}: IconButtonProps) {
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
