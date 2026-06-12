import clsx from 'clsx'
import {
  type ComponentPropsWithoutRef,
  createElement,
  type ElementType,
} from 'react'
import styles from './Flex.module.css'

type FlexDirection = 'row' | 'col'
type FlexAlign =
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'baseline'
  | 'anchor-center'
type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'

type FlexOwnProps<C extends ElementType> = {
  dir?: FlexDirection
  gap?: number | string
  align?: FlexAlign
  justify?: FlexJustify
  as?: C
}

type FlexProps<C extends ElementType> = FlexOwnProps<C> &
  Omit<ComponentPropsWithoutRef<C>, keyof FlexOwnProps<C>>

export default function Flex<C extends ElementType = 'div'>({
  dir,
  gap,
  align,
  justify,
  style,
  className,
  children,
  as,
  ...props
}: FlexProps<C>) {
  const Component = as ?? 'div'

  return createElement(
    Component,
    {
      className: clsx(styles.flex, className),
      style: resolveStyle({ ...style }, dir, gap, align, justify),
      ...props,
    },
    children,
  )
}

function resolveStyle(
  styleProp?: React.CSSProperties,
  dir?: FlexDirection,
  gap?: number | string,
  align?: FlexAlign,
  justify?: FlexJustify,
): React.CSSProperties {
  const style: React.CSSProperties = styleProp ?? {}

  if (dir) {
    style.flexDirection = dir === 'row' ? 'row' : 'column'
  }

  if (gap) {
    style.gap = `var(--space-${gap})`
  }

  if (align) {
    style.alignItems = align
  }

  if (justify) {
    switch (justify) {
      case 'start':
        style.justifyContent = 'flex-start'
        break
      case 'center':
        style.justifyContent = 'center'
        break
      case 'end':
        style.justifyContent = 'flex-end'
        break
      case 'between':
        style.justifyContent = 'space-between'
        break
      case 'around':
        style.justifyContent = 'space-around'
        break
      case 'evenly':
        style.justifyContent = 'space-evenly'
        break
    }
  }

  return style
}
