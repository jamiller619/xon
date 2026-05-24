import { Input } from '@base-ui/react'
import clsx from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './Textbox.module.css'

type TextboxProps = InputHTMLAttributes<HTMLInputElement> & {
  startIcon?: ReactNode
  endIcon?: ReactNode
  block?: boolean
}

export default function Textbox({
  className,
  startIcon,
  endIcon,
  block = false,
  style,
  ...props
}: TextboxProps) {
  return (
    <div
      style={style}
      className={clsx(
        className,
        styles.container,
        block && styles.block,
        startIcon && styles.start,
        endIcon && styles.end,
      )}
    >
      {startIcon && <div className={styles.icon}>{startIcon}</div>}
      <Input {...props} className={styles.textbox}></Input>
      {endIcon && endIcon}
    </div>
  )
}
