import clsx from 'clsx'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import styles from './Skeleton.module.css'

export type SkeletonProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'aria-hidden'
> & {
  aspectRatio?: CSSProperties['aspectRatio']
}

export default function Skeleton({
  aspectRatio,
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={clsx(styles.skeleton, className)}
      style={aspectRatio ? { aspectRatio, ...style } : style}
    />
  )
}
