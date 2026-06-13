import { Checkbox } from '@base-ui/react/checkbox'
import { CheckboxGroup as UICheckboxGroup } from '@base-ui/react/checkbox-group'
import { css } from 'inline-css-modules'
import { type ReactNode, useId } from 'react'

type CheckboxGroupItem = {
  label: string
  icon: ReactNode
  value: string
}

type CheckboxGroupProps = {
  items: CheckboxGroupItem[]
  value?: string[]
  onChange?: (value: string[]) => void
}

const styles = css`
  .container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .icon {
    font-size: var(--font-size-3);
  }

  .item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: var(--space-9);
    height: var(--space-9);
    padding: var(--space-2);
    line-height: 1.1;
    text-align: center;
    background: var(--color-gray-1);
    border: 2px solid transparent;
    border-radius: var(--border-radius-3);
    corner-shape: var(--corner-shape);
    cursor: pointer;

    &:has(input:checked) {
      background: var(--color-accent-3);
      border-color: var(--color-accent-9);
    }
  }
`

export default function CheckboxGroup({
  items,
  value,
  onChange,
}: CheckboxGroupProps) {
  const id = useId()

  return (
    <UICheckboxGroup
      aria-labelledby={id}
      value={value}
      className={styles.container}
      onValueChange={onChange}
    >
      {items.map((item) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: control is the nested Checkbox.Root
        <label key={item.label} className={styles.item}>
          <Checkbox.Root name={item.value} className={styles.checkbox}>
            <Checkbox.Indicator className={styles.indicator} />
          </Checkbox.Root>
          <span className={styles.icon}>{item.icon}</span>
          <span>{item.label}</span>
        </label>
      ))}
    </UICheckboxGroup>
  )
}
