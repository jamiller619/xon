import { Field as BaseField } from '@base-ui/react/field'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'

const styles = css`
  .field {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-2xs);
    width: stretch;
  }

  .label {
    font-size: var(--text-md);
    font-weight: 500;
  }

  .error {
    color: var(--color-red-11);
  }

  .helper {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    width: 100%;
    font-size: var(--text-sm);
  }

  .reserved {
    min-height: 1lh;
  }
`

type FieldProps = BaseField.Root.Props & {
  label: ReactNode
  error?: string
  description?: ReactNode
  children: ReactNode
  reserveMessageSpace?: boolean
}

export default function Field({
  label,
  error,
  children,
  description,
  reserveMessageSpace = false,
  className,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root className={clsx(styles.field, className)} {...props}>
      <BaseField.Label className={styles.label}>{label}</BaseField.Label>
      {children}
      {reserveMessageSpace ? (
        <div className={clsx(styles.helper, styles.reserved)}>
          {error ? (
            <BaseField.Error className={styles.error}>{error}</BaseField.Error>
          ) : (
            description && (
              <BaseField.Description>{description}</BaseField.Description>
            )
          )}
        </div>
      ) : (
        <>
          {error && (
            <BaseField.Error className={styles.error}>{error}</BaseField.Error>
          )}
          <BaseField.Description>{description}</BaseField.Description>
        </>
      )}
    </BaseField.Root>
  )
}
