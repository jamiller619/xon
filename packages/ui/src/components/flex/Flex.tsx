import clsx from 'clsx'
import { type ComponentProps, createElement, type ElementType } from 'react'
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
type FlexWrap = 'nowrap' | 'wrap'

type FlexOwnProps<C extends ElementType> = {
  dir?: FlexDirection
  gap?: number | string
  align?: FlexAlign
  justify?: FlexJustify
  as?: C
  wrap?: boolean
}

export type FlexProps<C extends ElementType> = FlexOwnProps<C> &
  Omit<ComponentProps<C>, keyof FlexOwnProps<C>>

export default function Flex<C extends ElementType = 'div'>({
  dir,
  gap,
  align,
  justify,
  wrap,
  style,
  className,
  children,
  as,
  ref,
  ...props
}: FlexProps<C>) {
  const Component = as ?? 'div'

  return createElement(
    Component,
    {
      className: clsx(styles.flex, className, {
        [styles.nowrap as string]: wrap === false,
        [styles.wrap as string]: wrap === true,
        [styles.row as string]: dir === 'row',
        [styles.col as string]: dir === 'col',
        [styles[`gap-${gap}`] as string]: gap,
        [styles[`align-${align}`] as string]: align,
        [styles[`justify-${justify}`] as string]: justify,
      }),
      // style: resolveStyle(
      //   { ...style },
      //   dir,
      //   gap,
      //   align,
      //   justify,
      //   wrap === true ? 'wrap' : wrap === false ? 'nowrap' : undefined,
      // ),
      ref,
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
  wrap?: FlexWrap,
): React.CSSProperties {
  const style: React.CSSProperties = styleProp ?? {}

  if (wrap) {
    style.flexWrap = wrap === 'nowrap' ? 'nowrap' : 'wrap'
  }

  if (dir) {
    style.flexDirection = dir === 'row' ? 'row' : 'column'
  }

  if (gap) {
    style.gap = `calc(var(--space-unit) * ${gap})`
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
