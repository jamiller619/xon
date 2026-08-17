import type { Config, ConfigKey } from '@xon/shared'
import {
  Button,
  Field,
  Select,
  StringListInput,
  Switch,
  Textbox,
} from '@xon/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { type ConfigMutation, useConfigMutation } from '~/hooks/useConfig'
import {
  type AutosaveStatus,
  default as useDebouncedAutosave,
} from '~/hooks/useDebouncedAutosave'
import styles from './Settings.module.css'
import type { SettingDefinition } from './settingsCatalog'
import { validateSettingValue } from './settingsCatalog'

type SettingControlProps = {
  definition: SettingDefinition
  striped: boolean
  value: Config[ConfigKey] | undefined
  onStatusChange: (key: ConfigKey, status: AutosaveStatus) => void
}

function toDraft(definition: SettingDefinition, value: unknown) {
  if (definition.control === 'string-list') {
    return Array.isArray(value) ? value.map(String) : []
  }
  if (definition.control === 'boolean') return Boolean(value)
  if (definition.control === 'integer' || definition.control === 'number') {
    return typeof value === 'number' ? String(value) : ''
  }
  return typeof value === 'string' ? value : ''
}

function plainDescription(description: string) {
  return description.replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
}

export default function SettingControl({
  definition,
  striped,
  value,
  onStatusChange,
}: SettingControlProps) {
  const mutateConfig = useConfigMutation()
  const [draft, setDraft] = useState(() => toDraft(definition, value))
  const [hasInteracted, setHasInteracted] = useState(false)
  const save = useCallback(
    async (mutation: ConfigMutation) => {
      await mutateConfig(mutation)
    },
    [mutateConfig],
  )
  const autosave = useDebouncedAutosave<ConfigMutation>({ save })

  useEffect(() => {
    onStatusChange(definition.key, autosave.status)
  }, [autosave.status, definition.key, onStatusChange])

  const numericValue = useMemo(() => {
    if (definition.control !== 'integer' && definition.control !== 'number') {
      return undefined
    }
    if (typeof draft !== 'string' || draft.trim() === '') return Number.NaN
    return Number(draft)
  }, [definition.control, draft])

  const validationError = useMemo(() => {
    if (!hasInteracted) return undefined
    if (definition.control === 'integer' || definition.control === 'number') {
      return validateSettingValue(definition, numericValue)
    }
    return validateSettingValue(definition, draft)
  }, [definition, draft, hasInteracted, numericValue])

  useEffect(() => {
    if (
      validationError ||
      autosave.status === 'scheduled' ||
      autosave.status === 'saving' ||
      autosave.status === 'error'
    ) {
      return
    }
    setDraft(toDraft(definition, value))
  }, [autosave.status, definition, validationError, value])

  const saveError = autosave.error
    ? `${autosave.error.message}. The config file was not updated.`
    : undefined
  const helperError = validationError ?? saveError
  const hasStoredValue = value !== undefined

  const setValue = useCallback(
    (nextValue: Config[ConfigKey], immediate = false) => {
      const mutation: ConfigMutation = {
        operation: 'set',
        key: definition.key,
        value: nextValue,
      }
      if (immediate) autosave.saveNow(mutation)
      else autosave.schedule(mutation)
    },
    [autosave, definition.key],
  )

  let control: React.ReactNode

  if (definition.control === 'boolean') {
    control = (
      <Switch
        checked={draft === true}
        disabled={definition.readOnly}
        label={draft === true ? 'Enabled' : 'Disabled'}
        onChange={(checked) => {
          setDraft(checked)
          setHasInteracted(true)
          setValue(checked, true)
        }}
      />
    )
  } else if (definition.control === 'enum') {
    control = (
      <Select
        aria-invalid={Boolean(helperError)}
        block
        disabled={definition.readOnly}
        value={typeof draft === 'string' ? draft : ''}
        onChange={(event) => {
          const next = event.currentTarget.value
          setDraft(next)
          setHasInteracted(true)
          setValue(next, true)
        }}
      >
        {definition.enumValues?.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </Select>
    )
  } else if (
    definition.control === 'integer' ||
    definition.control === 'number'
  ) {
    control = (
      <Textbox
        aria-invalid={Boolean(helperError)}
        block
        disabled={definition.readOnly}
        max={definition.maximum}
        min={definition.minimum}
        step={definition.control === 'integer' ? 1 : 'any'}
        type="number"
        value={typeof draft === 'string' ? draft : ''}
        onBlur={() => {
          setHasInteracted(true)
          if (!validationError) autosave.flush()
        }}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value
          const nextValue =
            nextDraft.trim() === '' ? Number.NaN : Number(nextDraft)
          const nextError = validateSettingValue(definition, nextValue)
          setDraft(nextDraft)
          setHasInteracted(true)
          if (nextError) autosave.cancel()
          else setValue(nextValue)
        }}
      />
    )
  } else if (definition.control === 'string-list') {
    control = (
      <StringListInput
        disabled={definition.readOnly}
        {...(helperError ? { error: helperError } : {})}
        value={Array.isArray(draft) ? draft.map(String) : []}
        onBlur={autosave.flush}
        onChange={(next) => {
          setDraft(next)
          setHasInteracted(true)
          setValue(next)
        }}
      />
    )
  } else if (definition.control === 'string') {
    control = (
      <Textbox
        aria-invalid={Boolean(helperError)}
        block
        disabled={definition.readOnly}
        value={typeof draft === 'string' ? draft : ''}
        onBlur={autosave.flush}
        onChange={(event) => {
          const next = event.currentTarget.value
          setDraft(next)
          setHasInteracted(true)
          setValue(next)
        }}
      />
    )
  } else {
    control = (
      <Textbox block disabled value="This schema shape is not supported yet." />
    )
  }

  return (
    <article className={styles.setting} data-striped={striped || undefined}>
      <div className={styles.settingCopy}>
        <div className={styles.settingTitleRow}>
          <h3 className={styles.settingTitle}>{definition.title}</h3>
          {definition.readOnly && (
            <span className={styles.readOnly}>Read only</span>
          )}
        </div>
        <code className={styles.settingKey}>{definition.key}</code>
        {definition.description && (
          <p className={styles.description}>
            {plainDescription(definition.description)}
          </p>
        )}
      </div>

      <Field
        className={styles.controlField}
        reserveMessageSpace={definition.control !== 'string-list'}
        {...(definition.control !== 'string-list' && helperError
          ? { error: helperError }
          : {})}
        label={
          <span className={styles.visuallyHidden}>{definition.title}</span>
        }
      >
        {control}
      </Field>

      <div className={styles.settingFooter}>
        <span className={styles.fieldStatus}>
          {autosave.status === 'scheduled' && 'Waiting to save…'}
          {autosave.status === 'saving' && 'Saving…'}
          {autosave.status === 'saved' && 'Saved'}
        </span>
        {autosave.status === 'error' && (
          <Button variant="link" onClick={autosave.retry}>
            Retry save
          </Button>
        )}
        {!definition.required && hasStoredValue && !definition.readOnly && (
          <Button
            variant="link"
            onClick={() => {
              setDraft(toDraft(definition, undefined))
              setHasInteracted(false)
              autosave.saveNow({ operation: 'unset', key: definition.key })
            }}
          >
            Unset
          </Button>
        )}
      </div>
    </article>
  )
}
