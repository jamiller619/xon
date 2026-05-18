import { Button as UIButton } from '@base-ui/react'
import clsx from 'clsx'
import { motion } from 'motion/react'
import type {
  ComponentPropsWithoutRef,
  PropsWithChildren,
  ReactNode,
} from 'react'
import type { Variant } from '../types.js'
import styles from './Button.module.css'

export type ButtonVariant = Variant | 'block'

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant
  size?: 'small'
}

const CustomButton = ({
  children,
  ref,
  ...props
}: PropsWithChildren<UIButton.Props>) => {
  return (
    <UIButton ref={ref} {...props}>
      {children}
    </UIButton>
  )
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const AnimatedButton = motion.create(CustomButton as any)

export default function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <AnimatedButton
      type="button"
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
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
