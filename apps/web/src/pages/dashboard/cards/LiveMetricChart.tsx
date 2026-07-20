import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import styles from './LiveMetricChart.module.css'

export type MetricPoint = {
  /** Sample timestamp, ms since epoch */
  t: number
  /** Sampled value */
  v: number
}

type LiveMetricChartProps = {
  /** Accessible description, e.g. "Xon CPU usage, last 60 seconds" */
  label: string
  /** Samples ordered oldest → newest, ~1s apart */
  points: MetricPoint[]
  /** Formats axis ticks and tooltip values */
  format: (value: number) => string
  /** Hard ceiling for the y-scale, e.g. 100 for percentages */
  cap?: number
}

const WINDOW_MS = 60_000
const STEP_MS = 1_000
const HEIGHT = 72
/** Head-room above the top gridline for its tick label */
const TOP_PAD = 16

/**
 * Rounds up to a clean axis maximum (1/2/5 × 10ⁿ) so ticks stay readable
 * while the live window's peak drifts.
 */
function niceCeil(value: number, cap?: number): number {
  if (value <= 0) {
    return cap ?? 1
  }

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const factor = [1, 2, 5, 10].find((f) => f * magnitude >= value) ?? 10
  const result = factor * magnitude

  return cap != null ? Math.min(result, cap) : result
}

export default function LiveMetricChart({
  label,
  points,
  format,
  cap,
}: LiveMetricChartProps) {
  const clipId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  /** Hovered sample position as whole seconds before "now", null = no hover */
  const [hoverAge, setHoverAge] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current

    if (!el) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0)
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [])

  const latest = points.at(-1)
  const pxPerMs = width / WINDOW_MS
  const visible = latest
    ? points.filter((p) => p.t >= latest.t - WINDOW_MS - 2 * STEP_MS)
    : []

  const peak = visible.reduce((max, p) => Math.max(max, p.v), 0)
  const scaleMax = niceCeil(peak, cap)

  const x = (t: number) => width + (t - (latest?.t ?? 0)) * pxPerMs
  const y = (v: number) =>
    HEIGHT - (Math.min(v, scaleMax) / scaleMax) * (HEIGHT - TOP_PAD)

  const ready = width > 0 && visible.length >= 2

  let linePath = ''
  let areaPath = ''
  let slidePx = 0

  const first = visible[0]

  if (ready && latest && first) {
    linePath = visible
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(2)}`,
      )
      .join(' ')

    areaPath = `${linePath} L${x(latest.t).toFixed(1)},${HEIGHT} L${x(first.t).toFixed(1)},${HEIGHT} Z`

    const prev = points.at(-2)

    if (prev) {
      slidePx = Math.min((latest.t - prev.t) * pxPerMs, width)
    }
  }

  const hoverPoint =
    hoverAge != null && latest
      ? visible.reduce<MetricPoint | null>((best, p) => {
          const target = latest.t - hoverAge * STEP_MS

          return best == null || Math.abs(p.t - target) < Math.abs(best.t - target)
            ? p
            : best
        }, null)
      : null

  const maxAge = Math.floor(WINDOW_MS / STEP_MS)

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!ready) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left
    const age = Math.round((width - px) / (pxPerMs * STEP_MS))

    setHoverAge(Math.max(0, Math.min(age, maxAge)))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setHoverAge((age) => Math.min((age ?? -1) + 1, maxAge))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setHoverAge((age) => Math.max((age ?? 1) - 1, 0))
    } else if (event.key === 'Escape') {
      setHoverAge(null)
    }
  }

  const hoverX = hoverPoint ? x(hoverPoint.t) : 0
  const tooltipLeft = Math.max(36, Math.min(hoverX, width - 36))

  return (
    <div
      ref={containerRef}
      className={styles.chart}
      role="img"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focus enables the keyboard-driven crosshair (arrow keys), mirroring pointer hover
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={() => setHoverAge(null)}
    >
      <svg
        className={styles.svg}
        width="100%"
        height={HEIGHT}
        aria-hidden="true"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverAge(null)}
      >
        {ready && (
          <>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={width} height={HEIGHT} />
            </clipPath>
            {[scaleMax, scaleMax / 2].map((tick) => (
              <g key={tick}>
                <line
                  className={styles.gridline}
                  x1={0}
                  x2={width}
                  y1={y(tick) + 0.5}
                  y2={y(tick) + 0.5}
                />
                <text className={styles.tick} x={0} y={y(tick) - 4}>
                  {format(tick)}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${clipId})`}>
              <g
                key={latest?.t}
                className={styles.slide}
                style={{ '--slide': `${slidePx}px` } as CSSProperties}
              >
                <path className={styles.area} d={areaPath} />
                <path className={styles.line} d={linePath} />
                {hoverPoint && (
                  <>
                    <line
                      className={styles.crosshair}
                      x1={hoverX}
                      x2={hoverX}
                      y1={TOP_PAD - 8}
                      y2={HEIGHT}
                    />
                    <circle
                      className={styles.hoverDot}
                      cx={hoverX}
                      cy={y(hoverPoint.v)}
                      r={4}
                    />
                  </>
                )}
              </g>
            </g>
            {latest && (
              <circle
                className={styles.dot}
                cx={width}
                cy={y(latest.v)}
                r={4}
              />
            )}
          </>
        )}
        <line
          className={styles.baseline}
          x1={0}
          x2="100%"
          y1={HEIGHT - 0.5}
          y2={HEIGHT - 0.5}
        />
      </svg>
      {hoverPoint && hoverAge != null && (
        <div className={styles.tooltip} style={{ left: tooltipLeft }}>
          <span className={styles.tooltipValue}>{format(hoverPoint.v)}</span>
          <span className={styles.tooltipTime}>
            {hoverAge === 0 ? 'now' : `${hoverAge}s ago`}
          </span>
        </div>
      )}
    </div>
  )
}
