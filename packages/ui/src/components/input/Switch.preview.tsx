import Switch from './Switch.jsx'
import styles from './SwitchPreview.module.css'

const states = [
  'default',
  'hover',
  'focus',
  'active',
  'disabled',
  'loading',
  'error',
  'success',
] as const

export default function SwitchPreview() {
  return (
    <section className={styles.preview} aria-label="Switch states">
      <h1>Switch — 8 states</h1>
      {states.map((state) => (
        <div className={styles.row} key={state}>
          <code>{state}</code>
          <Switch
            label="Unmatched titles"
            defaultChecked={state === 'success'}
            disabled={state === 'disabled'}
            aria-invalid={state === 'error' || undefined}
            data-preview-state={state}
          />
        </div>
      ))}
    </section>
  )
}
