import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import Button from './Button.jsx'

const styles = css`
  .button {
    background: var(--color-gray-a2);
  }

  .pressed {
    background: var(--color-gray-6);
    color: var(--color-text);
  }
`

export type ToggleButtonProps = Toggle.Props

export default function ToggleButton({
  children,
  ...props
}: ToggleButtonProps) {
  return (
    <Toggle
      {...props}
      render={(props, state) => {
        return (
          <Button
            {...props}
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
