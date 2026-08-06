import { css } from 'inline-css-modules'

const styles = css`
  .card {
    background: linear-gradient(90deg, #1a1a2e 25%, #222240 50%, #1a1a2e 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--border-radius-3);
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

type SkeletonCardProps = {
  aspectRatio?: string
}

export default function SkeletonCard({
  aspectRatio = '2 / 3',
}: SkeletonCardProps) {
  return <div className={styles.card} style={{ aspectRatio }} />
}
