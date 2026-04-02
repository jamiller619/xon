import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/apiFetch.js'
import styles from './FontViewer.module.css'

interface Props {
  mediaId: string
  title: string
  onClose: () => void
}

interface FontMeta {
  family: string
  subfamily: string
  glyphCount: number | null
  unitsPerEm: number | null
}

type Tab = 'specimen' | 'charmap'

const SPECIMEN_SIZES = [14, 18, 24, 36, 48, 72] as const

const SPECIMEN_ROWS: { label: string; text: string }[] = [
  { label: 'Pangram', text: 'The quick brown fox jumps over the lazy dog' },
  { label: 'Uppercase', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'Lowercase', text: 'abcdefghijklmnopqrstuvwxyz' },
  { label: 'Digits', text: '0123456789' },
  { label: 'Symbols', text: "!@#$%^&*()_+-=[]{}|;':,.<>?/" },
]

// Unicode ranges for character map
function buildCharList(): number[] {
  const chars: number[] = []
  // ASCII printable
  for (let i = 0x21; i <= 0x7e; i++) chars.push(i)
  // Latin-1 Supplement
  for (let i = 0xa1; i <= 0xff; i++) chars.push(i)
  // Latin Extended-A
  for (let i = 0x0100; i <= 0x017f; i++) chars.push(i)
  return chars
}

const CHAR_LIST = buildCharList()

const FONT_FAMILY_PREFIX = 'xon-preview-font-'

export default function FontViewer({ mediaId, title, onClose }: Props) {
  const [meta, setMeta] = useState<FontMeta | null>(null)
  const [fontLoaded, setFontLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('specimen')
  const [specimenSize, setSpecimenSize] =
    useState<(typeof SPECIMEN_SIZES)[number]>(36)

  const fontFamily = `${FONT_FAMILY_PREFIX}${mediaId}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run on mediaId change
  useEffect(() => {
    setLoading(true)
    setError(null)
    setFontLoaded(false)
    setMeta(null)

    let cancelled = false

    const run = async () => {
      try {
        // Load font metadata
        const metaRes = await apiFetch(`/api/v1/media/${mediaId}/font-metadata`)
        if (!metaRes.ok) throw new Error('Failed to load font metadata')
        const metaData = (await metaRes.json()) as FontMeta
        if (cancelled) return
        setMeta(metaData)

        // Load font via FontFace API
        const fontFace = new FontFace(
          fontFamily,
          `url(/api/v1/media/${mediaId}/stream)`,
        )
        await fontFace.load()
        if (cancelled) return
        document.fonts.add(fontFace)
        setFontLoaded(true)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load font')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run().catch(() => {})

    return () => {
      cancelled = true
      // Clean up the registered font face when component unmounts
      for (const ff of document.fonts) {
        if (ff.family === fontFamily) {
          document.fonts.delete(ff)
          break
        }
      }
    }
  }, [mediaId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <dialog open className={styles.dialog ?? ''}>
      <div className={styles.toolbar ?? ''}>
        <button
          type="button"
          className={styles.closeBtn ?? ''}
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
        <span className={styles.titleText ?? ''}>{title}</span>
        <div className={styles.tabs ?? ''}>
          <button
            type="button"
            className={`${styles.tabBtn ?? ''} ${tab === 'specimen' ? (styles.tabActive ?? '') : ''}`}
            onClick={() => setTab('specimen')}
          >
            Specimen
          </button>
          <button
            type="button"
            className={`${styles.tabBtn ?? ''} ${tab === 'charmap' ? (styles.tabActive ?? '') : ''}`}
            onClick={() => setTab('charmap')}
          >
            Character Map
          </button>
        </div>
      </div>

      <div className={styles.body ?? ''}>
        {/* Sidebar — font metadata */}
        <aside className={styles.sidebar ?? ''}>
          <h2 className={styles.sidebarTitle ?? ''}>Font Info</h2>
          {loading && <p className={styles.sidebarLoading ?? ''}>Loading…</p>}
          {error && <p className={styles.sidebarError ?? ''}>{error}</p>}
          {meta && (
            <dl className={styles.metaList ?? ''}>
              <dt>Family</dt>
              <dd>{meta.family}</dd>
              <dt>Style</dt>
              <dd>{meta.subfamily}</dd>
              <dt>Glyphs</dt>
              <dd>
                {meta.glyphCount != null
                  ? meta.glyphCount.toLocaleString()
                  : '—'}
              </dd>
              {meta.unitsPerEm != null && (
                <>
                  <dt>Units/EM</dt>
                  <dd>{meta.unitsPerEm}</dd>
                </>
              )}
            </dl>
          )}
        </aside>

        {/* Main content */}
        <main className={styles.main ?? ''}>
          {loading && (
            <div className={styles.loadingBox ?? ''}>
              <p>Loading font…</p>
            </div>
          )}

          {!loading && error && (
            <div className={styles.errorBox ?? ''}>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && fontLoaded && tab === 'specimen' && (
            <div className={styles.specimenPanel ?? ''}>
              <div className={styles.sizeControls ?? ''}>
                {SPECIMEN_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`${styles.sizeBtn ?? ''} ${specimenSize === size ? (styles.sizeBtnActive ?? '') : ''}`}
                    onClick={() => setSpecimenSize(size)}
                  >
                    {size}px
                  </button>
                ))}
              </div>
              <div
                className={styles.specimenRows ?? ''}
                style={{ fontFamily: `'${fontFamily}', serif` }}
              >
                {SPECIMEN_ROWS.map((row) => (
                  <div key={row.label} className={styles.specimenRow ?? ''}>
                    <span className={styles.rowLabel ?? ''}>{row.label}</span>
                    <span
                      className={styles.specimenText ?? ''}
                      style={{ fontSize: `${specimenSize}px` }}
                    >
                      {row.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && fontLoaded && tab === 'charmap' && (
            <div className={styles.charmapPanel ?? ''}>
              <p className={styles.charmapHint ?? ''}>
                {CHAR_LIST.length} characters shown. Hover to see code points.
              </p>
              <div
                className={styles.charmapGrid ?? ''}
                style={{ fontFamily: `'${fontFamily}', serif` }}
              >
                {CHAR_LIST.map((cp) => {
                  const ch = String.fromCodePoint(cp)
                  const hex = cp.toString(16).toUpperCase().padStart(4, '0')
                  return (
                    <div
                      key={cp}
                      className={styles.charmapCell ?? ''}
                      title={`U+${hex} ${ch}`}
                    >
                      {ch}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </dialog>
  )
}
