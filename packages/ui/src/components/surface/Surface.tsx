import clsx from 'clsx'
import type { ComponentPropsWithoutRef, ElementType } from 'react'
import type { BorderRadius } from '../types.js'
import styles from './Surface.module.css'

export type SurfaceProps<T extends ElementType = 'div'> = {
  as?: T
  borderRadius?: BorderRadius
  transparent?: boolean
} & Omit<ComponentPropsWithoutRef<T>, 'as'>

export default function Surface<T extends ElementType = 'div'>({
  as,
  className,
  borderRadius,
  transparent,
  ...props
}: SurfaceProps<T>) {
  const Component = as ?? 'div'

  return (
    <Component
      className={clsx(
        styles.surface,
        transparent && styles.transparent,
        className,
        borderRadius ? styles[borderRadius] : styles.medium,
      )}
      {...props}
    />
  )
}
