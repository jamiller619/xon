import { Input } from '@base-ui/react'
import clsx from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './Textbox.module.css'

type TextboxProps = InputHTMLAttributes<HTMLInputElement> & {
  startIcon?: ReactNode
  endIcon?: ReactNode
}

export default function Textbox({
  className,
  startIcon,
  endIcon,
  ...props
}: TextboxProps) {
  return (
    <div
      className={clsx(
        styles.container,
        startIcon && styles.start,
        endIcon && styles.end,
      )}
    >
      {startIcon && <div className={styles.icon}>{startIcon}</div>}
      <Input {...props} className={clsx(styles.textbox, className)}></Input>
      {endIcon && endIcon}
    </div>
  )
}
