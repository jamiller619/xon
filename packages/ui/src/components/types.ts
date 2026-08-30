import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  ElementType,
} from 'react'

export type Variant = 'primary' | 'ghost' | 'danger' | 'success' | 'warning'
export type Size = 'xsmall' | 'small' | 'large'
export type BorderRadius = Size | 'medium' | 'none'

export type PolymorphicProps<
  T extends ElementType,
  Props extends object = object,
> = Props & { as?: T } & Omit<ComponentPropsWithoutRef<T>, keyof Props | 'as'>

export type PolymorphicPropsWithRef<
  T extends ElementType,
  Props extends object = object,
> = Props & { as?: T } & Omit<ComponentPropsWithRef<T>, keyof Props | 'as'>
