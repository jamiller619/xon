import { Field as BaseField } from '@base-ui/react/field'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'

const styles = css`
  .field {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-2);
    width: stretch;
  }

  .label {
    font-size: var(--font-size-3);
    font-weight: 500;
  }

  .error {
    color: var(--color-error);
  }
`

type FieldProps = BaseField.Root.Props & {
  label: ReactNode
  error?: string
  description?: ReactNode
  children: ReactNode
}

export default function Field({
  label,
  error,
  children,
  description,
  className,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root className={clsx(styles.field, className)} {...props}>
      <BaseField.Label className={styles.label}>{label}</BaseField.Label>
      {children}
      {error && (
        <BaseField.Error className={styles.error}>{error}</BaseField.Error>
      )}
      <BaseField.Description>{description}</BaseField.Description>
    </BaseField.Root>
  )
}
