import clsx from 'clsx'
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  HTMLAttributes,
} from 'react'
import styles from './Card.module.css'

export type CardProps<T extends ElementType = 'div'> = {
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, 'as'>

export default function Card<T extends ElementType = 'div'>({
  as,
  className,
  ...props
}: CardProps<T>) {
  const Component = as ?? 'div'

  return <Component className={clsx(styles.card, className)} {...props} />
}

type ThumbProps = HTMLAttributes<HTMLDivElement> & {
  /** CSS aspect-ratio of the image area, e.g. "4 / 3". Defaults to 5 / 7. */
  aspectRatio?: CSSProperties['aspectRatio']
}

Card.Thumb = function Thumb({
  aspectRatio,
  className,
  style,
  ...props
}: ThumbProps) {
  return (
    <div
      className={clsx(styles.thumb, className)}
      style={aspectRatio ? { aspectRatio, ...style } : style}
      {...props}
    />
  )
}

Card.Info = function Info({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(styles.info, className)} {...props} />
}

Card.Title = function Title({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={clsx(styles.title, className)} {...props} />
}

Card.Meta = function Meta({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(styles.meta, className)} {...props} />
}
