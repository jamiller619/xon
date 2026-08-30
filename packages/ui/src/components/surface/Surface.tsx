import clsx from 'clsx'
import type { ElementType } from 'react'
import type { BorderRadius, PolymorphicProps } from '../types.js'
import styles from './Surface.module.css'

export type SurfaceProps<T extends ElementType = 'div'> = PolymorphicProps<
  T,
  {
    borderRadius?: BorderRadius
    transparent?: boolean
  }
>

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
