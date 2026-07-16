import { Radio } from '@base-ui/react/radio'
import { RadioGroup as UIRadioGroup } from '@base-ui/react/radio-group'
import { css } from 'inline-css-modules'
import { type ReactNode, useId } from 'react'

type RadioGroupItem = {
  label: string
  icon: ReactNode
  value: string
}

type RadioGroupProps = {
  items: RadioGroupItem[]
  value?: string
  onChange?: (value: string) => void
  mutliple?: boolean
}

const styles = css`
  .container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .icon {
    font-size: var(--text-md);
  }

  .item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2xs);
    width: var(--space-4xl);
    height: var(--space-4xl);
    padding: var(--space-2xs);
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

export default function RadioGroup({
  items,
  value,
  onChange,
}: RadioGroupProps) {
  const id = useId()

  return (
    <UIRadioGroup
      aria-labelledby={id}
      value={value}
      className={styles.container}
      onValueChange={onChange}
    >
      {items.map((item) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: <explanation>
        <label key={item.label} className={styles.item}>
          <Radio.Root value={item.value} className={styles.radio}>
            <Radio.Indicator className={styles.indicator} />
          </Radio.Root>
          <span className={styles.icon}>{item.icon}</span>
          <span>{item.label}</span>
        </label>
      ))}
    </UIRadioGroup>
  )
}
