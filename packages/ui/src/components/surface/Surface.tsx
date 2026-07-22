import clsx from 'clsx'
import type { ComponentPropsWithoutRef, ElementType } from 'react'
import type { BorderRadius } from '../types.js'
import styles from './Surface.module.css'

export type SurfaceProps<T extends ElementType = 'div'> = {
  as?: T
  borderRadius?: BorderRadius
} & Omit<ComponentPropsWithoutRef<T>, 'as'>

export default function Surface<T extends ElementType = 'div'>({
  as,
  className,
  borderRadius,
  ...props
}: SurfaceProps<T>) {
  const Component = as ?? 'div'

  return (
    <Component
      className={clsx(
        styles.surface,
        className,
        borderRadius ? styles[borderRadius] : styles.md,
      )}
      {...props}
    />
  )
}
