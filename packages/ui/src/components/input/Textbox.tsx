import { Input } from '@base-ui/react'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { InputHTMLAttributes, ReactNode } from 'react'
import type { Size } from '../types.js'

export type TextboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> & {
  startIcon?: ReactNode
  endIcon?: ReactNode
  block?: boolean
  size?: Size | undefined
}

const styles = css /* css */`
  .container {
    --padding: calc(var(--space-xs) + var(--space-2xs));

    &.small {
      --padding: calc(var(--space-2xs) + var(--space-3xs));

      .icon {
        left: calc(var(--space-2xs) + var(--space-2xs));
      }
    }

    position: relative;
    display: flex;
    align-items: center;
  }

  .textbox {
    background-color: var(--color-gray-5);
    border: none;
    font: inherit;
    border-radius: var(--border-radius-3);
    corner-shape: var(--corner-shape);
    padding: var(--padding);
    color: currentColor;
    outline: none;

    &[type="search"] {
      corner-shape: round;
    }

    &:-webkit-autofill {
      -webkit-box-shadow: 0 0 0px 1000px var(--color-gray-5) inset;
    }
  }

  .block {
    width: 100%;

    input {
      width: stretch;
    }
  }

  .icon {
    position: absolute;
    left: calc(var(--padding) / 2);
    pointer-events: none;
    color: var(--color-gray-10);
    height: 20px;

    &.focused {
      color: var(--color-gray-12);
    }
  }

  .start {
    input {
      padding-left: var(--space-xl);
    }
  }
`

export default function Textbox({
  className,
  startIcon,
  endIcon,
  block = false,
  style,
  size,
  ...props
}: TextboxProps) {
  return (
    <div
      style={style}
      className={clsx(
        className,
        styles.container,
        block && styles.block,
        startIcon && styles.start,
        endIcon && styles.end,
        size && styles[size],
      )}
    >
      {startIcon && <div className={styles.icon}>{startIcon}</div>}
      <Input {...props} className={styles.textbox}></Input>
      {endIcon && endIcon}
    </div>
  )
}
