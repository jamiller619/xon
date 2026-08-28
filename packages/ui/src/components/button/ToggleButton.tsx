import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { Variant } from '../types.js'
import Button from './Button.jsx'

const styles = css`
  .button {
    background: var(--color-gray-5);
  }

  .pressed {
    background: var(--color-accent-gradient-reversed);
    /* background: var(--color-accent-9); */
    color: var(--color-text);

    &:hover {
      background: var(--color-accent-gradient-reversed);
    }
  }
`

export type ToggleButtonProps = Toggle.Props & {
  variant?: Variant
}

export default function ToggleButton({
  children,
  variant,
  ...props
}: ToggleButtonProps) {
  return (
    <Toggle
      {...props}
      render={(props, state) => {
        return (
          <Button
            {...props}
            variant={state.pressed ? variant : undefined}
            className={clsx(styles.button, state.pressed && styles.pressed)}
          >
            {children}
          </Button>
        )
      }}
    />
  )
}

const groupStyles = css`
  .toggleButtonGroup {
    button:first-of-type {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    button:last-of-type {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }

    button:not(:last-of-type):not(:first-of-type) {
      border-radius: 0;
    }

    button[data-pressed] {
      pointer-events: none;
      /* color: var(--color-gray-1); */
      font-weight: 500;
      background: var(--color-accent-gradient);
      /* background: var(--color-accent-9); */
    }
  }
`

export type ToggleButtonGroupProps = ToggleGroup.Props

export function ToggleButtonGroup({ children, ...props }: ToggleGroup.Props) {
  return (
    <ToggleGroup {...props} className={groupStyles.toggleButtonGroup}>
      {children}
    </ToggleGroup>
  )
}
