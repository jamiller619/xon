import styles from './MediaCard.module.css'

export function getProgress(position = 0, duration?: number | null): number {
  if (!duration || duration <= 0) return 0

  return Math.min(100, Math.max(0, (position / duration) * 100))
}

export default function ProgressBar({
  title,
  value,
}: {
  title: string
  value: number
}) {
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-label={`Playback progress for ${title}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div className={styles.progressFill} style={{ width: `${value}%` }} />
    </div>
  )
}
