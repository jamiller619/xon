import type { StatsPayload } from '@xon/shared'
import { Progress } from '@xon/ui'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import { type HTMLAttributes, useEffect, useState } from 'react'
import dashboardStyles from '../Dashboard.module.css'
import styles from './System.module.css'

type SystemProps = HTMLAttributes<HTMLDivElement>

export default function System({ className, ...props }: SystemProps) {
  const [data, setData] = useState<StatsPayload>({} as StatsPayload)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const eventSource = new EventSource('/api/stats')

    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data)
      setData(parsedData)
    }

    eventSource.onerror = (err) => {
      setError(JSON.stringify(err))
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  return (
    <section className={dashboardStyles.section} {...props}>
      <h2>System</h2>
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
            <dd>
              {data.uptime &&
                prettyMs(data.uptime * 1000, {
                  hideSeconds: true,
                })}
            </dd>
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
        </dl>
      </div>
    </section>
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
