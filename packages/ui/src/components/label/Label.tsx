import styles from './Label.module.css'
import clsx from 'clsx'

export default function Label({
  children,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl:
    <label {...props} className={clsx(styles.label, className)}>
      {children}
    </label>
  )
}
