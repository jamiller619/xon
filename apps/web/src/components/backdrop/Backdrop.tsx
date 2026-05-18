import clsx from 'clsx'
import styles from './Backdrop.module.css'

export default function Backdrop({ className }: { className?: string }) {
  return <div className={clsx(styles.backdrop, className)}></div>
}
