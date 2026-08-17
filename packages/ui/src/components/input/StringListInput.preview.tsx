import { useState } from 'react'
import StringListInput from './StringListInput.jsx'
import styles from './StringListInputPreview.module.css'

export default function StringListInputPreview() {
  const [origins, setOrigins] = useState([
    'http://localhost:6019',
    'https://localhost:6020',
  ])

  return (
    <section className={styles.preview} aria-label="String list input states">
      <h1>String list input</h1>
      <div className={styles.example}>
        <h2>Populated, add, and remove</h2>
        <StringListInput
          itemLabel="Origin"
          value={origins}
          onChange={setOrigins}
        />
      </div>
      <div className={styles.example}>
        <h2>Empty</h2>
        <StringListInput value={[]} onChange={() => undefined} />
      </div>
      <div className={styles.example}>
        <h2>Focused</h2>
        <StringListInput
          autoFocus
          value={['Focused value']}
          onChange={() => undefined}
        />
      </div>
      <div className={styles.example}>
        <h2>Validation error</h2>
        <StringListInput
          error="Enter a valid origin."
          value={['not-an-origin']}
          onChange={() => undefined}
        />
      </div>
      <div className={styles.example}>
        <h2>Disabled</h2>
        <StringListInput
          disabled
          value={['https://example.com']}
          onChange={() => undefined}
        />
      </div>
    </section>
  )
}
