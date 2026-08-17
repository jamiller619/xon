import { Add20Regular, Delete20Regular } from '@fluentui/react-icons'
import { css } from 'inline-css-modules'
import { useId } from 'react'
import Button from '../button/Button.jsx'
import Textbox from './Textbox.jsx'

const styles = css`
  .root {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-xs);
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-xs);
  }

  .remove {
    min-width: 44px;
    min-height: 44px;
  }

  .add {
    align-self: start;
    min-height: 44px;
  }

  .empty {
    margin: 0;
    color: var(--color-gray-11);
    font-size: var(--text-sm);
  }

  .error {
    margin: 0;
    color: var(--color-red-11);
    font-size: var(--text-sm);
  }

  .message {
    min-height: 1lh;
  }
`

export type StringListInputProps = {
  value: readonly string[]
  onChange: (value: string[]) => void
  onBlur?: () => void
  autoFocus?: boolean
  disabled?: boolean
  error?: string
  itemLabel?: string
  addLabel?: string
  emptyLabel?: string
  placeholder?: string
}

/** A controlled, accessible editor for ordered lists of string values. */
export default function StringListInput({
  value,
  onChange,
  onBlur,
  autoFocus = false,
  disabled = false,
  error,
  itemLabel = 'Value',
  addLabel = 'Add value',
  emptyLabel = 'No values added.',
  placeholder,
}: StringListInputProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <fieldset
      className={styles.root}
      aria-describedby={error ? errorId : undefined}
      aria-label={`${itemLabel} list`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onBlur?.()
      }}
    >
      {value.length === 0 && <p className={styles.empty}>{emptyLabel}</p>}
      {value.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ordered string values do not carry ids
        <div className={styles.row} key={index}>
          <Textbox
            block
            autoFocus={autoFocus && index === 0}
            aria-label={`${itemLabel} ${index + 1}`}
            aria-invalid={Boolean(error)}
            disabled={disabled}
            placeholder={placeholder}
            value={item}
            onChange={(event) => {
              const next = [...value]
              next[index] = event.currentTarget.value
              onChange(next)
            }}
          />
          <Button.Icon
            aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
            className={styles.remove}
            disabled={disabled}
            title={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
            variant="ghost"
            onClick={() =>
              onChange(value.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Delete20Regular aria-hidden="true" />
          </Button.Icon>
        </div>
      ))}
      <Button
        className={styles.add}
        disabled={disabled}
        variant="ghost"
        onClick={() => onChange([...value, ''])}
      >
        <Add20Regular aria-hidden="true" />
        {addLabel}
      </Button>
      <div className={styles.message}>
        {error && (
          <p className={styles.error} id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  )
}
