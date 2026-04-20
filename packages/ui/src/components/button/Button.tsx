import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import styles from './Button.module.css'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
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
