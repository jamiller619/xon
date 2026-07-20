import type { StatsPayload } from '@xon/shared'
import { Progress, Surface } from '@xon/ui'
import clsx from 'clsx'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import { type HTMLAttributes, useEffect, useState } from 'react'
import dashboardStyles from '../Dashboard.module.css'
import LiveMetricChart, { type MetricPoint } from './LiveMetricChart'
import styles from './System.module.css'

type SystemProps = HTMLAttributes<HTMLDivElement>

type ProcessSample = {
  t: number
  cpu: number
  memory: number
}

/** 60s visible window + slack so the left edge stays covered mid-slide */
const MAX_SAMPLES = 66

function formatPercent(value: number) {
  return `${Number(value.toPrecision(2))}%`
}

function formatUptime(seconds: number) {
  if (seconds < 60) {
    return 'Just now'
  }

  return prettyMs(seconds * 1000, {
    hideSeconds: true,
  })
}

export default function System({ className, ...props }: SystemProps) {
  const [data, setData] = useState<StatsPayload>({} as StatsPayload)
  const [history, setHistory] = useState<ProcessSample[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const eventSource = new EventSource('/api/stats')

    eventSource.onmessage = (event) => {
      const parsedData: StatsPayload = JSON.parse(event.data)

      setData(parsedData)

      if (parsedData.process) {
        setHistory((prev) => [
          ...prev.slice(1 - MAX_SAMPLES),
          {
            t: parsedData.timestamp,
            cpu: parsedData.process.cpu,
            memory: parsedData.process.memory,
          },
        ])
      }
    }

    eventSource.onerror = (err) => {
      setError(JSON.stringify(err))
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  const cpuPoints: MetricPoint[] = history.map((s) => ({ t: s.t, v: s.cpu }))
  const memoryPoints: MetricPoint[] = history.map((s) => ({
    t: s.t,
    v: s.memory,
  }))

  return (
    <Surface
      as="section"
      borderRadius="sm"
      className={clsx(dashboardStyles.section, className)}
      {...props}
    >
      <h6 className={dashboardStyles.title}>System</h6>
      <div>
        {error && <p className={styles.error}>{error}</p>}
        <dl className={styles.dlist}>
          <div className={styles.row}>
            <dt>{data.system?.hostname}</dt>
            <dd>
              {data.system?.platform} {data.system?.release}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Uptime</dt>
            <dd>{data.process && formatUptime(data.process.uptime)}</dd>
          </div>
          {/* {data.network?.map((n) => (
            <div key={n.iface} className={styles.row}>
              <dt>{n.iface}</dt>
              <dd>
                {n.rx} / {n.rxSec} / {n.tx} / {n.txSec}
              </dd>
            </div>
          ))} */}
          <div>
            <div className={styles.row}>
              <dt>CPU Usage</dt>
              <dd>
                <CPUUsage value={data.cpu} />
              </dd>
            </div>
            <Progress value={data.cpu} max={100} />
          </div>
          <div>
            <div className={styles.row}>
              <dt>Memory Usage</dt>
              <dd>
                <MemUsage value={data.memory} />
              </dd>
            </div>
            {data.memory && (
              <Progress value={data.memory.used} max={data.memory.total} />
            )}
          </div>
          <div className={styles.charts}>
            <div className={styles.chartTile}>
              <div className={styles.row}>
                <dt>Xon CPU</dt>
                <dd>
                  <CPUUsage value={data.process?.cpu} />
                </dd>
              </div>
              <LiveMetricChart
                label="Xon CPU usage, last 60 seconds"
                points={cpuPoints}
                format={formatPercent}
                cap={100}
              />
            </div>
            <div className={styles.chartTile}>
              <div className={styles.row}>
                <dt>Xon Memory</dt>
                <dd>{data.process && prettyBytes(data.process.memory)}</dd>
              </div>
              <LiveMetricChart
                label="Xon memory usage, last 60 seconds"
                points={memoryPoints}
                format={prettyBytes}
              />
            </div>
          </div>
        </dl>
      </div>
    </Surface>
  )
}

function MemUsage({ value }: { value?: StatsPayload['memory'] }) {
  let usageClassName = styles.low

  if (value) {
    if (value.used > value.total * 0.95) {
      usageClassName = styles.high
    } else if (value.used > value.total * 0.8) {
      usageClassName = styles.medium
    }
  }

  return (
    <span className={usageClassName}>
      {value && `${prettyBytes(value.used)} / ${prettyBytes(value.total)}`}
    </span>
  )
}

function CPUUsage({ value }: { value?: number }) {
  let usageClassName = styles.low

  if (value) {
    if (value > 70) {
      usageClassName = styles.high
    } else if (value > 40) {
      usageClassName = styles.medium
    }
  }

  return (
    <span className={usageClassName}>{value && `${value.toFixed(2)}%`}</span>
  )
}
