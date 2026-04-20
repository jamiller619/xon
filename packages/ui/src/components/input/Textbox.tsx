import { Input } from '@base-ui/react'
import clsx from 'clsx'
import styles from './Textbox.module.css'

export default function Textbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input type="text" className={clsx(styles.textbox, className)} {...props} />
  )
}
