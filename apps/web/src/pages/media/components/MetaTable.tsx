import type { MediaItem } from '@xon/shared'
import { Button } from '@xon/ui'
import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { sentenceCase } from 'text-case'
import { formatBytes, truncateMiddle } from '~/lib/utils'

const styles = css`
  .metaTable {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    table-layout: fixed;
  }

  .metaRow {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .metaLabel {
    padding-block: var(--space-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
    vertical-align: top;
    width: 8rem;
  }

  .metaValue {
    padding-block: var(--space-sm);
    color: #ccc;
    word-break: break-word;
    line-height: 1;
  }

  .filePath {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
  }

  .filePathLine {
    display: block;
    overflow: hidden;
    white-space: pre;
  }
`

const META_KEYS_TO_HIDE = [
  'images',
  'overview',
  'duration',
  'tmdbId',
  'imdbId',
  'title',
  'originalTitle',
  'voteAverage',
  'rated',
  'imdbRating',
  'imdbVotes',
  'metascore',
  'rottenTomatoesRating',
  'genres',
  'cast',
  'crew',
  'actors',
  'runtime',
  'year',
  'resolution',
  'revision',
  'language',
]

export default function MetaTable({
  data,
  className,
}: {
  data: MediaItem
  className?: string | undefined
}) {
  const parsedMeta = {
    ...data.metadata,
    ...data.fileMetadata,
  }

  const metaEntries = Object.entries(parsedMeta).filter(
    ([k, v]) =>
      !META_KEYS_TO_HIDE.includes(k) &&
      v !== null &&
      v !== undefined &&
      v !== '' &&
      parseValue(v) !== '{}' &&
      !Array.isArray(v),
  )

  const metaArrayEntries = Object.entries(parsedMeta).filter(
    (entry): entry is [string, unknown[]] =>
      !META_KEYS_TO_HIDE.includes(entry[0]) && Array.isArray(entry[1]),
  )

  return (
    <div className={clsx(styles.metaTableContainer, className)}>
      <table className={styles.metaTable}>
        <tbody>
          {data.mediaType && <MetaRow label="Format">{data.mediaType}</MetaRow>}
          <MetaRow label="File size">{formatBytes(data)}</MetaRow>
          <MetaRow label="File path">
            <MiddleTruncatedPath
              filePath={data.filePath}
              renderContainer={(props) => (
                <Button
                  variant="link"
                  {...props}
                  onClick={(event) => {
                    event.preventDefault()

                    void fetch(`/opendir/${data.id}`)
                  }}
                />
              )}
            />
          </MetaRow>
          <MetaRow label="Date added">
            {new Date(data.createdAt).toLocaleString()}
          </MetaRow>
          {data.scannedAt && (
            <MetaRow label="Last scanned">
              {new Date(data.scannedAt).toLocaleString()}
            </MetaRow>
          )}
          {metaEntries.map(([key, val]) => {
            return (
              <MetaRow key={key} label={key}>
                {parseValue(val)}
              </MetaRow>
            )
          })}
          {metaArrayEntries.map(([key, val]) => (
            <MetaRow key={key} label={key}>
              {parseArray(val)}
            </MetaRow>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MetaRow({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <tr className={styles.metaRow}>
      <td className={styles.metaLabel}>
        {typeof label === 'string' ? sentenceCase(label) : label}
      </td>
      <td className={styles.metaValue}>{children}</td>
    </tr>
  )
}

type PathContainerProps = {
  children: ReactNode
  className: string
  ref: (element: HTMLElement | null) => void
  title: string
}

function MiddleTruncatedPath({
  filePath,
  renderContainer,
}: {
  filePath: string
  renderContainer?: (props: PathContainerProps) => ReactNode
}) {
  const pathRef = useRef<HTMLElement>(null)
  const [displayLines, setDisplayLines] = useState([filePath])
  const setPathElement = useCallback((element: HTMLElement | null) => {
    pathRef.current = element
  }, [])

  useEffect(() => {
    const pathElement = pathRef.current
    if (!pathElement) return

    const context = document.createElement('canvas').getContext('2d')
    if (!context) return

    const updateDisplayPath = () => {
      const styles = window.getComputedStyle(pathElement)
      const characters = Array.from(filePath)
      const letterSpacing = Number.parseFloat(styles.letterSpacing) || 0
      const availableWidth = pathElement.clientWidth

      context.font =
        styles.font ||
        `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`

      const measure = (text: string) =>
        context.measureText(text).width +
        Math.max(0, Array.from(text).length - 1) * letterSpacing

      if (measure(filePath) <= availableWidth) {
        setDisplayLines([filePath])
        return
      }

      const breakPoints = characters.flatMap((character, index) =>
        /\s/.test(character) || character === '/' || character === '\\'
          ? [index + 1]
          : [],
      )
      const breakPoint = breakPoints.findLast((index) => {
        const firstLine = characters.slice(0, index).join('').trimEnd()
        return firstLine.length > 0 && measure(firstLine) <= availableWidth
      })

      if (breakPoint !== undefined) {
        const firstLine = characters.slice(0, breakPoint).join('').trimEnd()
        const remainder = characters.slice(breakPoint).join('').trimStart()

        if (remainder) {
          setDisplayLines([
            firstLine,
            truncatePathToWidth(remainder, availableWidth, measure),
          ])
          return
        }
      }

      setDisplayLines([truncateTextToWidth(filePath, availableWidth, measure)])
    }

    updateDisplayPath()
    const resizeObserver = new ResizeObserver(updateDisplayPath)
    resizeObserver.observe(pathElement)

    return () => resizeObserver.disconnect()
  }, [filePath])

  const containerProps: PathContainerProps = {
    ref: setPathElement,
    className: styles.filePath ?? '',
    title: filePath,
    children: (
      <>
        <span className={styles.filePathLine}>{displayLines[0]}</span>
        {displayLines[1] && (
          <span className={styles.filePathLine}>{displayLines[1]}</span>
        )}
      </>
    ),
  }

  return renderContainer ? (
    renderContainer(containerProps)
  ) : (
    <span {...containerProps} />
  )
}

function truncatePathToWidth(
  path: string,
  availableWidth: number,
  measure: (text: string) => number,
) {
  if (measure(path) <= availableWidth) return path

  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const prefix = separatorIndex >= 0 ? path.slice(0, separatorIndex + 1) : ''
  const fileName = path.slice(separatorIndex + 1)

  if (prefix && measure(`${prefix}...`) <= availableWidth) {
    return `${prefix}${truncateTextToWidth(
      fileName,
      availableWidth,
      measure,
      prefix,
    )}`
  }

  return truncateTextToWidth(path, availableWidth, measure)
}

function truncateTextToWidth(
  text: string,
  availableWidth: number,
  measure: (text: string) => number,
  prefix = '',
) {
  const characters = Array.from(text)
  let shortestFit = '...'
  let low = 4
  let high = characters.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = truncateMiddle(text, middle)

    if (measure(`${prefix}${candidate}`) <= availableWidth) {
      shortestFit = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return shortestFit
}

function parseValue(value?: unknown): ReactNode {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()

  return JSON.stringify(value)
}

function parseArray(arr: unknown[]): ReactNode {
  const isStringOrNumberArray =
    typeof arr[0] === 'string' || typeof arr[0] === 'number'

  if (isStringOrNumberArray) return arr.join(', ')

  return arr.map((v) => JSON.stringify(v)).join(', ')
}
